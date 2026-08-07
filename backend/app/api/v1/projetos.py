"""SP-101 · Projetos.

CA: criar/editar projeto com código único por organização.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import Projeto
from app.schemas.projeto import (
    AreaEscrita,
    AreaOut,
    ProjetoCreate,
    ProjetoOut,
    ProjetoUpdate,
)
from app.services import areas as svc_areas
from app.services import lixeira
from app.services.escopo import (
    conflito,
    exigir_projeto,
    exigir_projeto_do_usuario,
    ja_existe,
    projetos_visiveis,
)

router = APIRouter(prefix="/projetos", tags=["projetos"])


@router.get("", response_model=Page[ProjetoOut])
def listar(
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[ProjetoOut]:
    """Os projetos DESTA PESSOA — não os da organização (06/08/2026, a pedido).

    Até aqui `ver_painel` bastava para ver todos, e foi por isso que uma conta
    criada pela tela de cadastro entrou e encontrou o CPQ11 na home sem ninguém
    a ter vinculado. Quem tem `admin_cadastro` continua vendo tudo: é quem cria
    projeto e vincula gente, e precisa enxergar o que ainda não tem ninguém.

    O FILTRO ENTRA ANTES DO CURSOR, e a ordem importa: aplicado depois, a
    paginação contaria as linhas invisíveis e devolveria páginas curtas — ou
    vazias, com `next` apontando para a seguinte.
    """
    stmt = aplicar_cursor(projetos_visiveis(select(Projeto), user), Projeto, params)
    return montar_pagina(
        list(db.execute(stmt).scalars()), params, ProjetoOut.model_validate
    )


@router.post("", response_model=ProjetoOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: ProjetoCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ProjetoOut:
    codigo = payload.codigo.upper()
    if ja_existe(db, select(Projeto).where(Projeto.codigo == codigo)):
        raise conflito(f"já existe projeto com o código {codigo} nesta organização")

    projeto = Projeto(
        org_id=user.org_id,
        **payload.model_dump(exclude={"codigo"}),
        codigo=codigo,
    )
    db.add(projeto)
    db.flush()
    return ProjetoOut.model_validate(projeto)


@router.get("/{projeto_id}", response_model=ProjetoOut)
def obter(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ProjetoOut:
    """Filtrar só a LISTA seria esconder, não proteger: o id vai na URL, e quem
    não é membro abriria o projeto digitando `/projetos/<id>` na barra."""
    return ProjetoOut.model_validate(exigir_projeto_do_usuario(db, projeto_id, user))


@router.patch("/{projeto_id}", response_model=ProjetoOut)
def atualizar(
    projeto_id: uuid.UUID,
    payload: ProjetoUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ProjetoOut:
    projeto = exigir_projeto(db, projeto_id)
    # `exclude_unset`: PATCH só mexe no que veio, e null é valor legítimo
    # (limpar o contato do cliente, por exemplo).
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(projeto, campo, valor)
    db.flush()
    return ProjetoOut.model_validate(projeto)


@router.delete("/{projeto_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    """Manda o projeto para a lixeira. **Não apaga.**

    É a operação mais cara de errar nesta plataforma: o projeto é o pai de
    disciplina, modelo, auditoria e não-conformidade, e o produto aqui É o
    histórico de auditoria. Por isso ele entrou na lixeira (migration 0011) em
    vez de ganhar um DELETE em cascata — some das listas pela policy de RLS e
    volta em `/lixeira` com um clique.

    Nada mais é tocado: disciplinas e modelos continuam apontando para ele e
    voltam junto na restauração. Some tudo da tela porque as consultas partem do
    projeto, não porque as linhas filhas tenham sido marcadas uma a uma — o que
    faria a restauração ter de adivinhar quais delas já estavam removidas antes.
    """
    lixeira.remover(db, exigir_projeto(db, projeto_id))


# ------------------------------------------------------------------ áreas
#
# OS SETORES DA OBRA (migration 0019). Quatro rotas, e cada uma NOMEIA UM ATO —
# a alternativa era `areas` em `ProjetoUpdate`, com o cliente mandando a lista
# pronta. Da lista pronta não se deduz o que se quis fazer: trocar 'COLO1' por
# 'TORRE 1' chega exatamente igual a apagar uma e criar outra, e as duas fazem
# coisas opostas com a auditoria que já está preenchida ali dentro. As regras (e
# a cascata) estão em `services/areas.py`.
#
# `admin_cadastro` para escrever, como disciplinas e projetos: definir setor é
# cadastro, não execução de auditoria.


@router.get("/{projeto_id}/areas", response_model=list[AreaOut])
def listar_areas(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[AreaOut]:
    """As áreas COM o que depende de cada uma.

    Sem paginação, de propósito: são os setores de UMA obra — oito no CPQ11 —, a
    tela os mostra todos, e o `uso()` já é uma consulta só para o conjunto.
    """
    projeto = exigir_projeto_do_usuario(db, projeto_id, user)
    uso = svc_areas.uso(db, projeto)
    return [
        AreaOut(nome=nome, disciplinas=uso[nome][0], auditorias=uso[nome][1])
        for nome in projeto.areas
    ]


@router.post("/{projeto_id}/areas", response_model=list[str], status_code=status.HTTP_201_CREATED)
def criar_area(
    projeto_id: uuid.UUID,
    payload: AreaEscrita,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> list[str]:
    projeto = exigir_projeto(db, projeto_id)
    svc_areas.acrescentar(db, projeto, payload.nome)
    return list(projeto.areas)


@router.patch("/{projeto_id}/areas/{nome}", response_model=list[str])
def renomear_area(
    projeto_id: uuid.UUID,
    nome: str,
    payload: AreaEscrita,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> list[str]:
    """Renomeia AQUI e em quem guarda o nome — disciplinas e auditorias."""
    projeto = exigir_projeto(db, projeto_id)
    svc_areas.renomear(db, projeto, nome, payload.nome)
    return list(projeto.areas)


@router.delete("/{projeto_id}/areas/{nome}", status_code=status.HTTP_204_NO_CONTENT)
def remover_area(
    projeto_id: uuid.UUID,
    nome: str,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    """Recusa (409) se houver auditoria na área. Ver `services/areas.py`."""
    svc_areas.remover(db, exigir_projeto(db, projeto_id), nome)
