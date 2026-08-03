"""SP-106 · Biblioteca de critérios e composição dos checklists.

CA: critério canônico bilíngue reutilizável; checklist referencia critérios
por id; editar um critério reflete em todos os checklists que o usam.

Esse último ponto é consequência do modelo — o checklist guarda o `criterio_id`,
não uma cópia do texto — e é o que `usos` deixa visível na tela.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import ChecklistItem, Criterio, Standard
from app.models.enums import Automacao, ChecklistTipo, CriterioNivel
from app.schemas.criterio import (
    ChecklistIn,
    ChecklistOut,
    CriterioComUso,
    CriterioCreate,
    CriterioOut,
    CriterioUpdate,
    GabaritoAplicado,
    GabaritoIn,
    ItemChecklistOut,
    LinhaGabarito,
)
from app.services import gabarito, gabarito_lod, lixeira
from app.services.escopo import conflito, exigir, exigir_projeto, ja_existe

router = APIRouter(tags=["criterios"])


# ----------------------------------------------------------------- critérios
@router.get("/criterios", response_model=Page[CriterioComUso])
def listar_criterios(
    projeto_id: uuid.UUID | None = Query(default=None),
    categoria: str | None = Query(default=None),
    nivel: CriterioNivel | None = Query(default=None),
    automacao: Automacao | None = Query(default=None),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[CriterioComUso]:
    stmt = select(Criterio)
    if projeto_id is not None:
        stmt = stmt.where(Criterio.projeto_id == projeto_id)
    if categoria:
        stmt = stmt.where(Criterio.categoria == categoria)
    if nivel is not None:
        stmt = stmt.where(Criterio.nivel == nivel)
    if automacao is not None:
        stmt = stmt.where(Criterio.automacao == automacao)

    criterios = list(db.execute(aplicar_cursor(stmt, Criterio, params)).scalars())

    # Uma consulta para todos os usos, em vez de uma por critério.
    ids = [c.id for c in criterios]
    usos: dict[uuid.UUID, int] = {}
    if ids:
        usos = {
            criterio_id: total
            for criterio_id, total in db.execute(
                select(ChecklistItem.criterio_id, func.count())
                .where(ChecklistItem.criterio_id.in_(ids))
                .group_by(ChecklistItem.criterio_id)
            ).all()
        }

    def serializar(c: Criterio) -> CriterioComUso:
        return CriterioComUso(**CriterioOut.model_validate(c).model_dump(), usos=usos.get(c.id, 0))

    return montar_pagina(criterios, params, serializar)


@router.post("/criterios", response_model=CriterioOut, status_code=status.HTTP_201_CREATED)
def criar_criterio(
    payload: CriterioCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("editar_biblioteca")),
) -> CriterioOut:
    exigir_projeto(db, payload.projeto_id)
    if payload.standard_id is not None:
        exigir(db, Standard, payload.standard_id, "standard")

    codigo = payload.codigo.upper()
    if ja_existe(
        db,
        select(Criterio).where(
            Criterio.projeto_id == payload.projeto_id, Criterio.codigo == codigo
        ),
    ):
        raise conflito(f"já existe o critério {codigo} neste projeto")

    criterio = Criterio(
        org_id=user.org_id, **payload.model_dump(exclude={"codigo"}), codigo=codigo
    )
    db.add(criterio)
    db.flush()
    return CriterioOut.model_validate(criterio)


@router.get("/criterios/{criterio_id}", response_model=CriterioOut)
def obter_criterio(
    criterio_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> CriterioOut:
    return CriterioOut.model_validate(exigir(db, Criterio, criterio_id, "critério"))


@router.patch("/criterios/{criterio_id}", response_model=CriterioOut)
def atualizar_criterio(
    criterio_id: uuid.UUID,
    payload: CriterioUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("editar_biblioteca")),
) -> CriterioOut:
    criterio = exigir(db, Criterio, criterio_id, "critério")
    dados = payload.model_dump(exclude_unset=True)
    if dados.get("standard_id") is not None:
        exigir(db, Standard, dados["standard_id"], "standard")
    for campo, valor in dados.items():
        setattr(criterio, campo, valor)
    db.flush()
    return CriterioOut.model_validate(criterio)


@router.delete("/criterios/{criterio_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_criterio(
    criterio_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("editar_biblioteca")),
) -> None:
    """Só remove critério fora de uso — apagar um critério em checklist
    apagaria em cascata a composição das auditorias que dependem dele."""
    criterio = exigir(db, Criterio, criterio_id, "critério")
    usos = db.execute(
        select(func.count())
        .select_from(ChecklistItem)
        .where(ChecklistItem.criterio_id == criterio_id)
    ).scalar_one()
    if usos:
        raise conflito(
            f"critério em uso em {usos} checklist(s); remova-o dos checklists primeiro"
        )
    lixeira.remover(db, criterio)


# ---------------------------------------------------------------- checklists
def _itens_do_checklist(
    db: Session, projeto_id: uuid.UUID, checklist: ChecklistTipo
) -> list[ChecklistItem]:
    return list(
        db.execute(
            select(ChecklistItem)
            .options(selectinload(ChecklistItem.criterio))
            .where(
                ChecklistItem.projeto_id == projeto_id, ChecklistItem.checklist == checklist
            )
            .order_by(ChecklistItem.ordem.nulls_last(), ChecklistItem.created_at)
        ).scalars()
    )


@router.get("/checklists/{checklist}", response_model=ChecklistOut)
def obter_checklist(
    checklist: ChecklistTipo,
    projeto_id: uuid.UUID = Query(...),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ChecklistOut:
    exigir_projeto(db, projeto_id)
    return ChecklistOut(
        checklist=checklist,
        projeto_id=projeto_id,
        itens=[
            ItemChecklistOut.model_validate(i)
            for i in _itens_do_checklist(db, projeto_id, checklist)
        ],
    )


@router.put("/checklists/{checklist}/itens", response_model=ChecklistOut)
def definir_itens(
    checklist: ChecklistTipo,
    payload: ChecklistIn,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("editar_biblioteca")),
) -> ChecklistOut:
    """Substitui a composição inteira do checklist.

    PUT e não POST item a item: a tela edita a lista como um todo (arrasta,
    reordena, tira), e uma escrita atômica evita o estado meio-salvo.
    """
    exigir_projeto(db, payload.projeto_id)

    ids = [i.criterio_id for i in payload.itens]
    if len(set(ids)) != len(ids):
        raise conflito("o mesmo critério aparece mais de uma vez no checklist")

    if ids:
        encontrados = set(
            db.execute(
                select(Criterio.id).where(
                    Criterio.id.in_(ids), Criterio.projeto_id == payload.projeto_id
                )
            ).scalars()
        )
        faltando = [str(i) for i in ids if i not in encontrados]
        if faltando:
            raise conflito(
                f"critério não encontrado neste projeto: {', '.join(faltando)}"
            )

    for antigo in _itens_do_checklist(db, payload.projeto_id, checklist):
        db.delete(antigo)
    db.flush()

    for posicao, item in enumerate(payload.itens, start=1):
        db.add(
            ChecklistItem(
                org_id=user.org_id,
                projeto_id=payload.projeto_id,
                checklist=checklist,
                **item.model_dump(exclude={"ordem"}),
                ordem=item.ordem if item.ordem is not None else posicao,
            )
        )
    db.flush()

    return ChecklistOut(
        checklist=checklist,
        projeto_id=payload.projeto_id,
        itens=[
            ItemChecklistOut.model_validate(i)
            for i in _itens_do_checklist(db, payload.projeto_id, checklist)
        ],
    )


@router.get("/gabaritos/{checklist}", response_model=list[LinhaGabarito])
def obter_gabarito(
    checklist: ChecklistTipo,
    disciplina: str | None = Query(default=None),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[LinhaGabarito]:
    """O gabarito de fábrica do checklist — SEM projeto e SEM tocar no banco.

    A ESTRUTURA DA AUDITORIA GERAL É PADRÃO DA EMPRESA, não configuração de
    projeto: são os mesmos 17 itens nas oito disciplinas e em todo projeto, e é
    isso que `services/gabarito.py` guarda. A tela da planilha precisa desenhar
    essas linhas SEMPRE — inclusive num projeto recém-criado, que ainda não
    compôs checklist nenhum.

    Antes só existia o POST que SEMEIA o gabarito no projeto. Com ele como único
    caminho, a planilha de um projeto novo aparecia vazia e pedia que alguém
    "aplicasse o padrão" antes de ver o padrão — um passo que não corresponde a
    decisão nenhuma, já que a resposta é sempre sim.

    O POST continua existindo e é outra coisa: ele cria `Criterio` e
    `ChecklistItem` DO PROJETO, que é o que permite ao projeto depois renomear um
    item ou acrescentar o 18º. Este GET é a leitura do padrão; aquele é a adoção
    dele como dado editável.
    """
    if checklist in gabarito.CHECKLISTS_POR_DISCIPLINA:
        if not disciplina:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"o gabarito de '{checklist.value}' é por disciplina — informe qual. "
                    "Com gabarito hoje: " + ", ".join(sorted(gabarito_lod.GABARITOS_LOD))
                ),
            )
        try:
            itens = gabarito.itens_de(checklist, disciplina)
        except gabarito.DisciplinaSemGabarito as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"não há arquivo de referência de {checklist.value} para a "
                    f"disciplina '{e.disciplina}'. Com gabarito hoje: "
                    + ", ".join(e.disponiveis)
                ),
            ) from None
    else:
        itens = gabarito.GABARITOS.get(checklist)
        if itens is None:
            # LISTA VAZIA e não 422: "este recorte não tem estrutura de fábrica"
            # é uma resposta, não um erro. A tela desenha a grade sem linhas e
            # segue; um 422 a faria mostrar uma falha onde não houve nenhuma.
            return []

    return [
        LinhaGabarito(
            codigo=i.codigo,
            nome_pt=i.nome_pt,
            nome_en=i.nome_en,
            categoria=i.categoria,
            instrucao=i.instrucao or None,
            criterio_aceitacao=i.criterio_aceitacao,
            parametro_esperado=i.parametro_esperado,
        )
        for i in itens
    ]


@router.post("/checklists/{checklist}/gabarito", response_model=GabaritoAplicado)
def aplicar_gabarito(
    checklist: ChecklistTipo,
    payload: GabaritoIn,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("editar_biblioteca")),
) -> GabaritoAplicado:
    """Semeia no projeto os itens de fábrica do checklist.

    É o que faz um projeto novo já ter a planilha da auditoria geral em vez de
    uma lista vazia. Sem isto, abrir a auditoria de um modelo produz uma
    auditoria de zero linhas — tecnicamente correta e inútil.

    POST e não PUT: não substitui a composição (para isso existe
    `PUT /checklists/{checklist}/itens`), acrescenta o que falta. Aplicar duas
    vezes não duplica, e aplicar depois de o projeto ajustar um item não desfaz
    o ajuste — ver `services/gabarito.py`.
    """
    exigir_projeto(db, payload.projeto_id)

    try:
        resumo = gabarito.aplicar(
            db,
            org_id=user.org_id,
            projeto_id=payload.projeto_id,
            checklist=checklist,
            disciplina=payload.disciplina,
        )
    except gabarito.DisciplinaExigida as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"o gabarito de '{checklist.value}' é por disciplina — informe qual. "
                "Com gabarito hoje: " + ", ".join(e.disponiveis)
            ),
        ) from None
    except gabarito.DisciplinaSemGabarito as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"não há arquivo de referência de {checklist.value} para a "
                f"disciplina '{e.disciplina}'. Com gabarito hoje: "
                + ", ".join(e.disponiveis)
            ),
        ) from None
    except KeyError:
        # 422 e não 404: a rota existe e o checklist é válido — o que não existe
        # é um gabarito desenhado para ele. Os recortes de LOD saem do BIM
        # Forum, que é outra fonte e outro formato.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"não há gabarito de fábrica para o checklist '{checklist.value}'. "
                "Com gabarito hoje: "
                + ", ".join(sorted(c.value for c in gabarito.GABARITOS))
            ),
        ) from None
    except gabarito.ItemNaLixeira as e:
        raise conflito(
            "estes critérios estão na lixeira e precisam ser restaurados antes: "
            + ", ".join(e.codigos)
        ) from None

    return GabaritoAplicado(
        checklist=checklist,
        projeto_id=payload.projeto_id,
        criterios_criados=resumo.criterios_criados,
        criterios_reaproveitados=resumo.criterios_reaproveitados,
        itens_criados=resumo.itens_criados,
        itens_existentes=resumo.itens_existentes,
        itens=[
            ItemChecklistOut.model_validate(i)
            for i in _itens_do_checklist(db, payload.projeto_id, checklist)
        ],
    )
