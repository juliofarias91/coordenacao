"""Fase 3 · validação de nomenclatura e disparo da auditoria automatizada."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models import Empresa, Modelo, NomenclaturaPadrao, Penalidade, VersaoModelo
from app.schemas.automacao import (
    EnfileiradoOut,
    ExecucaoOut,
    PenalidadeOut,
    ValidarNomeIn,
    ValidarNomeOut,
)
from app.services import penalidades as ledger
from app.services.automacao import executar_auditoria_automatica, verificadores_disponiveis
from app.services.automacao import nomenclatura as motor_nome
from app.services.escopo import conflito, exigir, exigir_projeto_do_usuario

log = logging.getLogger(__name__)

router = APIRouter(tags=["automacao"])


# --------------------------------------------------------------- nomenclatura
@router.post("/nomenclatura/validar", response_model=ValidarNomeOut)
def validar_nomenclatura(
    payload: ValidarNomeIn,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ValidarNomeOut:
    """SP-301 · valida um nome contra o padrão vigente do projeto.

    Validar é livre e sem efeito colateral — a tela precisa poder testar
    nomes. Registrar a penalidade é opt-in (`registrar: true`), e é assim que
    a ingestão do ACC chama quando um arquivo chega fora do padrão.
    """
    exigir_projeto_do_usuario(db, payload.projeto_id, user)

    padrao = db.execute(
        select(NomenclaturaPadrao)
        .where(
            NomenclaturaPadrao.projeto_id == payload.projeto_id,
            NomenclaturaPadrao.vigente.is_(True),
        )
        .order_by(NomenclaturaPadrao.created_at.desc())
    ).scalars().first()
    if padrao is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="projeto sem padrão de nomenclatura vigente; defina em Configuração",
        )

    veredito = motor_nome.validar(payload.nome, padrao.segmentos)

    penalidade_id: uuid.UUID | None = None
    if payload.registrar and not veredito.ok:
        if payload.empresa_id is None:
            raise conflito("informe `empresa_id` para registrar a penalidade")
        exigir(db, Empresa, payload.empresa_id, "empresa")
        penalidade = ledger.aplicar(
            db,
            org_id=user.org_id,
            empresa_id=payload.empresa_id,
            motivo=f"Nomenclatura divergente: {veredito.mensagem}",
            referencia=veredito.nome,
        )
        penalidade_id = penalidade.id

    return ValidarNomeOut(
        ok=veredito.ok,
        nome=veredito.nome,
        padrao=motor_nome.exemplo_do_padrao(padrao.segmentos),
        mensagem=veredito.mensagem,
        segmentos=[
            {
                "k": s.k,
                "valor": s.valor,
                "ok": s.ok,
                "esperados": s.esperados,
                "motivo": s.motivo,
            }
            for s in veredito.segmentos
        ],
        penalidade_id=penalidade_id,
    )


@router.get("/empresas/{empresa_id}/penalidades", response_model=list[PenalidadeOut])
def penalidades_da_empresa(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[PenalidadeOut]:
    """O ledger. `empresa.penalidades` é só o contador materializado disto."""
    exigir(db, Empresa, empresa_id, "empresa")
    linhas = db.execute(
        select(Penalidade)
        .where(Penalidade.empresa_id == empresa_id)
        .order_by(Penalidade.created_at.desc())
    ).scalars()
    return [PenalidadeOut.model_validate(p) for p in linhas]


# A leitura de notificações mudou-se para `api/v1/notificacoes.py` na Fase 4
# (SP-401), que acrescentou contador de não-lidas e marcação de leitura.


# ----------------------------------------------------------------- auditoria
@router.get("/automacao/verificadores", response_model=list[str])
def listar_verificadores(
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[str]:
    """Códigos de critério com verificador dedicado.

    Critérios fora desta lista ainda rodam automaticamente se tiverem
    `parametro_esperado` — o verificador genérico cobre todos os 4D_* e BF_*.
    """
    return verificadores_disponiveis()


@router.post("/versoes/{versao_id}/auditar-automatico", response_model=ExecucaoOut)
def auditar_automatico(
    versao_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> ExecucaoOut:
    """Roda a automação agora, de forma síncrona.

    É o botão da tela e o caminho de depuração. Para o fluxo normal — versão
    chegando pelo ACC — quem dispara é o worker (`POST .../enfileirar`), que
    não prende a requisição enquanto um IFC grande é analisado.
    """
    versao = exigir(db, VersaoModelo, versao_id, "versão")
    try:
        relatorio = executar_auditoria_automatica(
            db, versao, org_id=user.org_id, auditor_id=user.id
        )
    except ValueError as exc:
        raise conflito(str(exc)) from exc

    if relatorio.erros:
        ledger.avisar_erro(
            db,
            org_id=user.org_id,
            mensagem=f"Auditoria automática com falhas: {'; '.join(relatorio.erros[:3])}",
            origem=str(versao_id),
        )

    return ExecucaoOut(**vars(relatorio), resumo=relatorio.resumo)


@router.post(
    "/versoes/{versao_id}/enfileirar",
    response_model=EnfileiradoOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def enfileirar_auditoria(
    versao_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> EnfileiradoOut:
    """SP-302 · manda a análise para a fila.

    Se o broker estiver fora do ar, a resposta diz isso em vez de estourar:
    a versão já está registrada, e reenfileirar é barato.
    """
    exigir(db, VersaoModelo, versao_id, "versão")
    from app.workers.tasks import enfileirar_auditoria as enfileirar

    task_id = enfileirar(versao_id, user.org_id)
    if task_id is None:
        return EnfileiradoOut(
            enfileirado=False,
            detalhe=(
                "fila indisponível (Redis fora do ar); use `auditar-automatico` "
                "para rodar agora, ou tente de novo quando o worker subir"
            ),
        )
    return EnfileiradoOut(enfileirado=True, task_id=task_id, detalhe="análise enfileirada")


@router.get("/modelos/{modelo_id}/nome-conforme", response_model=ValidarNomeOut)
def conferir_nome_do_modelo(
    modelo_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ValidarNomeOut:
    """Atalho: valida o código do modelo já cadastrado."""
    modelo = exigir(db, Modelo, modelo_id, "modelo")
    entrada = ValidarNomeIn(
        nome=modelo.codigo, projeto_id=modelo.projeto_id, registrar=False
    )
    return validar_nomenclatura(entrada, db=db, user=user)
