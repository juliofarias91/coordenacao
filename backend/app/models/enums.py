"""Enums do domínio — espelham 1:1 a seção 3.1 do plano técnico.

Os tipos nativos do Postgres são criados na migration 0001. Aqui eles são
declarados com `create_type=False` para que o SQLAlchemy nunca tente criá-los
por conta própria durante um `create_all` de teste.
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum as SAEnum


class MacroDisc(enum.StrEnum):
    """MACRODISCIPLINA: A=ARCH, C=CIVIL/ESTRUT, M=MEP, S=SITE."""

    A = "A"
    C = "C"
    M = "M"
    S = "S"


class EmpresaTipo(enum.StrEnum):
    PROPRIA = "propria"
    TERCEIRIZADA = "terceirizada"


class EmpresaPapel(enum.StrEnum):
    TRADE = "trade"                # instaladora
    BIM = "bim"                    # modeladora
    FORNECEDOR = "fornecedor"
    COORDENACAO = "coordenacao"


class VersaoFormato(enum.StrEnum):
    REVIT = "revit"
    IFC = "ifc"


class ChecklistTipo(enum.StrEnum):
    """Os recortes de auditoria. A ordem é a da progressão real de LOD, e
    importa: é ela que o Postgres guarda no tipo e que um `ORDER BY` sobre a
    coluna respeita. LOD300 e LOD350 entraram na migration 0004 — o enum ia de
    lod400 a lod500 direto, pulando justamente os dois níveis em que a
    coordenação mais trabalha."""

    GERAL = "geral"
    IFC = "ifc"
    QUATRO_D = "4d"
    LOD300 = "lod300"
    LOD350 = "lod350"
    LOD400 = "lod400"
    LOD500 = "lod500"


class CriterioNivel(enum.StrEnum):
    MODELO = "modelo"
    ELEMENTO = "elemento"


class Automacao(enum.StrEnum):
    AUTO = "auto"                            # nível 1 — extração de propriedades
    DESIGN_AUTOMATION = "design_automation"  # nível 2 — Revit headless
    MANUAL = "manual"                        # nível 3 — julgamento humano


class CheckStatus(enum.StrEnum):
    APROVADO = "aprovado"
    REPROVADO = "reprovado"
    PENDENTE = "pendente"
    NA = "na"


class OrigemResult(enum.StrEnum):
    AUTOMATICO = "automatico"
    MANUAL = "manual"


class AuditoriaEstado(enum.StrEnum):
    PUBLICADO = "publicado"
    NAO_PUBLICADO = "nao_publicado"
    DESATUALIZADO = "desatualizado"


class PapelUsuario(enum.StrEnum):
    ADMIN = "admin"
    COORDENADOR = "coordenador"
    AUDITOR = "auditor"
    REVISOR = "revisor"
    FORNECEDOR = "fornecedor"
    LEITOR = "leitor"
    CLIENTE = "cliente"


class NotifTipo(enum.StrEnum):
    AUDITORIA = "auditoria"
    ERRO = "erro"
    PENALIDADE = "penalidade"
    # Pedido de redefinição de senha (migration 0010). Categoria própria porque
    # é a única notificação que pede AÇÃO DE QUEM ADMINISTRA — as outras três
    # informam. Enfiá-la em `erro` a esconderia atrás do filtro errado.
    ACESSO = "acesso"


def pg_enum(py_enum: type[enum.Enum], name: str) -> SAEnum:
    """Tipo enum nativo do Postgres, criado pela migration (não pelo ORM)."""
    return SAEnum(
        py_enum,
        name=name,
        create_type=False,
        native_enum=True,
        values_callable=lambda e: [m.value for m in e],
    )


# Nome do tipo no banco -> enum Python. A migration 0001 itera sobre este mapa.
ENUM_TYPES: dict[str, type[enum.Enum]] = {
    "macro_disc": MacroDisc,
    "empresa_tipo": EmpresaTipo,
    "empresa_papel": EmpresaPapel,
    "versao_formato": VersaoFormato,
    "checklist_tipo": ChecklistTipo,
    "criterio_nivel": CriterioNivel,
    "automacao": Automacao,
    "check_status": CheckStatus,
    "origem_result": OrigemResult,
    "auditoria_estado": AuditoriaEstado,
    "papel_usuario": PapelUsuario,
    "notif_tipo": NotifTipo,
}

# Permissões finas (plano técnico, seção 5) — as mesmas do cadastro do protótipo.
PERMISSOES = (
    "ver_painel",
    "executar",
    "editar_biblioteca",
    "publicar",
    "gerar_relatorio",
    "ver_relatorios",
    "admin_cadastro",
)

# Permissões concedidas por papel quando o usuário não tem lista própria.
PERMISSOES_POR_PAPEL: dict[PapelUsuario, tuple[str, ...]] = {
    PapelUsuario.ADMIN: PERMISSOES,
    PapelUsuario.COORDENADOR: (
        "ver_painel", "executar", "editar_biblioteca",
        "publicar", "gerar_relatorio", "ver_relatorios", "admin_cadastro",
    ),
    PapelUsuario.AUDITOR: ("ver_painel", "executar", "ver_relatorios"),
    PapelUsuario.REVISOR: ("ver_painel", "publicar", "gerar_relatorio", "ver_relatorios"),
    PapelUsuario.FORNECEDOR: ("ver_painel", "ver_relatorios"),
    PapelUsuario.LEITOR: ("ver_painel", "ver_relatorios"),
    PapelUsuario.CLIENTE: (),   # só acessa GET /portal/{token}
}
