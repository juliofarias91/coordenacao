"""O gabarito do LOD 300 — a aba `Spec Audit LOD300_<DISC>`.

A REFERÊNCIA é `AUDITORIA\\LOD 300\\Spec Audit LOD300_STRC.pdf` e a planilha ao
lado dele, aba `STRC`: 60 linhas em 4 categorias de elemento.

ESTE GABARITO É POR DISCIPLINA, e é a diferença estrutural com o da auditoria
geral. Os 17 itens da geral são os mesmos nas oito disciplinas — o que varia é a
resposta. Aqui a PERGUNTA muda: FLOOR, STRUCTURAL COLUMNS, STRUCTURAL
FOUNDATIONS e STRUCTURAL FRAMING são categorias do Revit de estrutura, e a
ARCH terá paredes, portas e montantes de fachada. Por isso `GABARITOS_LOD` é
indexado pelo código da disciplina, e **hoje só STRC existe**: é a única para a
qual há arquivo de referência. Pedir o gabarito de uma disciplina sem arquivo
responde dizendo quais existem, em vez de semear uma lista inventada.

A ESTRUTURA É DE DOIS NÍVEIS — elemento × informação — e ela cabe no modelo que
já existe sem tabela nova:

    ELEMENT              → `Criterio.categoria`      (agrupa na tela)
    INFORMATION          → `Criterio.nome_pt/_en`    (a linha)
    BIM FORUM DESCRIPTION→ `Criterio.criterio_aceitacao`
    LOD                  → `ChecklistItem.min_lod`
    REVIT PARAMETER      → `Criterio.parametro_esperado`, quando canônico
    IMAGE                → `Criterio.referencia_url`

O MESMO NOME DE INFORMAÇÃO REPETE ENTRE ELEMENTOS e cada repetição é um critério
PRÓPRIO, não um compartilhado. "Level" na laje é o built-in `Level`; no pilar é
`Base Level`. "Width" na laje é geometria; no pilar é o parâmetro `b`. Um
critério só para os dois teria de escolher um dos dois mapeamentos e estaria
errado na metade das linhas. É o oposto da política da biblioteca — lá o
critério canônico é reusado entre checklists de propósito —, e a diferença é
que ali o mesmo texto significa a mesma coisa.

QUAL É `parametro_esperado` E QUAL NÃO É. Só entra onde o built-in é a resposta
canônica da categoria (Family, Type, Level, Assembly code, Description,
Manufacturer, Structural Material…). Onde a planilha deixou a coluna em branco,
ela ficou em branco: naquelas linhas o que se audita é GEOMETRIA (a laje tem
espessura modelada?), não a presença de um parâmetro, e inventar um nome de
built-in ali faria o verificador automático reprovar modelos corretos. Ver
`services/automacao/executor.py`: é `parametro_esperado` que torna um critério
automatizável, então preenchê-lo tem consequência.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.enums import Automacao, CriterioNivel

# --- os textos do BIM Forum, que repetem entre categorias -------------------
# Um nome por texto em vez do texto repetido 4 vezes: se o BIM Forum revisar a
# frase, ela muda num lugar.
_D_GRAFICO = (
    "The Model Element, as designed, is graphically represented within the Model "
    "such that its quantity, size, shape, location, and orientation can be measured."
)
_D_DESCRICAO = "Description (i.e. A basic description of the element)"
_D_FABRICANTE = (
    "Manufacturer Details (i.e. Name of company, company address, link to website)"
)
_D_MATERIAL = "Material (i.e. Characteristic or primary material of product)"
_D_DIM_LAJE = (
    "Nominal Dimensions (i.e. Generic element sizing) / Overall size, thickness "
    "and geometry of the slab"
)
_D_DIM_BORDA = "Nominal Dimensions (i.e. Generic element sizing) / Edge location"
_D_REBAIXO = "Slab depressions"
_D_ABERTURA = 'Openings with any dimension greater than 6" (15 cm) or as noted'
_D_INCLINACAO = "Surface slopes"


@dataclass(frozen=True)
class ItemLod:
    """Uma linha INFORMATION dentro de uma categoria de elemento."""

    codigo: str
    """Sufixo do código do critério. Curto porque ele entra composto."""
    nome_en: str
    """O rótulo literal da coluna INFORMATION — é por ele que se reconhece a linha."""
    nome_pt: str
    parametro: str | None = None
    """O built-in canônico da categoria. `None` = a linha audita GEOMETRIA."""
    descricao: str | None = None
    """A coluna BIM FORUM DESCRIPTION."""


@dataclass(frozen=True)
class ElementoLod:
    """Uma categoria da coluna ELEMENT, com as informações que ela exige."""

    codigo: str
    nome_en: str
    nome_pt: str
    itens: tuple[ItemLod, ...]


# --- as informações que quase toda categoria pede ---------------------------
# A planilha repete este bloco no topo de cada elemento. Ele é uma função e não
# uma constante porque o built-in de `Level` e `Offset from Level` MUDA por
# categoria (`Level`/`Height offset from Level` na laje, `Base Level`/`Top
# Offset` no pilar) — e foi essa variação que motivou não compartilhar critério.
def _identificacao(*, level: str | None, offset: str | None) -> tuple[ItemLod, ...]:
    return (
        ItemLod("FAMILY", "Family", "Família", "Family", _D_GRAFICO),
        ItemLod("TYPE", "Type", "Tipo", "Type"),
        ItemLod("LEVEL", "Level", "Nível", level),
        ItemLod("OFFSET", "Offset from Level", "Deslocamento do nível", offset),
        ItemLod("ASSEMBLY", "Assembly code", "Código de montagem", "Assembly code"),
        ItemLod("DESCRIPTION", "Description", "Descrição", "Description", _D_DESCRICAO),
        ItemLod("MANUFACTURER", "Manufacturer", "Fabricante", "Manufacturer", _D_FABRICANTE),
        ItemLod(
            "MATERIAL", "Main Material", "Material principal", "Structural Material", _D_MATERIAL
        ),
    )


# As linhas de geometria de laje — idênticas em FLOOR, FOUNDATIONS e FRAMING.
# "Opennings" está com dois N no arquivo de origem; aqui vai escrito certo. O
# rótulo continua reconhecível, e propagar o erro de digitação para dentro de um
# sistema de registro seria carregá-lo para sempre.
#
# "GEOMETRIC DATA" NÃO É NOME DE PARÂMETRO. O arquivo escreve isso na coluna
# REVIT PARAMETER de Slab depressions, Clearance Modeled e Openings, e é o modo
# dele dizer "o que se audita aqui é a GEOMETRIA, não um campo preenchido". Se
# entrasse como `parametro_esperado`, o verificador do executor procuraria um
# parâmetro literalmente chamado "Geometric Data", não acharia em modelo nenhum,
# e reprovaria todos — falso negativo em massa, que é pior do que não
# automatizar. Estas três ficam MANUAIS de propósito.
_GEOMETRIA_LAJE: tuple[ItemLod, ...] = (
    ItemLod("LENGTH", "Length", "Comprimento", None, _D_DIM_LAJE),
    ItemLod("WIDTH", "Width", "Largura"),
    ItemLod("AREA", "Area", "Área"),
    ItemLod("THICKNESS", "Thickness", "Espessura"),
    ItemLod("DEPRESSIONS", "Slab depressions", "Rebaixos", None, _D_REBAIXO),
    ItemLod("CLEARANCE", "Clearance Modeled", "Folga modelada"),
    ItemLod("OPENINGS", "Openings", "Aberturas", None, _D_ABERTURA),
    ItemLod("SLOPE", "Slope", "Inclinação", "Slope", _D_INCLINACAO),
)


# --- STRC: as quatro categorias do arquivo de referência --------------------
LOD300_STRC: tuple[ElementoLod, ...] = (
    ElementoLod(
        "FLOOR",
        "Floor",
        "Laje",
        _identificacao(level="Level", offset="Height offset from Level")
        + _GEOMETRIA_LAJE,
    ),
    ElementoLod(
        "COLUMN",
        "Structural columns",
        "Pilares",
        _identificacao(level="Base Level", offset="Top Offset")
        + (
            ItemLod("LENGTH", "Length", "Comprimento", None, _D_DIM_BORDA),
            # `b` e `h` são os nomes que as famílias de pilar da referência usam.
            ItemLod("WIDTH", "Width", "Largura", "b"),
            ItemLod("HEIGHT", "Height", "Altura", "h"),
            ItemLod("CLEARANCE", "Clearance Modeled", "Folga modelada"),
        ),
    ),
    ElementoLod(
        "FOUNDATION",
        "Structural foundations",
        "Fundações",
        _identificacao(level=None, offset=None) + _GEOMETRIA_LAJE,
    ),
    ElementoLod(
        "FRAMING",
        "Structural framing",
        "Vigas e barras",
        _identificacao(level=None, offset=None) + _GEOMETRIA_LAJE,
    ),
)

# Indexado pelo código da disciplina (`Disciplina.disc`). Hoje só STRC: é a
# única com arquivo de referência. Acrescentar ARCH é acrescentar uma entrada.
GABARITOS_LOD: dict[str, tuple[ElementoLod, ...]] = {
    "STRC": LOD300_STRC,
}

# Toda linha de LOD é de nível ELEMENTO: a pergunta é sobre os elementos da
# categoria, não sobre o arquivo. Uma laje pode estar conforme e a outra não, e
# é isso que `itens_ok / itens_analisados` registra na planilha.
NIVEL_LINHA = CriterioNivel.ELEMENTO


def automacao_de(item: ItemLod) -> Automacao:
    """`auto` só quando há built-in canônico; senão `manual`.

    Com `parametro_esperado` preenchido, o verificador de presença de parâmetro
    do `automacao/executor.py` dá conta da linha sozinho. SEM parâmetro tem de
    ser manual: ali o que se audita é geometria (a laje tem o rebaixo
    modelado?), e um verificador que procura um parâmetro inexistente reprovaria
    modelo correto — pior do que não automatizar.
    """
    return Automacao.AUTO if item.parametro else Automacao.MANUAL
