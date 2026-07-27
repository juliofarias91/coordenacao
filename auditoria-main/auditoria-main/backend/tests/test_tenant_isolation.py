"""SP-004 · CA: usuário de uma organização nunca lê dado de outra.

O teste ataca a camada mais profunda — o row-level security do Postgres —
usando o papel de aplicação e sem nenhum filtro de `org_id` na consulta. Se a
policy não estiver valendo, o SELECT devolve as duas organizações e o teste
quebra.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, set_tenant
from app.models import Organizacao, Projeto, TrilhaAuditoria
from tests.conftest import requer_banco


def _semear(db: Session) -> tuple[uuid.UUID, uuid.UUID, str, str]:
    sufixo = uuid.uuid4().hex[:8]
    org_a = Organizacao(nome=f"SPBIM Teste A {sufixo}", slug=f"a-{sufixo}")
    org_b = Organizacao(nome=f"SPBIM Teste B {sufixo}", slug=f"b-{sufixo}")
    db.add_all([org_a, org_b])
    db.flush()

    cod_a, cod_b = f"AAA{sufixo}", f"BBB{sufixo}"
    db.add_all(
        [
            Projeto(org_id=org_a.id, codigo=cod_a, nome="Projeto da org A"),
            Projeto(org_id=org_b.id, codigo=cod_b, nome="Projeto da org B"),
        ]
    )
    db.commit()
    return org_a.id, org_b.id, cod_a, cod_b


def _limpar(db: Session, *org_ids: uuid.UUID) -> None:
    for org_id in org_ids:
        for projeto in db.execute(
            select(Projeto).where(Projeto.org_id == org_id)
        ).scalars():
            db.delete(projeto)
    db.commit()

    # Só depois: apagar os projetos acima gerou linhas de trilha novas
    # (SP-406), e são elas que prendem a organização.
    for org_id in org_ids:
        db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.org_id == org_id))
    db.commit()
    for org_id in org_ids:
        org = db.get(Organizacao, org_id)
        if org is not None:
            db.delete(org)
    db.commit()


@requer_banco
def test_rls_isola_projetos_entre_organizacoes(db: Session) -> None:
    org_a, org_b, cod_a, cod_b = _semear(db)
    try:
        # Sessão do papel de aplicação, amarrada ao tenant A.
        with SessionLocal() as app_session:
            set_tenant(app_session, org_a)
            codigos = set(
                app_session.execute(select(Projeto.codigo)).scalars().all()
            )
            assert cod_a in codigos
            assert cod_b not in codigos, "vazou projeto de outra organização"
    finally:
        _limpar(db, org_a, org_b)


@requer_banco
def test_rls_sem_tenant_nao_devolve_nada(db: Session) -> None:
    """Sessão sem tenant definido é negada por padrão, não liberada."""
    org_a, org_b, _, _ = _semear(db)
    try:
        with SessionLocal() as app_session:
            assert app_session.execute(select(Projeto)).scalars().all() == []
    finally:
        _limpar(db, org_a, org_b)


@requer_banco
def test_rls_bloqueia_escrita_em_outro_tenant(db: Session) -> None:
    """WITH CHECK: não dá para gravar carimbando o org_id de outra organização."""
    org_a, org_b, _, _ = _semear(db)
    try:
        with SessionLocal() as app_session:
            set_tenant(app_session, org_a)
            app_session.add(
                Projeto(org_id=org_b, codigo=f"X{uuid.uuid4().hex[:6]}", nome="invasor")
            )
            with pytest.raises(ProgrammingError):
                app_session.flush()
            app_session.rollback()
    finally:
        _limpar(db, org_a, org_b)
