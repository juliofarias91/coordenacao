"""SP-201 · Ingestão de modelos vindos do ACC.

Fluxo: fornecedor sobe na pasta MODELS → ACC dispara o webhook → a plataforma
registra a versão e enfileira o download e a auditoria. O handler responde
rápido e passa o trabalho pesado ao worker: um webhook que demora é um webhook
que o ACC repete.

O modelo é encontrado por `acc_item_id`. Um item desconhecido é aceito e
ignorado (202), não recusado — o ACC tem muito arquivo que não é modelo
auditado, e devolver erro para eles encheria o log de ruído.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_auth_db, get_tenant_db, requer_permissao
from app.models import Modelo, VersaoModelo
from app.models.enums import VersaoFormato
from app.services import aps
from app.services.auditoria import ao_registrar_versao
from app.services.escopo import exigir

log = logging.getLogger(__name__)

router = APIRouter(tags=["ingestao"])

FORMATO_POR_EXTENSAO = {"ifc": VersaoFormato.IFC, "rvt": VersaoFormato.REVIT}


class RespostaWebhook(BaseModel):
    aceito: bool
    detalhe: str
    versao_id: uuid.UUID | None = None


@router.post(
    "/ingest/acc/webhook",
    response_model=RespostaWebhook,
    status_code=status.HTTP_202_ACCEPTED,
)
async def webhook_acc(
    request: Request,
    x_adsk_signature: str | None = Header(default=None, alias="x-adsk-signature"),
    db: Session = Depends(get_auth_db),
) -> RespostaWebhook:
    """Recebe `dm.version.added` do ACC.

    Usa a sessão privilegiada porque não há token de usuário aqui: quem chama
    é a Autodesk. O tenant é descoberto pelo `acc_item_id`, que só existe em
    um modelo de uma organização.
    """
    corpo = await request.body()

    if not aps.assinatura_valida(corpo, x_adsk_signature):
        # Sem segredo configurado isto também falha — de propósito.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="assinatura do webhook inválida ou APS_WEBHOOK_SECRET ausente",
        )

    evento = await request.json()
    dados = evento.get("payload", {}) or {}
    item_id = dados.get("lineageUrn") or dados.get("itemId") or dados.get("source")

    if not item_id:
        return RespostaWebhook(aceito=False, detalhe="evento sem identificador de item")

    modelo = db.execute(
        select(Modelo).where(Modelo.acc_item_id == str(item_id))
    ).scalar_one_or_none()
    if modelo is None:
        log.info("webhook ACC ignorado: item %s não corresponde a modelo cadastrado", item_id)
        return RespostaWebhook(
            aceito=False, detalhe="item do ACC não corresponde a nenhum modelo cadastrado"
        )

    rotulo = aps.rotulo_da_versao(evento)
    ja_existe = db.execute(
        select(VersaoModelo).where(
            VersaoModelo.modelo_id == modelo.id, VersaoModelo.versao == rotulo
        )
    ).scalar_one_or_none()
    if ja_existe is not None:
        # O ACC reentrega eventos; registrar de novo criaria round fantasma.
        return RespostaWebhook(
            aceito=True, detalhe="versão já registrada", versao_id=ja_existe.id
        )

    nome = str(dados.get("name") or "")
    extensao = nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
    formato = FORMATO_POR_EXTENSAO.get(extensao)
    if formato is None:
        return RespostaWebhook(
            aceito=False, detalhe=f"extensão não auditada: {extensao or 'desconhecida'}"
        )

    versao = VersaoModelo(
        org_id=modelo.org_id,
        modelo_id=modelo.id,
        versao=rotulo,
        formato=formato,
        autoria=dados.get("createUserName"),
        acc_version=str(dados.get("versionNumber") or ""),
        urn=dados.get("urn"),
    )
    db.add(versao)
    db.flush()
    # `auditor_id` fica nulo: quem registrou foi o ACC, não uma pessoa. Atribuir
    # o auditor é decisão da coordenação, e inventar um aqui poria o nome de
    # alguém num round que ele não sabe que existe.
    ao_registrar_versao(db, org_id=modelo.org_id, versao=versao)

    # SP-301 · o nome do arquivo é conferido na entrada. Divergência gera
    # penalidade no ledger e notifica o responsável — é a primeira automação
    # a dar retorno, e ela acontece antes de qualquer parse de modelo.
    _penalizar_se_nome_divergente(db, modelo, nome, versao.id)

    db.commit()

    # SP-302 · o download e a análise vão para a fila; o webhook responde
    # rápido, porque webhook que demora é webhook que o ACC repete.
    from app.workers.tasks import enfileirar_auditoria

    enfileirar_auditoria(versao.id, modelo.org_id)

    log.info("versão %s registrada para o modelo %s via ACC", rotulo, modelo.codigo)
    return RespostaWebhook(aceito=True, detalhe="versão registrada", versao_id=versao.id)


def _penalizar_se_nome_divergente(
    db: Session, modelo: Modelo, nome_arquivo: str, versao_id: uuid.UUID
) -> None:
    from app.models import Disciplina, NomenclaturaPadrao
    from app.services import penalidades as ledger
    from app.services.automacao import nomenclatura as motor_nome

    padrao = db.execute(
        select(NomenclaturaPadrao)
        .where(
            NomenclaturaPadrao.projeto_id == modelo.projeto_id,
            NomenclaturaPadrao.vigente.is_(True),
        )
        .order_by(NomenclaturaPadrao.created_at.desc())
    ).scalars().first()
    if padrao is None:
        return

    veredito = motor_nome.validar(nome_arquivo, padrao.segmentos)
    if veredito.ok:
        return

    # Responsável = projetista da disciplina; sem ele, a instaladora do modelo.
    responsavel_id = modelo.instaladora_id
    if modelo.disciplina_id:
        disciplina = db.get(Disciplina, modelo.disciplina_id)
        if disciplina and disciplina.projetista_id:
            responsavel_id = disciplina.projetista_id
    if responsavel_id is None:
        log.info("nome divergente em %s, mas sem responsável para penalizar", nome_arquivo)
        return

    ledger.aplicar(
        db,
        org_id=modelo.org_id,
        empresa_id=responsavel_id,
        motivo=f"Nomenclatura divergente no ACC: {veredito.mensagem}",
        referencia=str(versao_id),
    )


class StatusIntegracao(BaseModel):
    configurado: bool
    detalhe: str


@router.get("/ingest/acc/status", response_model=StatusIntegracao)
def status_integracao(
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> StatusIntegracao:
    """Diz à tela de Integrações se o ACC está ligado — sem expor credencial."""
    if not aps.configurado():
        return StatusIntegracao(
            configurado=False,
            detalhe="APS_CLIENT_ID/APS_CLIENT_SECRET ausentes",
        )
    from app.core.config import settings

    if not settings.aps_webhook_secret:
        return StatusIntegracao(
            configurado=False,
            detalhe="credenciais presentes, mas APS_WEBHOOK_SECRET ausente — "
            "o webhook recusaria todos os eventos",
        )
    return StatusIntegracao(configurado=True, detalhe="integração pronta")


@router.post("/modelos/{modelo_id}/vincular-acc", response_model=dict)
def vincular_acc(
    modelo_id: uuid.UUID,
    acc_item_id: str,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> dict[str, str]:
    """Amarra o modelo a um item do ACC — é o que o webhook usa para achá-lo."""
    modelo = exigir(db, Modelo, modelo_id, "modelo")
    modelo.acc_item_id = acc_item_id
    db.flush()
    return {"modelo_id": str(modelo.id), "acc_item_id": acc_item_id}
