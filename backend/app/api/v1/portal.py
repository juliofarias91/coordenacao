"""SP-405 · Portal do cliente, com visibilidade por campo.

CA: convite gera token; `GET /portal/{token}` retorna só as seções e colunas
liberadas; nunca expõe a API interna.

Duas decisões de segurança que sustentam esse "nunca expõe":

1. **O portal não reaproveita nenhum endpoint interno.** Ele monta a própria
   resposta a partir das views derivadas. Um endpoint compartilhado acabaria,
   um dia, ganhando um campo que o cliente não deveria ver.

2. **O token resolve o tenant, e a sessão é amarrada a ele.** Depois de achar
   o convite, abrimos uma sessão de aplicação com `set_tenant` da organização
   do convite: o row-level security passa a valer também aqui, e um bug de
   filtro não vaza dado de outro cliente.
"""

from __future__ import annotations

import secrets
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_auth_db, get_tenant_db, requer_permissao
from app.db.session import SessionLocal, set_tenant
from app.models import ConviteCliente, Projeto
from app.schemas.comum import ESCRITA, Identificado
from app.services import kpis as servico_kpis
from app.services import painel as servico_painel
from app.services.escopo import exigir, exigir_projeto

router = APIRouter(tags=["portal"])

# Seções que o convite pode liberar. O padrão é o do protótipo.
SECOES_PADRAO = {"painel": True, "matriz": True, "relatorio": False, "avanco": True}

# Colunas do painel. `co` (construtora/projetista) vem desligada por padrão:
# é o dado que mais costuma ser sensível numa obra com vários fornecedores.
COLUNAS_PADRAO = {
    "code": True,
    "disc": True,
    "co": False,
    "ver": True,
    "appr": True,
    "status": True,
}


class ConviteIn(BaseModel):
    model_config = ESCRITA

    cliente_nome: str | None = Field(default=None, max_length=200)
    cliente_email: EmailStr | None = None
    secoes: dict[str, bool] | None = None
    colunas: dict[str, bool] | None = None


class ConviteUpdate(ConviteIn):
    ativo: bool | None = None


class ConviteOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    cliente_nome: str | None
    cliente_email: str | None
    secoes: dict[str, Any] | None
    colunas: dict[str, Any] | None
    token: str
    ativo: bool


class PortalOut(BaseModel):
    projeto: dict[str, Any]
    secoes: dict[str, bool]
    colunas: dict[str, bool]
    painel: list[dict[str, Any]] | None = None
    matriz: dict[str, Any] | None = None
    avanco: dict[str, Any] | None = None
    relatorio: dict[str, Any] | None = None


# ------------------------------------------------------------------ convites
@router.post(
    "/projetos/{projeto_id}/convites",
    response_model=ConviteOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_convite(
    projeto_id: uuid.UUID,
    payload: ConviteIn,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ConviteOut:
    exigir_projeto(db, projeto_id)
    convite = ConviteCliente(
        org_id=user.org_id,
        projeto_id=projeto_id,
        cliente_nome=payload.cliente_nome,
        cliente_email=str(payload.cliente_email) if payload.cliente_email else None,
        secoes={**SECOES_PADRAO, **(payload.secoes or {})},
        colunas={**COLUNAS_PADRAO, **(payload.colunas or {})},
        # 32 bytes de urlsafe: o token é a única credencial do portal.
        token=secrets.token_urlsafe(32),
    )
    db.add(convite)
    db.flush()
    return ConviteOut.model_validate(convite)


@router.get("/projetos/{projeto_id}/convites", response_model=list[ConviteOut])
def listar_convites(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> list[ConviteOut]:
    exigir_projeto(db, projeto_id)
    convites = db.execute(
        select(ConviteCliente)
        .where(ConviteCliente.projeto_id == projeto_id)
        .order_by(ConviteCliente.created_at.desc())
    ).scalars()
    return [ConviteOut.model_validate(c) for c in convites]


@router.patch("/convites/{convite_id}", response_model=ConviteOut)
def atualizar_convite(
    convite_id: uuid.UUID,
    payload: ConviteUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ConviteOut:
    convite = exigir(db, ConviteCliente, convite_id, "convite")
    dados = payload.model_dump(exclude_unset=True)

    # Mesclagem, não substituição: a tela liga um campo por vez.
    if "secoes" in dados and dados["secoes"] is not None:
        convite.secoes = {**(convite.secoes or SECOES_PADRAO), **dados.pop("secoes")}
    if "colunas" in dados and dados["colunas"] is not None:
        convite.colunas = {**(convite.colunas or COLUNAS_PADRAO), **dados.pop("colunas")}

    for campo, valor in dados.items():
        if campo in ("secoes", "colunas"):
            continue
        setattr(convite, campo, str(valor) if campo == "cliente_email" and valor else valor)
    db.flush()
    return ConviteOut.model_validate(convite)


@router.post("/convites/{convite_id}/revogar", response_model=ConviteOut)
def revogar_convite(
    convite_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ConviteOut:
    """Desliga o acesso sem apagar o histórico de quem foi convidado."""
    convite = exigir(db, ConviteCliente, convite_id, "convite")
    convite.ativo = False
    db.flush()
    return ConviteOut.model_validate(convite)


# -------------------------------------------------------------------- portal
def _filtrar_linha(linha: Any, colunas: dict[str, bool]) -> dict[str, Any]:
    """Monta a linha do painel campo a campo, incluindo só o que foi liberado.

    Lista de inclusão e não de exclusão: um campo novo no painel interno não
    aparece no portal até alguém decidir que deve.
    """
    saida: dict[str, Any] = {}
    if colunas.get("code"):
        saida["codigo"] = linha.codigo
    if colunas.get("disc"):
        saida["disciplina"] = linha.disciplina_codigo
        saida["cor_macro"] = linha.cor_macro
    if colunas.get("co"):
        saida["projetista"] = linha.instaladora
    if colunas.get("ver"):
        saida["versao"] = linha.versao
    if colunas.get("appr"):
        saida["aprovacao_pct"] = (
            float(linha.aprovacao_pct) if linha.aprovacao_pct is not None else None
        )
    if colunas.get("status"):
        saida["estado"] = linha.estado
    return saida


def _filtrar_linha_da_matriz(linha: dict[str, Any], colunas: dict[str, bool]) -> dict[str, Any]:
    """Mesma regra do painel, aplicada à matriz.

    Sem isto a matriz devolvia a linha inteira, e um convite com `code`
    desligado escondia o código do modelo no painel e o entregava aqui. Toda
    superfície que sai para o cliente passa pelo mesmo filtro — é a única
    forma de a visibilidade por campo significar alguma coisa.
    """
    saida: dict[str, Any] = {"celulas": linha.get("celulas", {})}
    if colunas.get("code"):
        saida["codigo"] = linha.get("codigo")
    if colunas.get("disc"):
        saida["disciplina_codigo"] = linha.get("disciplina_codigo")
        saida["macro"] = linha.get("macro")
        saida["cor_macro"] = linha.get("cor_macro")
    if colunas.get("ver"):
        saida["versao"] = linha.get("versao")
    return saida


@router.get("/portal/{token}", response_model=PortalOut)
def portal(token: str, auth_db: Session = Depends(get_auth_db)) -> PortalOut:
    """Visão read-only do cliente. Sem login: o token é a credencial.

    Rota pública de propósito — o cliente não tem usuário na plataforma. Em
    troca, ela nunca escreve, nunca lista outros projetos e devolve só o que
    o convite liberou.
    """
    convite = auth_db.execute(
        select(ConviteCliente).where(ConviteCliente.token == token)
    ).scalar_one_or_none()

    # Mesma resposta para token inexistente e revogado: distinguir os dois
    # entregaria quais tokens já existiram.
    if convite is None or not convite.ativo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="convite inválido ou revogado"
        )

    org_id = convite.org_id
    projeto_id = convite.projeto_id
    secoes = {**SECOES_PADRAO, **(convite.secoes or {})}
    colunas = {**COLUNAS_PADRAO, **(convite.colunas or {})}

    # A partir daqui, sessão de aplicação amarrada ao tenant do convite: o
    # row-level security também vale no portal.
    with SessionLocal() as db:
        set_tenant(db, org_id)

        projeto = db.get(Projeto, projeto_id)
        if projeto is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="projeto não encontrado"
            )

        resposta = PortalOut(
            projeto={
                "codigo": projeto.codigo,
                "nome": projeto.nome,
                "cliente": projeto.cliente,
                "bep_ref": projeto.bep_ref,
            },
            secoes=secoes,
            colunas=colunas,
        )

        linhas = servico_painel.painel_de_controle(db, projeto_id)

        if secoes.get("painel"):
            resposta.painel = [_filtrar_linha(linha, colunas) for linha in linhas]

        if secoes.get("matriz"):
            matriz = servico_painel.matriz_por_area(db, projeto_id)
            resposta.matriz = {
                "areas": matriz.areas,
                "linhas": [_filtrar_linha_da_matriz(linha, colunas) for linha in matriz.linhas],
            }

        if secoes.get("avanco"):
            # Números agregados, sem nome de fornecedor: o avanço é a pergunta
            # do cliente, e ela se responde sem expor quem está atrasado.
            indicadores = servico_kpis.calcular(db, projeto_id)
            resposta.avanco = {
                "modelos": indicadores.modelos,
                "auditorias_publicadas": indicadores.auditorias_publicadas,
                "aprovacao_media": (
                    float(indicadores.aprovacao_media)
                    if indicadores.aprovacao_media is not None
                    else None
                ),
                "por_macro": [
                    {"rotulo": f.rotulo, "valor": f.valor, "cor": f.cor}
                    for f in indicadores.por_macro
                ],
                "evolucao": [
                    {"round": p.round, "aprovacao_media": p.aprovacao_media}
                    for p in indicadores.evolucao
                ],
            }

        if secoes.get("relatorio"):
            resposta.relatorio = {
                "ncs_abertas": sum(linha.ncs_abertas for linha in linhas),
                "modelos": [
                    {"codigo": linha.codigo, "ncs_abertas": linha.ncs_abertas}
                    for linha in linhas
                    if linha.ncs_abertas
                ],
            }

        return resposta
