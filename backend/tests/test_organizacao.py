"""SP-106 · A organização vista de dentro.

A visão geral da administração sai de uma requisição só. O que se protege aqui
é que as contagens sejam do TENANT DO TOKEN — um resumo que somasse a
plataforma inteira contaria ao admin de um cliente quantos projetos os outros
têm, e seria o vazamento mais discreto possível: um número, sem nome nenhum.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Cliente, Organizacao, Projeto, TrilhaAuditoria
from tests.conftest import API, Cenario, requer_banco


def _limpar(db: Session, org_id: uuid.UUID) -> None:
    """Apaga uma organização fabricada, na ordem que as FKs exigem.

    `rollback` primeiro porque uma asserção que falhe deixa a transação
    abortada — e aí toda a limpeza seria ignorada, deixando a organização
    presa no banco para os testes seguintes. A trilha vem antes de tudo: a
    escrita é automática (SP-406), então até um `POST` de teste deixa linha
    apontando para a organização.
    """
    db.rollback()
    db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.org_id == org_id))
    db.execute(delete(Projeto).where(Projeto.org_id == org_id))
    db.execute(delete(Cliente).where(Cliente.org_id == org_id))
    db.execute(delete(Organizacao).where(Organizacao.id == org_id))
    db.commit()


@requer_banco
def test_resumo_traz_organizacao_e_contagens(autenticado: TestClient, cenario: Cenario) -> None:
    resp = autenticado.get(f"{API}/organizacao")
    assert resp.status_code == 200, resp.text
    corpo = resp.json()

    assert corpo["organizacao"]["id"] == str(cenario.org.id)
    assert corpo["organizacao"]["nome"] == cenario.org.nome
    # O cenário tem um projeto e um admin; o resto pode ser zero.
    assert corpo["projetos"] >= 1
    assert corpo["usuarios"] >= 1
    assert corpo["usuarios_ativos"] >= 1
    for chave in ("clientes", "empresas"):
        assert chave in corpo, f"o resumo deixou de contar {chave}"


@requer_banco
def test_contagem_de_clientes_acompanha_o_cadastro(autenticado: TestClient) -> None:
    """Cliente virou entidade na 0003 e ficou de fora do resumo até 29/07."""
    antes = autenticado.get(f"{API}/organizacao").json()["clientes"]
    criado = autenticado.post(f"{API}/clientes", json={"nome": f"Novo {uuid.uuid4().hex[:6]}"})
    assert criado.status_code == 201, criado.text

    assert autenticado.get(f"{API}/organizacao").json()["clientes"] == antes + 1


@requer_banco
def test_contagens_nao_somam_outra_organizacao(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """O resumo é agregado, e agregado é onde vazamento passa despercebido:
    não há nome na tela para denunciar que o número veio de outro tenant."""
    antes = autenticado.get(f"{API}/organizacao").json()

    sufixo = uuid.uuid4().hex[:8]
    outra = Organizacao(nome=f"Outra {sufixo}", slug=f"outra-{sufixo}")
    db.add(outra)
    db.flush()
    intruso = Cliente(org_id=outra.id, nome=f"Cliente alheio {sufixo}")
    alheio = Projeto(org_id=outra.id, codigo=f"ALH{sufixo[:5].upper()}", nome="Projeto alheio")
    db.add_all([intruso, alheio])
    db.commit()

    outra_id = outra.id
    try:
        depois = autenticado.get(f"{API}/organizacao").json()
        assert depois["clientes"] == antes["clientes"], "contou cliente de outra organização"
        assert depois["projetos"] == antes["projetos"], "contou projeto de outra organização"
        assert depois["organizacao"]["id"] == str(cenario.org.id)
    finally:
        _limpar(db, outra_id)


@requer_banco
def test_renomear_exige_admin_de_cadastro(client: TestClient, cenario: Cenario) -> None:
    """Ver o resumo basta `ver_painel`; renomear a organização, não."""
    so_leitura = cenario.headers(permissoes=["ver_painel"])
    assert client.get(f"{API}/organizacao", headers=so_leitura).status_code == 200

    resp = client.patch(f"{API}/organizacao", json={"nome": "Renomeada"}, headers=so_leitura)
    assert resp.status_code == 403


@requer_banco
def test_slug_repetido_e_conflito(autenticado: TestClient, db: Session) -> None:
    """O slug é único no banco INTEIRO, não por tenant: é ele que resolve a
    organização no login, antes de existir token."""
    sufixo = uuid.uuid4().hex[:8]
    vizinha = Organizacao(nome=f"Vizinha {sufixo}", slug=f"vizinha-{sufixo}")
    db.add(vizinha)
    db.commit()

    vizinha_id = vizinha.id
    try:
        resp = autenticado.patch(f"{API}/organizacao", json={"slug": f"vizinha-{sufixo}"})
        assert resp.status_code == 409, resp.text
    finally:
        _limpar(db, vizinha_id)
