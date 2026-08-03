"""O gabarito da auditoria geral — os 17 itens que todo modelo responde.

ISTO NÃO É DADO DE EXEMPLO. As planilhas `<PROJETO> _ <DISC> _ AUDITORIA GERAL
.xlsx` que a coordenação usa hoje têm as MESMAS 17 linhas, na mesma ordem, em
todas as disciplinas — ARCH, STRC, ELEC, MECH, PLMB, FPRT, TCOM e FALM. O que
varia entre elas é a resposta, nunca a pergunta. Uma lista que é idêntica em
oito arquivos e não muda de projeto para projeto é padrão da empresa, e padrão
da empresa mora em código, não numa planilha de seed que o usuário pode não
querer importar.

POR QUE UM GABARITO EM VEZ DE FIXAR OS 17 NO BANCO. Os itens entram como
`Criterio` + `ChecklistItem` do projeto — as mesmas tabelas de qualquer outro
critério. Aplicar o gabarito é semear, não vincular: depois de aplicado o
projeto pode renomear um item, trocar a instrução, acrescentar um 18º ou tirar
um que não se aplica, e nada aqui reclama. É o "pré-definido e modificável" do
pedido: o gabarito dá o ponto de partida e para de opinar.

Por isso `aplicar()` NUNCA sobrescreve um critério que já existe. Encontrar o
código é sinal de que o projeto já o tem — possivelmente ajustado à mão —, e
reescrevê-lo com o texto de fábrica apagaria calado o ajuste de alguém. Ele
apenas cria o que falta.

A ARMADILHA DA LIXEIRA. `criterio` tem `deleted_at` e a policy de RLS esconde o
removido, mas o UNIQUE `(projeto_id, codigo)` continua valendo sobre a linha
invisível. Sem o cuidado de `_removido()`, aplicar o gabarito num projeto que
apagou um item morreria com um IntegrityError cru — "duplicate key" apontando
para uma linha que a sessão jura não existir. Ver `services/lixeira.py`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import set_ver_removidos
from app.models import ChecklistItem, Criterio
from app.models.enums import Automacao, ChecklistTipo, CriterioNivel
from app.services import gabarito_lod


@dataclass(frozen=True)
class ItemGabarito:
    """Uma linha da planilha, antes de virar critério de um projeto."""

    codigo: str
    nome_pt: str
    nome_en: str
    categoria: str
    nivel: CriterioNivel
    automacao: Automacao
    # COMO CONFERIR. Na geral é a coluna oculta de orientação do arquivo.
    instrucao: str
    # Os três abaixo só o LOD usa. Com default, para que os 17 itens da geral
    # continuem sendo escritos posicionalmente e legíveis em três linhas cada.
    #
    # O QUE FAZ PASSAR. No LOD é a BIM FORUM DESCRIPTION — ela diz o que o
    # elemento precisa ter ("openings with any dimension greater than 6 inches"),
    # não como olhar. Os dois campos existem separados no `Criterio` desde a
    # Fase 1, e trocá-los poria o requisito no lugar da orientação.
    criterio_aceitacao: str | None = None
    parametro_esperado: str | None = None
    min_lod: str | None = None


_M = CriterioNivel.MODELO
_E = CriterioNivel.ELEMENTO
_MAN = Automacao.MANUAL
_DA = Automacao.DESIGN_AUTOMATION
_AUTO = Automacao.AUTO

# A ORDEM É A DA PLANILHA e vira `ChecklistItem.ordem`. Quem audita hoje
# desce a coluna A de cima para baixo; entregar os itens em outra ordem
# custaria a única memória muscular que a planilha deixou.
#
# `nome_en` é o rótulo literal da coluna INFORMATION — é por ele que a
# coordenação reconhece a linha. `instrucao` é a coluna oculta de orientação
# (a coluna I das planilhas de ARCH e ELEC), que diz COMO conferir o item; é a
# única parte do arquivo que nunca foi para o fornecedor.
GABARITO_GERAL: tuple[ItemGabarito, ...] = (
    ItemGabarito(
        "MODEL_NAME", "Nome do modelo", "Model name",
        "Aspectos gerais", _M, _AUTO,
        "Verificar se o nome do arquivo está correto.",
    ),
    ItemGabarito(
        "START_VIEW", "Vista inicial", "Start up view",
        "Aspectos gerais", _M, _MAN,
        "Verificar se as informações estão corretas (nome e número do projeto) "
        "e se a tabela de revisões está preenchida.",
    ),
    ItemGabarito(
        "SHARED_COORD", "Coordenadas compartilhadas", "Model with shared coordinates",
        "Aspectos gerais", _M, _MAN,
        "Ligar os eixos e verificar se o ponto base está nos eixos A e 0.01. "
        "Conferir as coordenadas com o Construction BIM (página 11) — no ACC, "
        "em SUPPORT DOCUMENTS › BIM › BEP.",
    ),
    ItemGabarito(
        "DESIGN_AXES", "Eixos", "Design axes",
        "Aspectos gerais", _M, _MAN,
        "Verificar se os eixos estão nomeados e posicionados corretamente.",
    ),
    ItemGabarito(
        "FILTER_PHASE", "Filtro de fase", "Filter phase",
        "Aspectos gerais", _M, _DA,
        "Verificar se todos os elementos estão em uma fase única, por tabela de "
        "multicategorias com filtro de categoria e contagem. Fase esperada: "
        "PHASE FUTURE.",
    ),
    ItemGabarito(
        "DESIGN_OPTIONS", "Opções de desenho", "Design options",
        "Aspectos gerais", _M, _DA,
        "Aba Manage › Design Options: não pode ter nada.",
    ),
    ItemGabarito(
        "BROWSER_SCHED", "Navegador — tabelas", "Browser organization — schedules",
        "Organização do navegador", _M, _MAN,
        "Tabelas nomeadas em inglês e organizadas em grupos identificados.",
    ),
    ItemGabarito(
        "BROWSER_VIEWS", "Navegador — vistas", "Browser organization — views",
        "Organização do navegador", _M, _MAN,
        "Verificar a organização das vistas. Vistas de trabalho limpas ou "
        "reunidas em um único grupo.",
    ),
    ItemGabarito(
        "BROWSER_SHEETS", "Navegador — folhas", "Browser organization — sheets",
        "Organização do navegador", _M, _MAN,
        "Verificar a organização das folhas: grupos e folhas seguem o padrão de "
        "nomenclatura, sem grupo sem identificação.",
    ),
    ItemGabarito(
        "WORKSETS", "Worksets", "Worksets",
        "Aspectos gerais", _M, _DA,
        "Verificar os worksets: nomenclatura conforme a WORKSET LIST da "
        "disciplina e descrição na tabela do ACC, sem workset não pertinente.",
    ),
    ItemGabarito(
        "GENERIC_MODELS", "Modelos genéricos", "Generic models",
        "Aspectos gerais", _M, _DA,
        "Não pode ter modelo genérico. Verificação por tabela de multicategorias.",
    ),
    ItemGabarito(
        "SATELLITE", "Elementos satélite", "Satellite elements",
        "Aspectos gerais", _E, _AUTO,
        "Verificar se existem elementos soltos (voando) no modelo.",
    ),
    ItemGabarito(
        "FILES_LINKED", "Arquivos vinculados", "Files linked to or inserted in the project",
        "Aspectos gerais", _M, _DA,
        "Verificar se existem links ou arquivos CAD inseridos: não pode ter.",
    ),
    ItemGabarito(
        "ON_SITE", "Modelagem no local", "On-site modeling",
        "Aspectos gerais", _M, _DA,
        "Não pode ter modelagem no local. Verificação pelo plugin BIMprove.",
    ),
    ItemGabarito(
        "DUPLICATE", "Elementos duplicados", "Duplicate elements",
        "Aspectos gerais", _E, _DA,
        "Não pode ter elementos duplicados. Verificar com o plugin Model Checker.",
    ),
    ItemGabarito(
        "OVERLAPPED", "Elementos sobrepostos", "Overlapped elements",
        "Aspectos gerais", _E, _DA,
        "Conferir na aba Warnings se existem elementos sobrepostos.",
    ),
    ItemGabarito(
        "CAT_SHARED_PARAMS",
        "Categorias com parâmetros compartilhados",
        "Category information with shared parameters",
        "Parâmetros", _E, _AUTO,
        "Conferir se o modelo está com os parâmetros 4D nas categorias.",
    ),
)

# Um checklist só tem gabarito se alguém desenhou um. A GERAL é a única que não
# depende de disciplina — os 17 itens são os mesmos nas oito. O LOD 300 depende
# (`gabarito_lod.py`), porque ali muda a pergunta e não só a resposta.
GABARITOS: dict[ChecklistTipo, tuple[ItemGabarito, ...]] = {
    ChecklistTipo.GERAL: GABARITO_GERAL,
}

# Os checklists cujo gabarito EXIGE disciplina. Aqui em vez de espalhado pelos
# `if` da rota: acrescentar o LOD 350 é acrescentar uma entrada, e esquecer de
# exigir a disciplina passaria a semear a lista errada em silêncio.
CHECKLISTS_POR_DISCIPLINA: dict[ChecklistTipo, str] = {
    ChecklistTipo.LOD300: "300",
}


def itens_de(checklist: ChecklistTipo, disciplina: str) -> tuple[ItemGabarito, ...]:
    """As linhas do gabarito, SEM tocar no banco.

    É o que `GET /gabaritos/{checklist}` serve: a estrutura de fábrica é padrão
    da empresa e a tela precisa desenhá-la mesmo num projeto que ainda não a
    adotou. `aplicar()` é outra coisa — ele transforma estas linhas em `Criterio`
    e `ChecklistItem` DO projeto, que é o que as torna editáveis por ele.
    """
    return _lod_para(checklist, disciplina)


def _lod_para(checklist: ChecklistTipo, disciplina: str) -> tuple[ItemGabarito, ...]:
    """Achata elemento × informação nas linhas de critério do LOD.

    O código do critério carrega os três níveis — `LOD300_FLOOR_THICKNESS` —
    porque `Criterio.codigo` é único por PROJETO e o mesmo nome de informação
    reaparece em cada categoria. Sem a categoria no código, "Thickness" da laje
    e "Thickness" da fundação colidiriam.
    """
    elementos = gabarito_lod.GABARITOS_LOD.get(disciplina.strip().upper())
    if elementos is None:
        raise DisciplinaSemGabarito(disciplina)

    lod = CHECKLISTS_POR_DISCIPLINA[checklist]
    itens: list[ItemGabarito] = []
    for elemento in elementos:
        for item in elemento.itens:
            itens.append(
                ItemGabarito(
                    codigo=f"LOD{lod}_{elemento.codigo}_{item.codigo}",
                    # O rótulo da linha é a INFORMATION; a categoria diz de que
                    # elemento se fala, e é o que agrupa a tela.
                    nome_pt=item.nome_pt,
                    nome_en=item.nome_en,
                    categoria=f"{elemento.nome_pt} · {elemento.nome_en}",
                    nivel=gabarito_lod.NIVEL_LINHA,
                    automacao=gabarito_lod.automacao_de(item),
                    # A descrição do BIM Forum é CRITÉRIO DE ACEITAÇÃO, não
                    # instrução: ela diz o que o elemento precisa ter para
                    # passar, não como conferir. Na geral é o contrário — lá o
                    # texto de origem é a orientação interna de como auditar. Os
                    # dois campos existem separados no `Criterio` desde a Fase 1,
                    # e trocá-los poria o requisito no lugar da orientação.
                    instrucao="",
                    criterio_aceitacao=item.descricao,
                    parametro_esperado=item.parametro,
                    min_lod=lod,
                )
            )
    return tuple(itens)


class DisciplinaSemGabarito(Exception):
    """Não há arquivo de referência para esta disciplina — hoje só STRC."""

    def __init__(self, disciplina: str) -> None:
        self.disciplina = disciplina
        self.disponiveis = sorted(gabarito_lod.GABARITOS_LOD)
        super().__init__(disciplina)


class DisciplinaExigida(Exception):
    """O checklist é por disciplina e ela não veio.

    Falhar é melhor do que escolher: semear a lista de STRC num projeto de
    arquitetura criaria 60 critérios de estrutura que ninguém pediu, e
    desfazê-los depois é trabalho manual.
    """

    def __init__(self, checklist: ChecklistTipo) -> None:
        self.checklist = checklist
        self.disponiveis = sorted(gabarito_lod.GABARITOS_LOD)
        super().__init__(checklist.value)


@dataclass
class Resumo:
    """O que a aplicação do gabarito fez — a tela mostra isto ao usuário.

    `reaproveitados` é informação, não sobra: aplicar de novo depois de o
    projeto ter ajustado dois itens deve dizer "15 criados, 2 já existiam",
    para que ninguém precise adivinhar se o ajuste sobreviveu.
    """

    criterios_criados: list[str]
    criterios_reaproveitados: list[str]
    itens_criados: list[str]
    itens_existentes: list[str]


class ItemNaLixeira(Exception):
    """O critério existe, mas removido. Restaurar é decisão de quem removeu.

    Recriar por cima seria a saída fácil e a errada: o UNIQUE não deixa, e
    forçar deixaria duas linhas com o mesmo código no projeto — uma visível e
    uma na lixeira, esperando o próximo restaurar para colidir.
    """

    def __init__(self, codigos: list[str]) -> None:
        self.codigos = codigos
        super().__init__(", ".join(codigos))


def _removidos(db: Session, projeto_id: uuid.UUID, codigos: set[str]) -> set[str]:
    """Quais destes códigos estão na lixeira do projeto.

    Precisa do GUC ligado: numa sessão comum a policy esconde exatamente as
    linhas que interessam aqui, e a resposta seria sempre "nenhum" — que é o
    caminho para o IntegrityError cru.
    """
    set_ver_removidos(db, True)
    try:
        achados = db.execute(
            select(Criterio.codigo).where(
                Criterio.projeto_id == projeto_id,
                Criterio.codigo.in_(codigos),
                Criterio.deleted_at.is_not(None),
            )
        ).scalars()
        return set(achados)
    finally:
        set_ver_removidos(db, False)


def aplicar(
    db: Session,
    *,
    org_id: uuid.UUID,
    projeto_id: uuid.UUID,
    checklist: ChecklistTipo,
    disciplina: str | None = None,
) -> Resumo:
    """Semeia no projeto os itens do gabarito que ainda faltam.

    Idempotente e não destrutivo: rodar duas vezes não duplica nada e rodar
    depois de um ajuste manual não o desfaz.

    `disciplina` é OBRIGATÓRIA nos checklists de LOD e ignorada na geral — os 17
    itens da geral são os mesmos nas oito disciplinas, os do LOD não. Omiti-la
    num checklist que a exige levanta `DisciplinaExigida`, e não semeia a lista
    de uma disciplina arbitrária.
    """
    if checklist in CHECKLISTS_POR_DISCIPLINA:
        if not disciplina:
            raise DisciplinaExigida(checklist)
        itens: tuple[ItemGabarito, ...] | None = _lod_para(checklist, disciplina)
    else:
        itens = GABARITOS.get(checklist)
    if itens is None:
        raise KeyError(checklist.value)

    presentes = {
        c.codigo: c
        for c in db.execute(
            select(Criterio).where(
                Criterio.projeto_id == projeto_id,
                Criterio.codigo.in_({i.codigo for i in itens}),
            )
        ).scalars()
    }

    faltantes = {i.codigo for i in itens} - presentes.keys()
    if faltantes:
        na_lixeira = _removidos(db, projeto_id, faltantes)
        if na_lixeira:
            raise ItemNaLixeira(sorted(na_lixeira))

    resumo = Resumo([], [], [], [])

    for ordem, item in enumerate(itens, start=1):
        criterio = presentes.get(item.codigo)
        if criterio is None:
            criterio = Criterio(
                org_id=org_id,
                projeto_id=projeto_id,
                codigo=item.codigo,
                nome_pt=item.nome_pt,
                nome_en=item.nome_en,
                categoria=item.categoria,
                nivel=item.nivel,
                automacao=item.automacao,
                instrucao=item.instrucao or None,
                parametro_esperado=item.parametro_esperado,
                criterio_aceitacao=item.criterio_aceitacao,
            )
            db.add(criterio)
            db.flush()
            resumo.criterios_criados.append(item.codigo)
        else:
            resumo.criterios_reaproveitados.append(item.codigo)

        vinculo = db.execute(
            select(ChecklistItem).where(
                ChecklistItem.projeto_id == projeto_id,
                ChecklistItem.checklist == checklist,
                ChecklistItem.criterio_id == criterio.id,
            )
        ).scalar_one_or_none()

        if vinculo is None:
            db.add(
                ChecklistItem(
                    org_id=org_id,
                    projeto_id=projeto_id,
                    checklist=checklist,
                    criterio_id=criterio.id,
                    ordem=ordem,
                )
            )
            resumo.itens_criados.append(item.codigo)
        else:
            resumo.itens_existentes.append(item.codigo)

    db.flush()
    return resumo
