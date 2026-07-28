"""Fixtures compartilhadas.

Os testes que precisam do Postgres são pulados automaticamente quando não há
banco alcançável — assim `pytest` roda numa máquina sem infraestrutura, e o CI
(que sobe o serviço) executa a suíte inteira.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_token, hash_password
from app.db.session import AuthSessionLocal, auth_engine
from app.main import app
from app.models import (
    Apontamento,
    Auditoria,
    ChecklistItem,
    Cliente,
    ComentarioFornecedor,
    Contato,
    ConviteCliente,
    Criterio,
    Disciplina,
    Empresa,
    Evidencia,
    Modelo,
    NaoConformidade,
    NomenclaturaPadrao,
    Notificacao,
    Ocorrencia,
    Organizacao,
    Penalidade,
    Projeto,
    ResultadoCheck,
    Standard,
    TrilhaAuditoria,
    Usuario,
    VersaoModelo,
)
from app.models.enums import (
    PERMISSOES,
    Automacao,
    ChecklistTipo,
    CriterioNivel,
    MacroDisc,
    PapelUsuario,
    VersaoFormato,
)


def _banco_disponivel() -> bool:
    try:
        with auth_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


BANCO = _banco_disponivel()

requer_banco = pytest.mark.skipif(
    not BANCO, reason="Postgres indisponível (suba `docker compose up -d db`)"
)


def _storage_disponivel() -> bool:
    try:
        from app.services.storage import garantir_bucket

        garantir_bucket()
        return True
    except Exception:
        return False


STORAGE = _storage_disponivel()

requer_storage = pytest.mark.skipif(
    not STORAGE, reason="storage S3 indisponível (suba `docker compose up -d minio`)"
)

API = settings.api_prefix


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db() -> Iterator[Session]:
    """Sessão privilegiada (dono das tabelas) para montar e limpar cenário."""
    session = AuthSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# ---------------------------------------------------------------- cenário
class Cenario:
    """Uma organização isolada com um admin — a base de quase todo teste."""

    def __init__(self, org: Organizacao, admin: Usuario, projeto: Projeto) -> None:
        self.org = org
        self.admin = admin
        self.projeto = projeto

    def token(
        self, *, papel: PapelUsuario | None = None, permissoes: list[str] | None = None
    ) -> str:
        """Token do admin, ou de um papel/permissões fabricados para testar guardas."""
        return create_token(
            usuario_id=self.admin.id,
            org_id=self.org.id,
            papel=(papel or self.admin.papel).value,
            permissoes=list(PERMISSOES) if permissoes is None else permissoes,
        )

    def headers(self, **kw) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token(**kw)}"}


# Ordem de remoção: filhos antes dos pais.
_TABELAS_LIMPEZA = (
    ComentarioFornecedor,
    NaoConformidade,
    Ocorrencia,
    Evidencia,
    ResultadoCheck,
    Auditoria,
    VersaoModelo,
    Modelo,
    ChecklistItem,
    Criterio,
    Disciplina,
    NomenclaturaPadrao,
    Standard,
    Contato,
    Apontamento,
    ConviteCliente,
    # Antes de usuario/empresa: notificação e trilha referenciam usuário,
    # penalidade referencia empresa.
    TrilhaAuditoria,
    Notificacao,
    Penalidade,
    Usuario,
    Empresa,
    Projeto,
    # Depois de Projeto: é ele que referencia cliente. Sem esta linha a
    # organização não pode ser apagada no teardown — a FK segura — e o erro
    # aparece como IntegrityError num teste que já tinha passado.
    Cliente,
)


def _limpar_org(db: Session, org_id: uuid.UUID) -> None:
    for modelo in _TABELAS_LIMPEZA:
        db.execute(delete(modelo).where(modelo.org_id == org_id))
    db.execute(delete(Organizacao).where(Organizacao.id == org_id))
    db.commit()


@pytest.fixture
def cenario(db: Session) -> Iterator[Cenario]:
    sufixo = uuid.uuid4().hex[:8]
    org = Organizacao(nome=f"Org {sufixo}", slug=f"org-{sufixo}")
    db.add(org)
    db.flush()

    admin = Usuario(
        org_id=org.id,
        login=f"admin-{sufixo}@spbim.test",
        nome="Admin de Teste",
        senha_hash=hash_password("senha-de-teste-123"),
        papel=PapelUsuario.ADMIN,
        permissoes=list(PERMISSOES),
    )
    projeto = Projeto(
        org_id=org.id, codigo=f"P{sufixo.upper()}", nome="Projeto de teste", status="ativo"
    )
    db.add_all([admin, projeto])
    db.commit()

    try:
        yield Cenario(org, admin, projeto)
    finally:
        _limpar_org(db, org.id)


@pytest.fixture
def autenticado(client: TestClient, cenario: Cenario) -> Iterator[TestClient]:
    """TestClient já com o Bearer do admin do cenário."""
    client.headers.update(cenario.headers())
    yield client


class CenarioAuditavel(Cenario):
    """Cenário da Fase 2: cadastro pronto até o ponto de auditar.

    empresa → disciplina (checklist 'geral', áreas ADMIN/COLO1) → 4 critérios
    no checklist → modelo → versão V1. É o mínimo para uma auditoria existir.
    """

    def __init__(self, base: Cenario) -> None:
        super().__init__(base.org, base.admin, base.projeto)
        self.empresa: Empresa
        self.disciplina: Disciplina
        self.criterios: list[Criterio] = []
        self.modelo: Modelo
        self.versao: VersaoModelo


CODIGOS_CRITERIO = ("MODEL_NAME", "SHARED_COORD", "SATELLITE", "WORKSETS")


@pytest.fixture
def auditavel(db: Session, cenario: Cenario) -> Iterator[CenarioAuditavel]:
    c = CenarioAuditavel(cenario)
    org_id, projeto_id = cenario.org.id, cenario.projeto.id

    c.empresa = Empresa(org_id=org_id, nome="METASA", ferramenta="Tekla")
    db.add(c.empresa)
    db.flush()

    c.disciplina = Disciplina(
        org_id=org_id,
        projeto_id=projeto_id,
        codigo="STRC-STEEL",
        macro=MacroDisc.C,
        disc="STRC",
        sub="STEEL",
        projetista_id=c.empresa.id,
        checklists=[ChecklistTipo.GERAL],
        areas=["ADMIN", "COLO1"],
    )
    db.add(c.disciplina)
    db.flush()

    for ordem, codigo in enumerate(CODIGOS_CRITERIO, start=1):
        criterio = Criterio(
            org_id=org_id,
            projeto_id=projeto_id,
            codigo=codigo,
            nome_pt=f"Critério {codigo}",
            nome_en=f"Criterion {codigo}",
            categoria="Aspectos gerais",
            nivel=CriterioNivel.MODELO,
            automacao=Automacao.MANUAL,
        )
        db.add(criterio)
        db.flush()
        c.criterios.append(criterio)
        db.add(
            ChecklistItem(
                org_id=org_id,
                projeto_id=projeto_id,
                checklist=ChecklistTipo.GERAL,
                criterio_id=criterio.id,
                ordem=ordem,
            )
        )

    c.modelo = Modelo(
        org_id=org_id,
        projeto_id=projeto_id,
        codigo="CPQ11-C-STRC-STEEL-ADMIN-R22",
        disciplina_id=c.disciplina.id,
        instaladora_id=c.empresa.id,
        modeladora_id=c.empresa.id,
    )
    db.add(c.modelo)
    db.flush()

    c.versao = VersaoModelo(
        org_id=org_id, modelo_id=c.modelo.id, versao="V1", formato=VersaoFormato.IFC
    )
    db.add(c.versao)
    db.commit()

    yield c
