"""SP-203/204/205 · Execução da auditoria, não-conformidades e publicação.

Esta é a única entrada de dado do sistema. Painel, matriz, relatório e KPIs
são consultas sobre o que se grava aqui.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models import (
    Auditoria,
    ComentarioFornecedor,
    Criterio,
    Disciplina,
    Empresa,
    Evidencia,
    Modelo,
    NaoConformidade,
    Ocorrencia,
    Projeto,
    ResultadoCheck,
    Usuario,
    VersaoModelo,
)
from app.models.enums import AuditoriaEstado, ChecklistTipo, CheckStatus, OrigemResult
from app.schemas.auditoria import (
    AbrirAuditoria,
    AuditoriaDaLista,
    AuditoriaDetalhe,
    AuditoriaOut,
    AuditoriaUpdate,
    ComentarioCreate,
    ComentarioOut,
    EvidenciaOut,
    NaoConformidadeCreate,
    NaoConformidadeOut,
    NaoConformidadeUpdate,
    PlanoAuditoria,
    ResultadoOut,
    ResultadoUpdate,
)
from app.services import lixeira, storage
from app.services.auditoria import (
    CHECKLISTS_POR_AREA,
    abrir_auditoria,
    areas_da_versao,
    checklists_da_versao,
    itens_pendentes,
    publicar,
    recalcular_aprovacao,
)
from app.services.escopo import conflito, exigir
from app.services.storage import StorageError

router = APIRouter(tags=["auditorias"])

EVIDENCIA_EXTENSOES = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
EVIDENCIA_TIPOS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}
EVIDENCIA_TAMANHO_MAX = 10 * 1024 * 1024


def _exigir_round_aberto(db: Session, auditoria_id: uuid.UUID) -> Auditoria:
    """Round publicado é registro: não muda mais.

    Vale para tudo que compõe o que o round diz — status, comentário e também
    evidência, que o relatório em PDF renderiza. Anexar ou remover evidência
    depois de publicar mudaria, em silêncio, um documento já emitido.
    """
    auditoria = exigir(db, Auditoria, auditoria_id, "auditoria")
    if auditoria.estado == AuditoriaEstado.PUBLICADO:
        raise conflito(
            "auditoria publicada não aceita edição; abra um novo round na próxima versão"
        )
    return auditoria


def _carregar_detalhe(db: Session, auditoria: Auditoria) -> AuditoriaDetalhe:
    resultados = db.execute(
        select(ResultadoCheck)
        .options(
            selectinload(ResultadoCheck.criterio),
            selectinload(ResultadoCheck.ocorrencias),
            selectinload(ResultadoCheck.evidencias),
        )
        .join(Criterio, Criterio.id == ResultadoCheck.criterio_id)
        .where(ResultadoCheck.auditoria_id == auditoria.id)
        .order_by(Criterio.categoria.nulls_last(), Criterio.codigo)
    ).scalars()

    detalhe = AuditoriaDetalhe.model_validate(auditoria)
    detalhe.resultados = [ResultadoOut.model_validate(r) for r in resultados]
    detalhe.pendentes = itens_pendentes(db, auditoria)
    return detalhe


# ------------------------------------------------------------ abrir / ler
@router.post(
    "/versoes/{versao_id}/auditar",
    response_model=list[AuditoriaOut],
    status_code=status.HTTP_201_CREATED,
)
def auditar(
    versao_id: uuid.UUID,
    payload: AbrirAuditoria,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> list[AuditoriaOut]:
    """Abre as auditorias aplicáveis a esta versão.

    Sem `checklist`, abre todos os que a disciplina declara — é o caminho
    normal, e evita o auditor ter de lembrar quais se aplicam. A operação é
    idempotente: repetir devolve as auditorias já abertas.

    OS RECORTES DE ESPECIFICAÇÃO ABREM UMA AUDITORIA POR ÁREA. Até 30/07/2026
    `area` só era gravada quando o chamador a informava, e nenhum caminho normal
    informava: toda auditoria nascia com `area = NULL`. O efeito era a matriz
    modelo × área permanentemente vazia — ela busca a célula por
    `(versao_id, area)` e não casava com coluna nenhuma.

    Quem resolveu a dúvida foram os arquivos da coordenação: os controles de LOD
    400 e 500 em `Bases/` têm UMA ABA POR ÁREA (ADMN, COLO1…, SITE, UTLS), com o
    round e o percentual de cada modelo dentro dela. A auditoria de
    especificação é por área no processo real, então é por área aqui.

    A geral, o IFC e o 4D continuam sem área — são do arquivo inteiro.
    """
    versao = exigir(db, VersaoModelo, versao_id, "versão")

    if payload.checklist is not None:
        alvos: list[ChecklistTipo] = [payload.checklist]
    else:
        alvos = checklists_da_versao(db, versao)
        if not alvos:
            raise conflito(
                "a disciplina deste modelo não declara nenhum checklist "
                "(configure em Disciplinas)"
            )

    areas_da_disciplina = areas_da_versao(db, versao)

    abertas: list[Auditoria] = []
    for c in alvos:
        for area in _areas_do_checklist(c, payload.area, areas_da_disciplina):
            auditoria = abrir_auditoria(
                db,
                org_id=user.org_id,
                versao=versao,
                checklist=c,
                area=area,
                auditor_id=payload.auditor_id or user.id,
            )
            _aplicar_plano(auditoria, payload)
            abertas.append(auditoria)
    db.flush()
    return [AuditoriaOut.model_validate(a) for a in abertas]


def _aplicar_plano(auditoria: Auditoria, plano: PlanoAuditoria) -> None:
    """Grava o que foi PLANEJADO, ignorando o que não veio.

    APLICA-SE TAMBÉM À AUDITORIA QUE JÁ EXISTIA. `abrir_auditoria` é idempotente
    — repetir devolve a que está aberta em vez de duplicar o round —, e sem isto
    quem preenchesse a gaveta para um par (modelo, checklist) já aberto veria o
    responsável e as datas que acabou de digitar sumirem sem aviso. Abrir a
    gaveta de novo é REPLANEJAR, e replanejar grava.

    `exclude_unset`: campo ausente é "não mexa", diferente de `null`, que é
    "apague". Sem isso um PATCH de prioridade limparia o responsável.
    """
    for campo, valor in plano.model_dump(
        exclude_unset=True, include=set(PlanoAuditoria.model_fields)
    ).items():
        setattr(auditoria, campo, valor)


def _areas_do_checklist(
    checklist: ChecklistTipo, pedida: str | None, da_disciplina: list[str]
) -> list[str | None]:
    """Em quantas áreas este checklist se desdobra.

    `[None]` é uma auditoria só, do arquivo inteiro — e é o padrão. Uma área
    pedida explicitamente sempre ganha: é como se auditava LOD 400 antes desta
    mudança, e continuar aceitando mantém os links e scripts que já existiam.

    Se a disciplina não declara área nenhuma, o de especificação também vira
    uma auditoria só. Recusar seria travar o trabalho por uma configuração que
    a coordenação talvez ainda vá preencher.
    """
    if pedida is not None:
        return [pedida]
    if checklist in CHECKLISTS_POR_AREA and da_disciplina:
        return list(da_disciplina)
    return [None]


@router.get("/versoes/{versao_id}/auditorias", response_model=list[AuditoriaOut])
def listar_auditorias_da_versao(
    versao_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[AuditoriaOut]:
    exigir(db, VersaoModelo, versao_id, "versão")
    auditorias = db.execute(
        select(Auditoria)
        .where(Auditoria.versao_id == versao_id)
        .order_by(Auditoria.checklist, Auditoria.area.nulls_first())
    ).scalars()
    return [AuditoriaOut.model_validate(a) for a in auditorias]


@router.post(
    "/modelos/{modelo_id}/auditar",
    response_model=list[AuditoriaOut],
    status_code=status.HTTP_201_CREATED,
)
def auditar_modelo(
    modelo_id: uuid.UUID,
    payload: AbrirAuditoria,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> list[AuditoriaOut]:
    """Audita a ÚLTIMA versão de um modelo.

    A gaveta de nova auditoria escolhe um MODELO — é assim que a coordenação
    pensa ("auditar o STRC") — mas a auditoria pertence a uma VERSÃO, porque é a
    versão que muda e é contra ela que o round se compara. Resolver a última
    versão aqui evita que a tela tenha de listar versões só para descartar todas
    menos uma; `/versoes/{id}/auditar` continua existindo para quem precisa
    apontar uma versão específica.

    A ORDEM É `created_at` E NÃO O NOME DA VERSÃO. 'V10' vem antes de 'V9' em
    ordem alfabética, e `versao` é Text — não há número a comparar.
    """
    exigir(db, Modelo, modelo_id, "modelo")
    versao = db.execute(
        select(VersaoModelo)
        .where(VersaoModelo.modelo_id == modelo_id)
        .order_by(VersaoModelo.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if versao is None:
        raise conflito(
            "este modelo ainda não tem versão; cadastre uma antes de abrir auditoria"
        )
    return auditar(versao.id, payload, db, user)


@router.get("/projetos/{projeto_id}/auditorias", response_model=list[AuditoriaDaLista])
def listar_auditorias_do_projeto(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[AuditoriaDaLista]:
    """Todas as auditorias do projeto, com o modelo já resolvido.

    É o que o painel da tela de auditoria consome para listar, dentro de cada
    tipo, os modelos auditados. Devolve o projeto INTEIRO e sem filtro de busca:
    são dezenas de linhas, e filtrar no navegador é instantâneo — a mesma razão
    pela qual a busca global não tem endpoint próprio. Quando não couber mais na
    memória do navegador, entra paginação aqui.
    """
    exigir(db, Projeto, projeto_id, "projeto")

    linhas = db.execute(
        select(
            Auditoria,
            Modelo.id,
            Modelo.codigo,
            VersaoModelo.versao,
            Usuario.nome,
            Disciplina.codigo,
            Disciplina.nome,
            Disciplina.macro,
        )
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        # `outerjoin`: auditoria sem responsável é normal — a que nasce junto com
        # a versão pelo webhook do ACC não tem ninguém atribuído. E modelo sem
        # disciplina também: ela é `SET NULL` e o modelo pode ser cadastrado antes
        # de a disciplina existir.
        .outerjoin(Usuario, Usuario.id == Auditoria.auditor_id)
        .outerjoin(Disciplina, Disciplina.id == Modelo.disciplina_id)
        # A ORDEM DA DISCIPLINA ENTRA AQUI, antes do código do modelo: o painel
        # agrupa por disciplina dentro de cada recorte, e ordenar no servidor
        # poupa a tela de reordenar o que já veio pronto. `nulls_last` para o
        # modelo sem disciplina cair no fim, e não abrir a lista.
        .where(Modelo.projeto_id == projeto_id)
        .order_by(
            Auditoria.checklist,
            Disciplina.codigo.nulls_last(),
            Modelo.codigo,
            Auditoria.area.nulls_first(),
        )
    ).all()

    saida: list[AuditoriaDaLista] = []
    for (
        auditoria,
        modelo_id,
        modelo_codigo,
        versao_rotulo,
        auditor_nome,
        disc_codigo,
        disc_nome,
        disc_macro,
    ) in linhas:
        item = AuditoriaDaLista.model_validate(auditoria)
        item.modelo_id = modelo_id
        item.modelo_codigo = modelo_codigo
        item.versao_rotulo = versao_rotulo
        item.auditor_nome = auditor_nome
        item.disciplina_codigo = disc_codigo
        item.disciplina_nome = disc_nome
        item.disciplina_macro = disc_macro
        saida.append(item)
    return saida


@router.patch("/auditorias/{auditoria_id}", response_model=AuditoriaOut)
def atualizar_auditoria(
    auditoria_id: uuid.UUID,
    payload: AuditoriaUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("executar")),
) -> AuditoriaOut:
    """Replaneja: responsável, datas, andamento e prioridade.

    Não toca em resultado nem em `estado` — quem publica é
    `POST /auditorias/{id}/publicar`, e é ele que congela o round.

    ROUND PUBLICADO NÃO ACEITA: é a mesma regra de `_exigir_round_aberto`, e
    vale aqui porque o relatório em PDF já emitido nomeia o responsável e a
    data. Trocá-los depois reescreveria, em silêncio, um documento que já saiu.
    """
    auditoria = _exigir_round_aberto(db, auditoria_id)
    _aplicar_plano(auditoria, payload)
    db.flush()
    return AuditoriaOut.model_validate(auditoria)


@router.get("/auditorias/{auditoria_id}", response_model=AuditoriaDetalhe)
def obter_auditoria(
    auditoria_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> AuditoriaDetalhe:
    return _carregar_detalhe(db, exigir(db, Auditoria, auditoria_id, "auditoria"))


# ---------------------------------------------------------------- resultado
@router.patch("/resultados/{resultado_id}", response_model=ResultadoOut)
def atualizar_resultado(
    resultado_id: uuid.UUID,
    payload: ResultadoUpdate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> ResultadoOut:
    """Ajusta um item da auditoria e recalcula a aprovação na hora.

    Editar um resultado marca a origem como `manual` mesmo que ele tenha
    nascido de um worker: a partir daí a responsabilidade é de quem editou, e
    a Fase 3 não pode sobrescrever esse julgamento silenciosamente.
    """
    resultado = exigir(db, ResultadoCheck, resultado_id, "resultado")
    auditoria = _exigir_round_aberto(db, resultado.auditoria_id)

    dados = payload.model_dump(exclude_unset=True)
    elementos = dados.pop("elementos", None)

    for campo, valor in dados.items():
        setattr(resultado, campo, valor)
    if dados:
        resultado.origem = OrigemResult.MANUAL

    if elementos is not None:
        for antiga in list(resultado.ocorrencias):
            db.delete(antiga)
        db.flush()
        for element_id in elementos:
            db.add(
                Ocorrencia(
                    org_id=user.org_id, resultado_id=resultado.id, element_id=element_id
                )
            )
        db.flush()

    recalcular_aprovacao(db, auditoria)
    db.refresh(resultado)
    return ResultadoOut.model_validate(resultado)


@router.post(
    "/resultados/{resultado_id}/evidencias",
    response_model=EvidenciaOut,
    status_code=status.HTTP_201_CREATED,
)
async def enviar_evidencia(
    resultado_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    legenda: str | None = Query(default=None),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> EvidenciaOut:
    resultado = exigir(db, ResultadoCheck, resultado_id, "resultado")
    _exigir_round_aberto(db, resultado.auditoria_id)

    ext = storage.extensao_segura(arquivo.filename or "", EVIDENCIA_EXTENSOES)
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"formato não aceito; use {', '.join(sorted(EVIDENCIA_EXTENSOES))}",
        )

    conteudo = await arquivo.read()
    if len(conteudo) > EVIDENCIA_TAMANHO_MAX:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="evidência acima de 10 MB",
        )

    try:
        chave = storage.enviar(
            user.org_id,
            f"evidencias/{resultado_id}/{uuid.uuid4().hex}{ext}",
            conteudo,
            EVIDENCIA_TIPOS[ext],
        )
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    evidencia = Evidencia(
        org_id=user.org_id, resultado_id=resultado.id, arquivo_url=chave, legenda=legenda
    )
    db.add(evidencia)
    db.flush()
    return EvidenciaOut.model_validate(evidencia)


@router.get("/evidencias/{evidencia_id}/url")
def url_da_evidencia(
    evidencia_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> dict[str, str]:
    evidencia = exigir(db, Evidencia, evidencia_id, "evidência")
    try:
        return {"url": storage.url_assinada(evidencia.arquivo_url)}
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.delete("/evidencias/{evidencia_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_evidencia(
    evidencia_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("executar")),
) -> None:
    evidencia = exigir(db, Evidencia, evidencia_id, "evidência")
    resultado = exigir(db, ResultadoCheck, evidencia.resultado_id, "resultado")
    _exigir_round_aberto(db, resultado.auditoria_id)
    lixeira.remover(db, evidencia)


# --------------------------------------------------------------- publicação
@router.post("/auditorias/{auditoria_id}/publicar", response_model=AuditoriaOut)
def publicar_auditoria(
    auditoria_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("publicar")),
) -> AuditoriaOut:
    """Fecha o round.

    Publicar com item pendente é recusado: um round publicado é o que alimenta
    painel, relatório e portal do cliente, e "pendente" ali significaria um
    percentual que ninguém sabe interpretar.
    """
    auditoria = exigir(db, Auditoria, auditoria_id, "auditoria")

    if auditoria.estado == AuditoriaEstado.PUBLICADO:
        raise conflito("esta auditoria já está publicada")

    pendentes = itens_pendentes(db, auditoria)
    if pendentes:
        raise conflito(f"ainda há {pendentes} item(ns) pendente(s); conclua antes de publicar")

    return AuditoriaOut.model_validate(publicar(db, auditoria, user.id))


# ---------------------------------------------------------- não-conformidade
@router.get("/auditorias/{auditoria_id}/ncs", response_model=list[NaoConformidadeOut])
def listar_ncs(
    auditoria_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[NaoConformidadeOut]:
    exigir(db, Auditoria, auditoria_id, "auditoria")
    ncs = db.execute(
        select(NaoConformidade)
        .options(selectinload(NaoConformidade.comentarios))
        .where(NaoConformidade.auditoria_id == auditoria_id)
        .order_by(NaoConformidade.created_at)
    ).scalars()
    return [NaoConformidadeOut.model_validate(nc) for nc in ncs]


@router.post(
    "/auditorias/{auditoria_id}/ncs",
    response_model=NaoConformidadeOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_nc(
    auditoria_id: uuid.UUID,
    payload: NaoConformidadeCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> NaoConformidadeOut:
    """Gera a NC a partir de um item reprovado.

    Quando vem de um `resultado_id`, o critério, os IDs dos elementos e as duas
    frases da linha são herdados — é o caminho normal, e evita redigitar o que a
    auditoria já sabe. As frases vêm com os papéis preservados: o DIAGNÓSTICO
    (`comentario`) vira a descrição, a ORIENTAÇÃO (`direcao`) vira a
    recomendação. Cruzá-las mandaria ao fornecedor o texto interno como se
    fosse a instrução de correção.

    O que o payload traz explicitamente ganha do herdado: quem escreveu uma
    descrição na hora de abrir a NC quis outra frase, não a da planilha.
    """
    auditoria = exigir(db, Auditoria, auditoria_id, "auditoria")
    dados = payload.model_dump()

    if payload.resultado_id is not None:
        resultado = exigir(db, ResultadoCheck, payload.resultado_id, "resultado")
        if resultado.auditoria_id != auditoria.id:
            raise conflito("o resultado não pertence a esta auditoria")
        if resultado.status != CheckStatus.REPROVADO:
            raise conflito("só itens reprovados geram não-conformidade")
        dados["criterio_id"] = dados.get("criterio_id") or resultado.criterio_id
        if not dados.get("elementos") and resultado.ocorrencias:
            dados["elementos"] = ", ".join(o.element_id for o in resultado.ocorrencias)
        if not dados.get("descricao"):
            dados["descricao"] = resultado.comentario
        if not dados.get("recomendacao"):
            dados["recomendacao"] = resultado.direcao

    if dados.get("responsavel_id"):
        exigir(db, Empresa, dados["responsavel_id"], "empresa responsável")

    nc = NaoConformidade(org_id=user.org_id, auditoria_id=auditoria.id, **dados)
    db.add(nc)
    db.flush()
    return NaoConformidadeOut.model_validate(nc)


@router.patch("/ncs/{nc_id}", response_model=NaoConformidadeOut)
def atualizar_nc(
    nc_id: uuid.UUID,
    payload: NaoConformidadeUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("executar")),
) -> NaoConformidadeOut:
    nc = exigir(db, NaoConformidade, nc_id, "não-conformidade")
    dados = payload.model_dump(exclude_unset=True)
    if dados.get("responsavel_id"):
        exigir(db, Empresa, dados["responsavel_id"], "empresa responsável")
    for campo, valor in dados.items():
        setattr(nc, campo, valor)
    db.flush()
    return NaoConformidadeOut.model_validate(nc)


@router.post(
    "/ncs/{nc_id}/comentarios",
    response_model=ComentarioOut,
    status_code=status.HTTP_201_CREATED,
)
def comentar_nc(
    nc_id: uuid.UUID,
    payload: ComentarioCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ComentarioOut:
    """Loop de resposta do fornecedor (a coluna SUPPLIERS COMMENTS do LOD 400).

    Exige só `ver_painel` de propósito: o fornecedor precisa responder à NC
    sem poder mexer no resultado da auditoria.
    """
    nc = exigir(db, NaoConformidade, nc_id, "não-conformidade")
    comentario = ComentarioFornecedor(
        org_id=user.org_id, nc_id=nc.id, usuario_id=user.id, texto=payload.texto
    )
    db.add(comentario)
    db.flush()
    return ComentarioOut.model_validate(comentario)


@router.get("/projetos/{projeto_id}/ncs", response_model=list[NaoConformidadeOut])
def listar_ncs_do_projeto(
    projeto_id: uuid.UUID,
    status_filtro: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[NaoConformidadeOut]:
    """Todas as NCs do projeto — a base do relatório de RNC."""
    stmt = (
        select(NaoConformidade)
        .options(selectinload(NaoConformidade.comentarios))
        .join(Auditoria, Auditoria.id == NaoConformidade.auditoria_id)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto_id)
        .order_by(NaoConformidade.created_at.desc())
    )
    if status_filtro:
        stmt = stmt.where(NaoConformidade.status == status_filtro)
    return [NaoConformidadeOut.model_validate(nc) for nc in db.execute(stmt).scalars()]
