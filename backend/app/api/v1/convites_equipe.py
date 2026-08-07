"""Convite de pessoas para um projeto — portado da VDCity (migration 0018).

⚠ O CAMINHO É `/convites-de-equipe`, E NÃO `/convites`, porque
`/projetos/{id}/convites` JÁ EXISTE e é outra coisa: o convite do PORTAL DO
CLIENTE (`api/v1/portal.py`), que dá leitura por token a quem nem conta tem
aqui. Dois recursos com o mesmo nome no mesmo caminho seria a próxima pessoa
abrindo o errado — e os dois têm "convite" no nome com razão, porque os dois são
convites; o que difere é para onde.

AS DUAS ROTAS PÚBLICAS usam `get_auth_db`, a sessão privilegiada, pelo mesmo
motivo das rotas de senha: quem chega com um token de convite ainda não tem
tenant para o row-level security consultar, e é o token que faz o papel do
filtro. É a exceção que a autenticação sempre teve.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import (
    CurrentUser,
    get_auth_db,
    get_current_user,
    get_tenant_db,
)
from app.models import ConviteEquipe, Organizacao, Projeto, ProjetoMembro, Usuario
from app.schemas.convite import (
    ConviteEquipeCreate,
    ConviteEquipeCriadoOut,
    ConviteEquipeOut,
    ConvitePreviaOut,
)
from app.services import convite_equipe
from app.services.escopo import exigir_coordenacao_do_projeto

router = APIRouter(tags=["convites-de-equipe"])


# ---------------------------------------------------------------- quem convida
@router.post(
    "/projetos/{projeto_id}/convites-de-equipe",
    response_model=ConviteEquipeCriadoOut,
    status_code=status.HTTP_201_CREATED,
)
def criar(
    projeto_id: uuid.UUID,
    payload: ConviteEquipeCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(get_current_user),
) -> ConviteEquipeCriadoOut:
    """Gera o convite e devolve o token UMA vez.

    ⚠ A GUARDA NÃO É `requer_permissao`, e é a única rota de escrita da
    plataforma onde isso acontece. Quem autoriza é
    `exigir_coordenacao_do_projeto`: `admin_cadastro` **ou** ser coordenador
    DESTE projeto pelo vínculo. Ver a docstring dela para o que esse poder
    alcança e, principalmente, o que ele não alcança.

    O TOKEN NÃO VAI PARA A TRILHA nem para log nenhum. Ele existe nesta resposta
    e no navegador de quem a recebeu; a coluna guarda só o hash.
    """
    projeto = exigir_coordenacao_do_projeto(db, projeto_id, user)
    convite, token = convite_equipe.criar(
        db,
        projeto=projeto,
        papel=payload.papel,
        email=payload.email,
        equipe=payload.equipe,
        acesso_expira_em=payload.acesso_expira_em,
        criado_por=user.id,
    )
    return ConviteEquipeCriadoOut(
        convite=ConviteEquipeOut.model_validate(convite),
        token=token,
        # ⚠ O LINK LEVA À TELA DE CADASTRO, e não a uma tela de aceite
        # (07/08/2026, a pedido). Quem recebe um convite quase nunca tem conta
        # aqui — mandá-lo a uma tela intermediária que só faz avisar "clique
        # para criar sua conta" é um passo entre a pessoa e a única coisa que
        # ela precisa fazer. `/cadastro` já sabe ler o convite: mostra o projeto,
        # trava o e-mail e aceita sozinho depois de criar a conta.
        caminho=f"/cadastro?convite={token}",
    )


@router.get(
    "/projetos/{projeto_id}/convites-de-equipe", response_model=list[ConviteEquipeOut]
)
def listar(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[ConviteEquipeOut]:
    """Os convites deste projeto — para quem convidou saber o que está pendente.

    Sem o token, e é o ponto: esta lista é histórico, não um lugar de onde
    recuperar links. Quem perdeu o link gera outro, que é barato e deixa o
    anterior morrer no prazo.
    """
    exigir_coordenacao_do_projeto(db, projeto_id, user)
    convites = db.execute(
        select(ConviteEquipe)
        .where(ConviteEquipe.projeto_id == projeto_id)
        .order_by(ConviteEquipe.created_at.desc())
    ).scalars()
    return [ConviteEquipeOut.model_validate(c) for c in convites]


@router.delete(
    "/convites-de-equipe/{convite_id}", status_code=status.HTTP_204_NO_CONTENT
)
def revogar(
    convite_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Mata um convite antes do prazo.

    APAGA A LINHA em vez de marcar revogado: um convite não aceito não é
    histórico de nada, e uma coluna `revogado_em` seria um terceiro estado a
    conferir em `resolver` para o mesmo efeito. O que vira histórico é o convite
    ACEITO, e esse a tela não oferece revogar — para tirar a pessoa do projeto o
    caminho é remover o vínculo, que é outra coisa e tem outra rota.
    """
    convite = db.get(ConviteEquipe, convite_id)
    if convite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="convite não encontrado")
    exigir_coordenacao_do_projeto(db, convite.projeto_id, user)
    db.delete(convite)
    db.flush()


# ------------------------------------------------------------ quem foi convidado
def _previa(db: Session, convite: ConviteEquipe, usuario: Usuario | None) -> ConvitePreviaOut:
    projeto = db.get(Projeto, convite.projeto_id)
    org = db.get(Organizacao, convite.org_id)
    ja_e_membro = usuario is not None and (
        db.execute(
            select(ProjetoMembro.id).where(
                ProjetoMembro.projeto_id == convite.projeto_id,
                ProjetoMembro.usuario_id == usuario.id,
            )
        ).first()
        is not None
    )
    return ConvitePreviaOut(
        projeto_nome=projeto.nome if projeto else "",
        projeto_codigo=projeto.codigo if projeto else "",
        organizacao=org.nome if org else "",
        papel=convite.papel,
        equipe=convite.equipe,
        email=convite.email,
        expira_em=convite.expira_em,
        acesso_expira_em=convite.acesso_expira_em,
        ja_e_membro=ja_e_membro,
    )


@router.get("/convites-de-equipe/{token}", response_model=ConvitePreviaOut)
def previa(token: str, db: Session = Depends(get_auth_db)) -> ConvitePreviaOut:
    """Confere o convite SEM consumi-lo. É o `invite_preview` da origem.

    PÚBLICA, e separada do aceite de propósito: descobrir que o convite venceu
    depois de criar uma conta é o pior momento possível para descobrir. É a mesma
    razão de `GET /auth/senha/{token}` existir ao lado do POST que redefine.

    É ela que permite a tela de cadastro pré-preencher e TRAVAR o e-mail quando o
    convite é individual — o que o `Login.jsx` da origem faz com esta mesma RPC.
    """
    try:
        convite = convite_equipe.resolver(db, token)
    except convite_equipe.ConviteVencido:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="este convite expirou — peça outro a quem o enviou",
        ) from None
    except convite_equipe.ConviteInvalido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="convite inválido ou já utilizado — peça outro a quem o enviou",
        ) from None
    return _previa(db, convite, None)


@router.post("/convites-de-equipe/{token}/aceitar", response_model=ConvitePreviaOut)
def aceitar(
    token: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_auth_db),
) -> ConvitePreviaOut:
    """Troca o token pelo vínculo. É o `accept_invite` da origem.

    EXIGE SESSÃO — é o `not_authenticated` da RPC, aqui um 401 do
    `get_current_user`. Quem chega deslogado é mandado pela TELA a se cadastrar, e
    o token fica guardado até a volta (ver `pages/Convite.tsx`).

    `get_auth_db` E NÃO `get_tenant_db`: o convite pode ser de uma organização
    diferente da do token de quem aceita — é o caso de alguém que já tem conta
    numa organização e é convidado para outra. Com a sessão de tenant, a linha do
    convite simplesmente não existiria e o aceite viraria "convite inválido".

    Isso obriga a conferir a organização à mão, logo abaixo, e é o preço: sem RLS
    para segurar, aceitar um convite não pode virar um vínculo com `org_id`
    trocado.
    """
    usuario = db.get(Usuario, user.id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="sessão inválida")

    try:
        convite = convite_equipe.resolver(db, token)
    except convite_equipe.ConviteVencido:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="este convite expirou — peça outro a quem o enviou",
        ) from None
    except convite_equipe.ConviteInvalido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="convite inválido ou já utilizado — peça outro a quem o enviou",
        ) from None

    # ⚠ O VÍNCULO NASCE NA ORGANIZAÇÃO DO CONVITE, e a conta pertence à dela.
    # Aceitar um convite de OUTRO tenant criaria uma linha de `projeto_membro`
    # cujo `org_id` não bate com o do usuário — um pé em cada organização, que é
    # o que o multi-tenant inteiro existe para impedir. Hoje não há caminho de
    # produto para isso (não se cadastra em duas), então é 403 em vez de fluxo.
    if usuario.org_id != convite.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="este convite é de outra organização",
        )

    try:
        convite_equipe.aceitar(db, token, usuario)
    except convite_equipe.EmailDeOutraPessoa:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"este convite foi enviado para {convite.email} e você entrou como "
                f"{usuario.login} — entre com a conta convidada, ou peça um convite "
                "para este endereço"
            ),
        ) from None

    return _previa(db, convite, usuario)
