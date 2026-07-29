"""SP-202 · Modelos e versões, com upload manual do arquivo.

CA: subir .ifc/.rvt manualmente cria versão equivalente ao fluxo do ACC — por
isso o efeito colateral (desatualizar rounds anteriores, enfileirar auditoria)
mora no serviço, e não no handler do webhook.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import Disciplina, Empresa, Modelo, VersaoModelo
from app.models.enums import VersaoFormato
from app.schemas.modelo import (
    ModeloCreate,
    ModeloDetalhe,
    ModeloOut,
    ModeloUpdate,
    VersaoCreate,
    VersaoOut,
)
from app.services import storage
from app.services.auditoria import ao_registrar_versao
from app.services.escopo import conflito, exigir, exigir_projeto, ja_existe
from app.services.storage import StorageError

router = APIRouter(tags=["modelos"])

EXTENSOES = {".ifc": VersaoFormato.IFC, ".rvt": VersaoFormato.REVIT}
# Modelo BIM é arquivo grande; 512 MB cobre o CPQ11 com folga e ainda barra
# alguém subindo um backup inteiro por engano.
TAMANHO_MAX = 512 * 1024 * 1024


def _validar_referencias(db: Session, dados: dict) -> None:
    if dados.get("disciplina_id"):
        exigir(db, Disciplina, dados["disciplina_id"], "disciplina")
    for campo in ("instaladora_id", "modeladora_id"):
        if dados.get(campo):
            exigir(db, Empresa, dados[campo], "empresa")


# ------------------------------------------------------------------ modelos
@router.get("/modelos", response_model=Page[ModeloOut])
def listar_modelos(
    projeto_id: uuid.UUID | None = Query(default=None),
    disciplina_id: uuid.UUID | None = Query(default=None),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[ModeloOut]:
    stmt = select(Modelo)
    if projeto_id is not None:
        stmt = stmt.where(Modelo.projeto_id == projeto_id)
    if disciplina_id is not None:
        stmt = stmt.where(Modelo.disciplina_id == disciplina_id)
    stmt = aplicar_cursor(stmt, Modelo, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, ModeloOut.model_validate)


@router.post("/modelos", response_model=ModeloOut, status_code=status.HTTP_201_CREATED)
def criar_modelo(
    payload: ModeloCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ModeloOut:
    exigir_projeto(db, payload.projeto_id)
    dados = payload.model_dump()
    _validar_referencias(db, dados)

    codigo = payload.codigo.strip().upper()
    if ja_existe(
        db,
        select(Modelo).where(Modelo.projeto_id == payload.projeto_id, Modelo.codigo == codigo),
    ):
        raise conflito(f"já existe o modelo {codigo} neste projeto")

    modelo = Modelo(org_id=user.org_id, **{**dados, "codigo": codigo})
    db.add(modelo)
    db.flush()
    return ModeloOut.model_validate(modelo)


@router.get("/modelos/{modelo_id}", response_model=ModeloDetalhe)
def obter_modelo(
    modelo_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ModeloDetalhe:
    modelo = db.execute(
        select(Modelo).options(selectinload(Modelo.versoes)).where(Modelo.id == modelo_id)
    ).scalar_one_or_none()
    if modelo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="modelo não encontrado")
    return ModeloDetalhe.model_validate(modelo)


@router.patch("/modelos/{modelo_id}", response_model=ModeloOut)
def atualizar_modelo(
    modelo_id: uuid.UUID,
    payload: ModeloUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ModeloOut:
    modelo = exigir(db, Modelo, modelo_id, "modelo")
    dados = payload.model_dump(exclude_unset=True)
    _validar_referencias(db, dados)
    for campo, valor in dados.items():
        setattr(modelo, campo, valor)
    db.flush()
    return ModeloOut.model_validate(modelo)


# ------------------------------------------------------------------ versões
@router.get("/modelos/{modelo_id}/versoes", response_model=list[VersaoOut])
def listar_versoes(
    modelo_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[VersaoOut]:
    exigir(db, Modelo, modelo_id, "modelo")
    versoes = db.execute(
        select(VersaoModelo)
        .where(VersaoModelo.modelo_id == modelo_id)
        .order_by(VersaoModelo.created_at.desc())
    ).scalars()
    return [VersaoOut.model_validate(v) for v in versoes]


@router.post(
    "/modelos/{modelo_id}/versoes", response_model=VersaoOut, status_code=status.HTTP_201_CREATED
)
def criar_versao(
    modelo_id: uuid.UUID,
    payload: VersaoCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> VersaoOut:
    """Registra a versão. O arquivo sobe em seguida, por `/versoes/{id}/upload`.

    A AUDITORIA GERAL NASCE COM A VERSÃO. Antes ela esperava alguém clicar
    "Abrir auditorias" na tela do modelo, e o efeito era um modelo recém-criado
    sem lugar para lançar nada — a planilha em branco que a coordenação tinha
    de criar à mão, só agora dentro do sistema. Se todo modelo responde os 17
    itens, a folha deles não é um passo, é o estado inicial.

    Só a GERAL, e não todos os checklists da disciplina: os recortes de LOD e o
    4D são trabalho dirigido, que começa quando a coordenação decide começar.
    Abrir os seis de uma vez encheria a tela do modelo de rounds vazios e faria
    o painel contar como "em andamento" auditoria que ninguém abriu.
    """
    exigir(db, Modelo, modelo_id, "modelo")

    rotulo = payload.versao.strip().upper()
    if ja_existe(
        db,
        select(VersaoModelo).where(
            VersaoModelo.modelo_id == modelo_id, VersaoModelo.versao == rotulo
        ),
    ):
        raise conflito(f"a versão {rotulo} já existe neste modelo")

    versao = VersaoModelo(
        org_id=user.org_id,
        modelo_id=modelo_id,
        **{**payload.model_dump(exclude={"versao"}), "versao": rotulo},
    )
    db.add(versao)
    db.flush()

    ao_registrar_versao(db, org_id=user.org_id, versao=versao, auditor_id=user.id)
    return VersaoOut.model_validate(versao)


@router.post("/versoes/{versao_id}/upload", response_model=VersaoOut)
async def enviar_arquivo(
    versao_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> VersaoOut:
    versao = exigir(db, VersaoModelo, versao_id, "versão")

    ext = storage.extensao_segura(arquivo.filename or "", set(EXTENSOES))
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"formato não aceito; use {', '.join(sorted(EXTENSOES))}",
        )
    if EXTENSOES[ext] != versao.formato:
        raise conflito(
            f"a versão foi registrada como {versao.formato.value}, "
            f"mas o arquivo é {EXTENSOES[ext].value}"
        )

    conteudo = await arquivo.read()
    if len(conteudo) > TAMANHO_MAX:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"arquivo acima de {TAMANHO_MAX // (1024 * 1024)} MB",
        )

    try:
        versao.arquivo_url = storage.enviar(
            user.org_id,
            f"modelos/{versao.modelo_id}/{versao.versao}{ext}",
            conteudo,
            "application/octet-stream",
        )
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    db.flush()

    # SP-302 · com arquivo no lugar, a automação já pode rodar. Falha de fila
    # não invalida o upload: a versão está gravada, e reenfileirar é barato.
    from app.workers.tasks import enfileirar_auditoria

    enfileirar_auditoria(versao.id, user.org_id)

    return VersaoOut.model_validate(versao)


@router.get("/versoes/{versao_id}/download")
def baixar_arquivo(
    versao_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> dict[str, str]:
    """URL temporária. O bucket nunca é público."""
    versao = exigir(db, VersaoModelo, versao_id, "versão")
    if not versao.arquivo_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="versão ainda sem arquivo"
        )
    try:
        return {"url": storage.url_assinada(versao.arquivo_url)}
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
