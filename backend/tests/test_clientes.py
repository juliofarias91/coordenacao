"""Cliente como entidade (migration 0003) — API, pastas da home e isolamento.

O que se protege aqui é o motivo de o cliente ter deixado de ser texto: nome
que só difere na caixa é o MESMO cliente, e apagar um cliente não pode levar
junto o histórico dos projetos dele.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Cliente, Organizacao, Projeto, TrilhaAuditoria
from tests.conftest import API, Cenario, requer_banco


@requer_banco
def test_criar_e_listar(autenticado: TestClient) -> None:
    resp = autenticado.post(
        f"{API}/clientes",
        # `.test` é TLD reservado e o email-validator recusa — daí um domínio real.
        json={"nome": "Vale S.A.", "contato": "Ana", "email": "ana@vale.com"},
    )
    assert resp.status_code == 201, resp.text
    criado = resp.json()
    assert criado["nome"] == "Vale S.A."
    assert criado["status"] == "ativo"

    lista = autenticado.get(f"{API}/clientes").json()["itens"]
    assert any(c["id"] == criado["id"] for c in lista)


@requer_banco
def test_nome_repetido_em_outra_caixa_e_conflito(autenticado: TestClient) -> None:
    """É a razão de existir da entidade: com texto livre, 'Microsoft' e
    'microsoft' viravam duas pastas na home."""
    autenticado.post(f"{API}/clientes", json={"nome": "Petrobras"})
    repetido = autenticado.post(f"{API}/clientes", json={"nome": "  petrobras  "})
    assert repetido.status_code == 409


@requer_banco
def test_espacos_nas_bordas_somem(autenticado: TestClient) -> None:
    resp = autenticado.post(f"{API}/clientes", json={"nome": "  Braskem  "})
    assert resp.status_code == 201
    assert resp.json()["nome"] == "Braskem"


@requer_banco
def test_pastas_trazem_a_contagem_de_projetos(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    cliente = autenticado.post(f"{API}/clientes", json={"nome": "Cliente com obra"}).json()
    vazio = autenticado.post(f"{API}/clientes", json={"nome": "Cliente sem obra"}).json()

    projeto = db.get(Projeto, cenario.projeto.id)
    assert projeto is not None
    projeto.cliente_id = uuid.UUID(cliente["id"])
    db.commit()

    pastas = {p["id"]: p for p in autenticado.get(f"{API}/clientes/pastas").json()}
    assert pastas[cliente["id"]]["projetos"] == 1
    # Cliente recém-criado precisa aparecer: se sumisse, cadastrá-lo pareceria
    # ter falhado. É o LEFT JOIN da consulta.
    assert pastas[vazio["id"]]["projetos"] == 0


@requer_banco
def test_apagar_cliente_nao_apaga_projeto(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """`ON DELETE SET NULL`: o projeto perde o cliente, não a existência."""
    cliente = autenticado.post(f"{API}/clientes", json={"nome": "Some depois"}).json()
    projeto = db.get(Projeto, cenario.projeto.id)
    assert projeto is not None
    projeto.cliente_id = uuid.UUID(cliente["id"])
    db.commit()

    assert autenticado.delete(f"{API}/clientes/{cliente['id']}").status_code == 204

    db.expire_all()
    sobreviveu = db.get(Projeto, cenario.projeto.id)
    assert sobreviveu is not None, "apagar o cliente levou o projeto junto"
    assert sobreviveu.cliente_id is None


@requer_banco
def test_projeto_devolve_o_nome_do_cliente(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """`cliente_nome` é derivado: a tabela de projetos mostra de quem é o
    projeto sem uma consulta por linha."""
    cliente = autenticado.post(f"{API}/clientes", json={"nome": "Dona da obra"}).json()
    resp = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}", json={"cliente_id": cliente["id"]}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["cliente_nome"] == "Dona da obra"
    assert resp.json()["cliente_id"] == cliente["id"]


@requer_banco
def test_cliente_de_outra_organizacao_nao_aparece(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """A tabela nasceu depois da 0001, que criou as policies das outras 23 —
    sem a policy própria na 0003, o cliente de um tenant vazaria para o outro."""
    sufixo = uuid.uuid4().hex[:8]
    outra = Organizacao(nome=f"Outra {sufixo}", slug=f"outra-{sufixo}")
    db.add(outra)
    db.flush()
    intruso = Cliente(org_id=outra.id, nome=f"Intruso {sufixo}")
    db.add(intruso)
    db.commit()

    intruso_id, outra_id = intruso.id, outra.id
    try:
        nomes = {c["nome"] for c in autenticado.get(f"{API}/clientes").json()["itens"]}
        assert f"Intruso {sufixo}" not in nomes, "vazou cliente de outra organização"
        assert autenticado.get(f"{API}/clientes/{intruso_id}").status_code == 404
    finally:
        # Por id e nesta ordem. Criar o cliente gerou linha de trilha (SP-406),
        # e é ela que prende a organização — o mesmo cuidado que
        # `test_tenant_isolation` já documenta. `rollback` primeiro porque uma
        # asserção que falhe deixa a transação abortada, e aí toda a limpeza
        # seria ignorada.
        db.rollback()
        db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.org_id == outra_id))
        db.execute(delete(Cliente).where(Cliente.id == intruso_id))
        db.execute(delete(Organizacao).where(Organizacao.id == outra_id))
        db.commit()


@requer_banco
def test_sem_permissao_nao_cria(client: TestClient, cenario: Cenario) -> None:
    sem_admin = cenario.headers(permissoes=["ver_painel"])
    resp = client.post(f"{API}/clientes", json={"nome": "Não deveria entrar"}, headers=sem_admin)
    assert resp.status_code == 403
