"""Enums do domínio — espelham 1:1 a seção 3.1 do plano técnico.

Os tipos nativos do Postgres são criados na migration 0001. Aqui eles são
declarados com `create_type=False` para que o SQLAlchemy nunca tente criá-los
por conta própria durante um `create_all` de teste.
"""

from __future__ import annotations

import enum
from collections.abc import Iterable

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
    # O QUE SEPARA `Admin` DE `Super admin` (05/08/2026, a pedido). Sem ela os
    # dois eram indistinguíveis: `admin` e `coordenador` tinham conjuntos
    # IDÊNTICOS, e as seis telas do painel administrativo exigiam a mesma
    # `admin_cadastro` — não havia como dar "parte do painel" a alguém.
    #
    # É o que cuida da PLATAFORMA, não do trabalho: hoje, a identidade da
    # organização (nome e slug). Cadastrar cliente, projeto e usuário continua
    # em `admin_cadastro`, que é o que o Admin tem.
    #
    # ELA ENTRA SOZINHA NO SUPER ADMIN, e isso não é sorte: `PERMISSOES_POR_PAPEL`
    # dá a `ADMIN` a tupla INTEIRA e a `COORDENADOR` uma lista explícita. Toda
    # permissão nova nasce só no super admin até alguém a listar noutro papel —
    # que é o lado seguro para errar.
    "admin_total",
)

# --------------------------------------------------- páginas ocultas por conta
#
# AS TELAS QUE UMA CONTA NÃO VÊ moram na MESMA coluna `usuario.permissoes`, com
# este prefixo. É `ARRAY(Text)` desde a 0001, então isto NÃO PEDE MIGRATION — e
# não pedir foi requisito, não conveniência.
#
# GUARDA AS OCULTAS, NUNCA AS VISÍVEIS. Com a lista de visíveis, toda tela nova
# nasceria invisível para todas as contas já cadastradas, e alguém teria de
# reabrir uma por uma para liberá-la. `oculta:` ausente = vê tudo, que é o que
# toda conta anterior a isto sempre significou.
#
# ⚠ O PREFIXO NUNCA CHEGA AO TOKEN, e é isso que impede o desastre. Em
# `deps.py`, `perms = payload.get("perms") or PERMISSOES_POR_PAPEL[papel]`:
# LISTA NÃO VAZIA DESLIGA O PADRÃO DO PAPEL. Sem o filtro, esconder uma página
# de quem herda as permissões do papel encheria a lista com uma entrada inerte e
# tiraria dessa pessoa TODAS as permissões reais de uma vez.
#
# Quem filtra é `_permissoes()`, em `api/v1/auth.py` — funil único por onde
# passam o token E o `/auth/me`. Por isso `requer_permissao` comprovadamente
# nunca vê uma destas entradas, e `test_pagina_oculta_nao_autoriza` tranca isso.
PREFIXO_PAGINA = "oculta:"

def permissoes_reais(permissoes: Iterable[str]) -> list[str]:
    """A metade da coluna que AUTORIZA — sem as telas escondidas."""
    return [p for p in permissoes if not p.startswith(PREFIXO_PAGINA)]


def paginas_ocultas(permissoes: Iterable[str]) -> list[str]:
    """A outra metade: as telas escondidas, sem o prefixo.

    As duas funções moram aqui, junto do prefixo, e não na rota que as usa: elas
    são consumidas por `api/v1/auth.py` (token e `/auth/me`), `api/v1/membros.py`
    (a gaveta de membro de projeto) e `api/v1/usuarios.py` (a rota que grava).
    Uma cópia em cada uma seria três lugares para o `startswith` divergir.
    """
    return sorted(
        p.removeprefix(PREFIXO_PAGINA) for p in permissoes if p.startswith(PREFIXO_PAGINA)
    )


# O vocabulário do que se pode esconder: as telas DE UM PROJETO, e só elas.
#
# AS GLOBAIS SAÍRAM EM 05/08/2026, a pedido. Elas são a home, os KPIs da
# organização, a importação, os apontamentos — o chão de quem usa a plataforma,
# não o trabalho de um projeto. Esconder a home deixa a pessoa sem ponto de
# partida, e o pedido é outro: dizer, dentro de um projeto, o que cada um
# acompanha nele.
#
# Também não entram as do painel administrativo (já barradas por
# `admin_cadastro`, e esconder o que a permissão já nega é dizer a mesma coisa em
# dois lugares que podem discordar) nem as de `Configurações` da conta — ninguém
# deve poder esconder de alguém a própria senha.
#
# É a lista de `rota` de `ITENS_PROJETO`, em `frontend/src/layout/nav.ts`.
# Duplicação de vocabulário entre back e front, como `SENHA_MINIMA`, e pelo mesmo
# motivo: sem ela, um erro de digitação viraria uma página oculta que não
# corresponde a tela nenhuma — invisível na gaveta, que desenha só as telas que
# conhece, e sem caminho pela interface para tirá-la. `test_contrato.py` confere
# que os dois lados batem: ele LÊ o `nav.ts`.
# `ficha`, `peb` e `mandate` SAÍRAM em 07/08/2026, a pedido: as três viraram
# abas de `Configurações do projeto` e deixaram de ser entradas do menu. Quem as
# esconde agora esconde `configuracao`, como já acontecia com Disciplinas,
# Projetistas e Nomenclaturas — o vocabulário é o das TELAS DA BARRA, e aba não
# é tela da barra. Contas que tenham `oculta:ficha` gravado de antes não quebram:
# a entrada não corresponde a tela nenhuma e é simplesmente ignorada ao desenhar
# a gaveta; ela sai da coluna no primeiro salvamento das páginas dessa conta.
PAGINAS_OCULTAVEIS = (
    "kpis",
    "configuracao",
    "criterios",
    "modelos",
    # `membros` é a tela DE MEMBROS DO PROJETO — não a global de mesmo nome.
    "membros",
    "auditoria/geral",
    "auditoria/4d",
    "auditoria/lod300",
    "auditoria/lod400",
    "auditoria/lod500",
    "relatorios",
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
