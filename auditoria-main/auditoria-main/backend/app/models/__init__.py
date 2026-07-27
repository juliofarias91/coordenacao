"""Models SQLAlchemy. Importar daqui garante que o metadata esteja completo
(o `alembic/env.py` depende disso para o autogenerate)."""

from app.db.base import Base
from app.models.auditoria import (
    Auditoria,
    ComentarioFornecedor,
    Evidencia,
    NaoConformidade,
    Ocorrencia,
    ResultadoCheck,
)
from app.models.cadastro import (
    Contato,
    Disciplina,
    Empresa,
    NomenclaturaPadrao,
    Organizacao,
    Projeto,
    Standard,
    Usuario,
)
from app.models.colaboracao import (
    Apontamento,
    ConviteCliente,
    Notificacao,
    Penalidade,
    TrilhaAuditoria,
)
from app.models.criterios import ChecklistItem, Criterio
from app.models.modelos import Modelo, VersaoModelo

__all__ = [
    "Base",
    # cadastro
    "Organizacao", "Projeto", "Empresa", "Contato", "Usuario",
    "Standard", "NomenclaturaPadrao", "Disciplina",
    # critérios
    "Criterio", "ChecklistItem",
    # modelos
    "Modelo", "VersaoModelo",
    # auditoria
    "Auditoria", "ResultadoCheck", "Ocorrencia", "Evidencia",
    "NaoConformidade", "ComentarioFornecedor",
    # colaboração
    "Apontamento", "Notificacao", "Penalidade", "ConviteCliente", "TrilhaAuditoria",
]

# Tabelas de negócio sujeitas a row-level security (todas menos organizacao,
# que é a raiz do tenant). A migration 0001 usa esta lista.
TENANT_TABLES: tuple[str, ...] = (
    "projeto", "empresa", "contato", "usuario", "standard", "nomenclatura_padrao",
    "disciplina", "criterio", "checklist_item", "modelo", "versao_modelo",
    "auditoria", "resultado_check", "ocorrencia", "evidencia", "nao_conformidade",
    "comentario_fornecedor", "apontamento", "notificacao", "penalidade",
    "convite_cliente", "trilha_auditoria",
)
