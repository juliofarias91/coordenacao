"""Reporte de erro do sistema (migration 0005).

O que se protege aqui é a ASSIMETRIA DE PERMISSÃO, que é o ponto da feature:

  ESCREVER  qualquer pessoa autenticada — quem não consegue usar uma tela é
            justamente quem precisa avisar.
  LER       só `admin_cadastro` — o reporte carrega print, e print de tela de
            auditoria mostra dado de projeto.

Se alguém "uniformizar" as duas guardas um dia, estes testes falham e obrigam a
decidir de novo.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Organizacao, ReporteErro, TrilhaAuditoria, Usuario
from app.models.enums import PapelUsuario
from tests.conftest import API, Cenario, requer_banco


@requer_banco
def test_qualquer_autenticado_reporta(client: TestClient, cenario: Cenario) -> None:
    """SEM `admin_cadastro`, e de propósito: um leitor que não consegue abrir
    uma tela precisa poder avisar."""
    so_leitura = cenario.headers(permissoes=["ver_painel"])
    resp = client.post(
        f"{API}/reportes",
        json={
            "titulo": "A matriz não abre",
            "descricao": "Cliquei em LOD400 e a tela ficou branca.",
            "caminho": "/projetos/abc/auditoria/lod400",
        },
        headers=so_leitura,
    )
    assert resp.status_code == 201, resp.text
    corpo = resp.json()
    assert corpo["status"] == "aberto"
    # O caminho vai junto sem ninguém digitar — é o que transforma "não
    # funciona" num chamado que já começa com metade da resposta.
    assert corpo["caminho"] == "/projetos/abc/auditoria/lod400"
    # E o autor é resolvido para nome/login, não devolvido como id cru.
    assert corpo["usuario_id"] == str(cenario.admin.id)
    assert corpo["usuario_login"] == cenario.admin.login


@requer_banco
def test_so_admin_le_os_reportes(client: TestClient, cenario: Cenario) -> None:
    """A LISTA É FECHADA. O print mostra dado de projeto; uma lista aberta a
    todos viraria vazamento lateral entre equipes da mesma organização."""
    so_leitura = cenario.headers(permissoes=["ver_painel"])
    client.post(f"{API}/reportes", json={"titulo": "Algo quebrou"}, headers=so_leitura)

    assert client.get(f"{API}/reportes", headers=so_leitura).status_code == 403
    assert client.get(f"{API}/reportes", headers=cenario.headers()).status_code == 200


@requer_banco
def test_admin_responde_e_muda_status(autenticado: TestClient) -> None:
    criado = autenticado.post(f"{API}/reportes", json={"titulo": "Erro no upload"}).json()

    resp = autenticado.patch(
        f"{API}/reportes/{criado['id']}",
        json={"status": "resolvido", "resposta": "Era o limite de 512 MB. Documentado."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "resolvido"
    assert "512 MB" in resp.json()["resposta"]


@requer_banco
def test_o_relato_de_outra_pessoa_nao_se_reescreve(autenticado: TestClient) -> None:
    """Título e descrição não entram no `ReporteUpdate`: são o que a pessoa de
    fato disse, e é o dado mais valioso do reporte."""
    criado = autenticado.post(
        f"{API}/reportes", json={"titulo": "Original", "descricao": "Como aconteceu"}
    ).json()

    autenticado.patch(f"{API}/reportes/{criado['id']}", json={"titulo": "Reescrito"})

    depois = autenticado.get(f"{API}/reportes").json()["itens"]
    alvo = next(r for r in depois if r["id"] == criado["id"])
    assert alvo["titulo"] == "Original", "o relato de outra pessoa foi reescrito"


@requer_banco
def test_filtro_por_status(autenticado: TestClient) -> None:
    aberto = autenticado.post(f"{API}/reportes", json={"titulo": "Fica aberto"}).json()
    fechado = autenticado.post(f"{API}/reportes", json={"titulo": "Vai fechar"}).json()
    autenticado.patch(f"{API}/reportes/{fechado['id']}", json={"status": "resolvido"})

    abertos = {r["id"] for r in autenticado.get(f"{API}/reportes?status=aberto").json()["itens"]}
    assert aberto["id"] in abertos
    assert fechado["id"] not in abertos


@requer_banco
def test_reporte_de_outra_organizacao_nao_aparece(autenticado: TestClient, db: Session) -> None:
    """A tabela nasceu na 0005, depois das policies da 0001 — sem a policy
    própria na migration, os reportes de um tenant vazariam para o outro, com
    print e tudo."""
    sufixo = uuid.uuid4().hex[:8]
    outra = Organizacao(nome=f"Outra {sufixo}", slug=f"outra-{sufixo}")
    db.add(outra)
    db.flush()
    intruso = Usuario(
        org_id=outra.id,
        login=f"intruso-{sufixo}@outra.com",
        nome="Intruso",
        senha_hash=hash_password("senha-de-teste-123"),
        papel=PapelUsuario.ADMIN,
        permissoes=["ver_painel", "admin_cadastro"],
    )
    db.add(intruso)
    db.flush()
    alheio = ReporteErro(org_id=outra.id, usuario_id=intruso.id, titulo=f"Sigiloso {sufixo}")
    db.add(alheio)
    db.commit()

    alheio_id, outra_id = alheio.id, outra.id
    try:
        titulos = {r["titulo"] for r in autenticado.get(f"{API}/reportes").json()["itens"]}
        assert f"Sigiloso {sufixo}" not in titulos, "vazou reporte de outra organização"
        assert (
            autenticado.patch(
                f"{API}/reportes/{alheio_id}", json={"status": "recusado"}
            ).status_code
            == 404
        )
    finally:
        db.rollback()
        db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.org_id == outra_id))
        db.execute(delete(ReporteErro).where(ReporteErro.org_id == outra_id))
        db.execute(delete(Usuario).where(Usuario.org_id == outra_id))
        db.execute(delete(Organizacao).where(Organizacao.id == outra_id))
        db.commit()
