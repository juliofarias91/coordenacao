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
    Cliente,
    Contato,
    ConviteEquipe,
    Disciplina,
    Empresa,
    NomenclaturaPadrao,
    Organizacao,
    Projeto,
    ProjetoMembro,
    Standard,
    TokenAcesso,
    Usuario,
)
from app.models.colaboracao import (
    Apontamento,
    ConviteCliente,
    Notificacao,
    Penalidade,
    ReporteErro,
    TrilhaAuditoria,
)
from app.models.criterios import ChecklistItem, Criterio
from app.models.importacao import ImportacaoItem, ImportacaoPlanilha
from app.models.modelos import Modelo, VersaoModelo

__all__ = [
    "Base",
    # cadastro
    "Organizacao", "Cliente", "Projeto", "ProjetoMembro", "ConviteEquipe",
    "Empresa", "Contato", "Usuario",
    "TokenAcesso", "Standard", "NomenclaturaPadrao", "Disciplina",
    # critérios
    "Criterio", "ChecklistItem",
    # modelos
    "Modelo", "VersaoModelo",
    # auditoria
    "Auditoria", "ResultadoCheck", "Ocorrencia", "Evidencia",
    "NaoConformidade", "ComentarioFornecedor",
    # importação de planilha — PROVISÓRIA, ver a migration 0012
    "ImportacaoPlanilha", "ImportacaoItem",
    # colaboração
    "Apontamento", "Notificacao", "Penalidade", "ConviteCliente", "TrilhaAuditoria",
    "ReporteErro",
]

# Tabelas de negócio sujeitas a row-level security (todas menos organizacao,
# que é a raiz do tenant). A migration 0001 usa esta lista; `cliente` nasceu
# depois e ganha a policy na 0003, `projeto_membro` na 0004 — quem entrar aqui
# a partir de agora precisa de RLS na própria migration que cria a tabela.
TENANT_TABLES: tuple[str, ...] = (
    "cliente", "projeto_membro", "reporte_erro", "token_acesso",
    "projeto", "empresa", "contato", "usuario", "standard", "nomenclatura_padrao",
    "disciplina", "criterio", "checklist_item", "modelo", "versao_modelo",
    "auditoria", "resultado_check", "ocorrencia", "evidencia", "nao_conformidade",
    "comentario_fornecedor", "apontamento", "notificacao", "penalidade",
    "convite_cliente", "trilha_auditoria",
    # A 0012 já cria as policies destas duas; entram aqui para os testes, que
    # conferem a lista contra o `pg_policies`.
    "importacao_planilha", "importacao_item",
)
