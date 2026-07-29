"""Membros de projeto (migration 0004) — API, unicidade e isolamento.

O que se protege aqui é o motivo de a tabela existir e o limite do que ela faz:
ela responde "quem está neste projeto", e NÃO autoriza nada. Um teste que
confundisse as duas coisas viraria, na primeira leitura futura, licença para
alguém "corrigir" a API e transformar participação em permissão sem perceber.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Organizacao, Projeto, ProjetoMembro, TrilhaAuditoria, Usuario
from app.models.enums import PERMISSOES, PapelUsuario
from tests.conftest import API, Cenario, requer_banco


def _usuario(autenticado: TestClient, sufixo: str) -> dict:
    """Cria alguém pela API, para ser o membro."""
    resp = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": f"membro-{sufixo}@spbim.com.br",
            "nome": f"Membro {sufixo}",
            "papel": "auditor",
            "senha": "senha-de-teste-123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@requer_banco
def test_adicionar_e_listar(autenticado: TestClient, cenario: Cenario) -> None:
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])

    resp = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": pessoa["id"], "papel": "coordenador", "funcao": "Coordenação 4D"},
    )
    assert resp.status_code == 201, resp.text
    criado = resp.json()
    assert criado["papel"] == "coordenador"
    assert criado["funcao"] == "Coordenação 4D"
    # Os derivados: a tela lista pessoas, não ids.
    assert criado["usuario_nome"] == pessoa["nome"]
    assert criado["usuario_login"] == pessoa["login"]
    # O papel NA ORGANIZAÇÃO vem junto e é DIFERENTE do papel no projeto — é o
    # par que responde o que a pessoa consegue fazer de fato.
    assert criado["usuario_papel_org"] == "auditor"

    lista = autenticado.get(f"{API}/projetos/{cenario.projeto.id}/membros").json()
    assert any(m["id"] == criado["id"] for m in lista)


@requer_banco
def test_a_mesma_pessoa_nao_entra_duas_vezes(autenticado: TestClient, cenario: Cenario) -> None:
    """Sem a unicidade, "adicionar" duas vezes criaria dois vínculos com papéis
    diferentes e nada diria qual vale."""
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])
    corpo = {"usuario_id": pessoa["id"], "papel": "auditor"}

    assert (
        autenticado.post(f"{API}/projetos/{cenario.projeto.id}/membros", json=corpo).status_code
        == 201
    )
    repetido = autenticado.post(f"{API}/projetos/{cenario.projeto.id}/membros", json=corpo)
    assert repetido.status_code == 409, repetido.text


@requer_banco
def test_papel_no_projeto_e_independente_do_papel_na_organizacao(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """É a razão de a tabela existir: a mesma pessoa é coordenadora num projeto
    e leitora noutro, sem que o papel de organização mude."""
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])  # papel org: auditor

    membro = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": pessoa["id"], "papel": "leitor"},
    ).json()

    assert membro["papel"] == "leitor"
    assert membro["usuario_papel_org"] == "auditor"
    # E o cadastro do usuário não foi tocado.
    assert autenticado.get(f"{API}/usuarios").json()["itens"]
    perfil = next(
        u for u in autenticado.get(f"{API}/usuarios").json()["itens"] if u["id"] == pessoa["id"]
    )
    assert perfil["papel"] == "auditor", "virar membro alterou o papel de organização"


@requer_banco
def test_participacao_nao_e_permissao(client: TestClient, cenario: Cenario, db: Session) -> None:
    """A GUARDA CONTINUA SENDO A PERMISSÃO DE ORGANIZAÇÃO.

    Este teste existe para travar uma decisão, não um comportamento acidental:
    `projeto_membro` registra participação e NÃO autoriza. Se um dia alguém
    ligar as duas coisas, que seja de propósito — e que este teste falhe e
    obrigue a pensar, em vez de a mudança passar despercebida.
    """
    sufixo = uuid.uuid4().hex[:6]
    pessoa = Usuario(
        org_id=cenario.org.id,
        login=f"sem-poder-{sufixo}@spbim.com.br",
        nome="Sem poder",
        senha_hash=hash_password("senha-de-teste-123"),
        papel=PapelUsuario.LEITOR,
        permissoes=["ver_painel"],
    )
    db.add(pessoa)
    db.commit()

    # Membro do projeto, e coordenador NELE.
    membro = ProjetoMembro(
        org_id=cenario.org.id,
        projeto_id=cenario.projeto.id,
        usuario_id=pessoa.id,
        papel=PapelUsuario.COORDENADOR,
    )
    db.add(membro)
    db.commit()

    # Mesmo assim, sem `admin_cadastro` no token, não administra nada.
    so_leitura = cenario.headers(permissoes=["ver_painel"])
    resp = client.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": str(pessoa.id), "papel": "auditor"},
        headers=so_leitura,
    )
    assert resp.status_code == 403, "ser coordenador do projeto passou a autorizar — decisão mudou?"


@requer_banco
def test_remover_membro_nao_apaga_a_pessoa(autenticado: TestClient, cenario: Cenario) -> None:
    """Sair de um projeto não pode reescrever o que já foi decidido nele."""
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])
    membro = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": pessoa["id"], "papel": "auditor"},
    ).json()

    assert autenticado.delete(f"{API}/membros/{membro['id']}").status_code == 204

    logins = {u["id"] for u in autenticado.get(f"{API}/usuarios").json()["itens"]}
    assert pessoa["id"] in logins, "remover do projeto apagou a conta"


@requer_banco
def test_membro_de_outra_organizacao_nao_aparece(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """A tabela nasceu na 0004, depois das policies da 0001 — sem a policy
    própria na migration, os membros de um tenant vazariam para o outro."""
    sufixo = uuid.uuid4().hex[:8]
    outra = Organizacao(nome=f"Outra {sufixo}", slug=f"outra-{sufixo}")
    db.add(outra)
    db.flush()
    alheio = Projeto(org_id=outra.id, codigo=f"ALH{sufixo[:5].upper()}", nome="Projeto alheio")
    intruso = Usuario(
        org_id=outra.id,
        login=f"intruso-{sufixo}@outra.com",
        nome="Intruso",
        senha_hash=hash_password("senha-de-teste-123"),
        papel=PapelUsuario.ADMIN,
        permissoes=list(PERMISSOES),
    )
    db.add_all([alheio, intruso])
    db.flush()
    vinculo = ProjetoMembro(
        org_id=outra.id,
        projeto_id=alheio.id,
        usuario_id=intruso.id,
        papel=PapelUsuario.COORDENADOR,
    )
    db.add(vinculo)
    db.commit()

    vinculo_id, alheio_id, outra_id = vinculo.id, alheio.id, outra.id
    try:
        # O projeto alheio nem existe daqui — 404, não 403.
        assert autenticado.get(f"{API}/projetos/{alheio_id}/membros").status_code == 404
        # E o vínculo dele não é alcançável por id.
        assert (
            autenticado.patch(f"{API}/membros/{vinculo_id}", json={"papel": "leitor"}).status_code
            == 404
        )
    finally:
        # `rollback` primeiro: uma asserção que falhe deixa a transação
        # abortada, e aí toda a limpeza seria ignorada.
        db.rollback()
        db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.org_id == outra_id))
        db.execute(delete(ProjetoMembro).where(ProjetoMembro.org_id == outra_id))
        db.execute(delete(Usuario).where(Usuario.org_id == outra_id))
        db.execute(delete(Projeto).where(Projeto.org_id == outra_id))
        db.execute(delete(Organizacao).where(Organizacao.id == outra_id))
        db.commit()


@requer_banco
def test_checklists_lod300_e_lod350_existem(autenticado: TestClient, cenario: Cenario) -> None:
    """A outra metade da 0004: o enum ia de lod400 a lod500 direto, pulando os
    dois níveis em que a coordenação mais trabalha."""
    for checklist in ("lod300", "lod350"):
        resp = autenticado.get(
            f"{API}/projetos/{cenario.projeto.id}/matriz", params={"checklist": checklist}
        )
        assert resp.status_code == 200, f"{checklist}: {resp.text}"
        assert resp.json()["checklist"] == checklist
