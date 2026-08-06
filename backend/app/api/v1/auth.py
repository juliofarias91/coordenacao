"""Autenticação: senha (Argon2) e SSO/OIDC.

Fluxo de senha é o fallback; o SSO liga com `OIDC_ENABLED=true`.
Em ambos os casos a saída é o mesmo par de JWTs, e é do `org` do token que sai
o tenant de toda query subsequente.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import oidc
from app.core.config import settings
from app.core.deps import CurrentUser, get_auth_db, get_current_user, get_tenant_db
from app.core.security import (
    TokenError,
    create_token,
    decode_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models.cadastro import Organizacao, Usuario
from app.models.enums import PERMISSOES_POR_PAPEL, paginas_ocultas, permissoes_reais
from app.schemas.auth import (
    ConviteSenhaOut,
    EsqueciSenhaRequest,
    LoginRequest,
    OidcAuthorizeOut,
    RedefinirSenhaRequest,
    RefreshRequest,
    SessaoOut,
    TokenPair,
    UsuarioOut,
)
from app.schemas.usuario import SENHA_MINIMA
from app.services import acesso

router = APIRouter(prefix="/auth", tags=["auth"])

CREDENCIAIS_INVALIDAS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="login ou senha inválidos",
)

ORGANIZACAO_NECESSARIA = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="este e-mail existe em mais de uma organização — informe qual",
)

# Quantos usuários com o mesmo login a autenticação testa antes de exigir o
# slug da organização. Cada teste custa um Argon2 completo, e é isso que limita:
# sem teto, um e-mail repetido em N organizações multiplicaria por N o custo de
# cada palpite errado, e a tela de login viraria um amplificador de CPU.
#
# Cinco é folgado de propósito. A configuração real é uma pessoa em duas
# organizações (a da SPBIM e a do cliente); passar de cinco é sinal de cadastro
# duplicado, e aí perguntar é melhor do que adivinhar.
MAX_CANDIDATOS = 5


def _permissoes(usuario: Usuario) -> list[str]:
    """Permissões explícitas do usuário; na ausência, o padrão do papel.

    ⚠ AS PÁGINAS OCULTAS SÃO FILTRADAS AQUI, E A ORDEM É O PONTO: elas moram na
    mesma coluna (`PREFIXO_PAGINA`, em `models/enums.py`) e precisam sair ANTES
    do `or`. Em `deps.py`, uma lista não vazia DESLIGA o padrão do papel — então
    sem este filtro, esconder uma tela de quem herda as permissões do papel
    encheria a lista com uma entrada inerte e tiraria dessa pessoa todas as
    permissões reais de uma vez.

    Esta função é o FUNIL ÚNICO: passam por ela o token (`_emitir`) e o
    `/auth/me`. É por isso que `requer_permissao` comprovadamente nunca vê uma
    entrada `oculta:` — e é o que `test_pagina_oculta_nao_autoriza` tranca.
    """
    return permissoes_reais(usuario.permissoes) or list(
        PERMISSOES_POR_PAPEL.get(usuario.papel, ())
    )


def _emitir(usuario: Usuario) -> TokenPair:
    perms = _permissoes(usuario)
    comum = {
        "usuario_id": usuario.id,
        "org_id": usuario.org_id,
        "papel": usuario.papel.value,
        "permissoes": perms,
    }
    return TokenPair(
        access_token=create_token(**comum, token_type="access"),
        refresh_token=create_token(**comum, token_type="refresh"),
        expires_in=settings.access_token_minutes * 60,
    )


def _sessao(usuario: Usuario) -> SessaoOut:
    out = UsuarioOut.model_validate(usuario)
    # As duas metades da coluna, cada uma no seu campo: `_permissoes` devolve as
    # reais (já sem o prefixo, e caindo para o padrão do papel quando não há
    # nenhuma), `paginas_ocultas` devolve as telas.
    out.permissoes = _permissoes(usuario)
    out.paginas_ocultas = paginas_ocultas(usuario.permissoes)
    return SessaoOut(tokens=_emitir(usuario), usuario=out)


def _candidatos(db: Session, login: str, org_slug: str | None) -> list[Usuario]:
    """Todos os usuários com este login. Um por organização, no máximo.

    Devolve a LISTA, e não "o único match", porque `login` é único por
    organização e não globalmente: o mesmo e-mail em duas organizações é
    configuração válida do multi-tenant. Reduzir a lista a nada nesse caso —
    como se fazia antes — trancava as duas contas com a mensagem "login ou
    senha inválidos", que não dá a ninguém pista de como sair de lá.
    """
    stmt = select(Usuario).where(Usuario.login == login.strip().lower())
    if org_slug:
        stmt = stmt.join(Organizacao, Organizacao.id == Usuario.org_id).where(
            Organizacao.slug == org_slug
        )
    return list(db.execute(stmt).scalars())


@router.post("/login", response_model=SessaoOut)
def login(payload: LoginRequest, db: Session = Depends(get_auth_db)) -> SessaoOut:
    """Autentica por senha. É a SENHA que decide a organização.

    Quando o e-mail existe em várias, testar a senha contra cada candidato
    resolve o caso comum sem perguntar nada: senhas diferentes em organizações
    diferentes é o que acontece na prática. Só se a mesma senha valer em duas —
    ou se houver candidatos demais para testar — é que se pede o slug.

    Perguntar de saída seria pior: a tela teria de exibir sempre um campo que
    quase ninguém precisa, ou dizer "seu e-mail está em duas organizações" a
    quem ainda não provou ser o dono dele.
    """
    candidatos = _candidatos(db, payload.login, payload.org)

    if len(candidatos) > MAX_CANDIDATOS:
        raise ORGANIZACAO_NECESSARIA

    autenticados = [u for u in candidatos if verify_password(payload.senha, u.senha_hash)]

    if not autenticados:
        # `verify_password` com hash nulo já devolve False, mas sem candidato
        # nenhum não houve Argon2 algum — e aí o tempo de resposta denunciaria
        # quais logins existem. Um hash descartável reequilibra.
        if not candidatos:
            verify_password(payload.senha, hash_password("descartavel"))
        raise CREDENCIAIS_INVALIDAS

    # Mesma senha em duas organizações: aqui não há como escolher, e escolher a
    # primeira que o banco devolvesse entraria na organização errada em silêncio.
    if len(autenticados) > 1:
        raise ORGANIZACAO_NECESSARIA

    usuario = autenticados[0]
    if usuario.status != "ativo":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="usuário inativo")

    if usuario.senha_hash and needs_rehash(usuario.senha_hash):
        usuario.senha_hash = hash_password(payload.senha)
        db.add(usuario)

    return _sessao(usuario)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: Session = Depends(get_auth_db)) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    # A sessão é privilegiada, então o org do token entra como filtro explícito.
    usuario = db.execute(
        select(Usuario).where(
            Usuario.id == uuid.UUID(claims["sub"]),
            Usuario.org_id == uuid.UUID(claims["org"]),
        )
    ).scalar_one_or_none()
    if usuario is None or usuario.status != "ativo":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="sessão inválida")

    # O CORTE DE SESSÃO (migration 0010). É AQUI que "Sair" e "redefinir senha"
    # ganham efeito: sem esta checagem, um refresh token continuava valendo os
    # 14 dias inteiros depois de a senha ser trocada, e sair era só limpar o
    # `localStorage` do próprio navegador.
    #
    # Compara com `iat` e não com `exp`: o que interessa é QUANDO a sessão
    # começou, para que o corte alcance todo token emitido antes dele.
    corte = usuario.sessoes_validas_apos
    if corte is not None:
        emitido_em = datetime.fromtimestamp(int(claims.get("iat", 0)), tz=UTC)
        if emitido_em < corte:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="sessão encerrada — entre de novo",
            )

    return _emitir(usuario)


@router.get("/me", response_model=UsuarioOut)
def me(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
) -> UsuarioOut:
    usuario = db.get(Usuario, user.id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="usuário não encontrado")
    out = UsuarioOut.model_validate(usuario)
    # As mesmas duas metades de `_sessao`. É por AQUI que a barra lateral fica
    # sabendo o que não desenhar quando a sessão é reidratada — sem isto, quem
    # recarrega a página volta a ver as telas escondidas até tornar a entrar.
    out.permissoes = _permissoes(usuario)
    out.paginas_ocultas = paginas_ocultas(usuario.permissoes)
    return out


@router.post("/sair", status_code=status.HTTP_204_NO_CONTENT)
def sair(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
) -> None:
    """Encerra as sessões desta conta — TODAS elas.

    Antes disto "Sair" era `localStorage.removeItem`: o refresh token continuava
    válido pelos 14 dias inteiros, então sair num computador emprestado não
    tirava ninguém de lugar nenhum. Quem tivesse copiado o token seguia
    renovando a sessão.

    Todas, e não só a atual, porque é isso que se quer de um botão de sair
    apertado por precaução — e porque distinguir sessões exigiria um `jti` por
    token e uma tabela para guardá-los, que é peso que este produto não precisa
    carregar para dizer "não estou mais aqui".

    O access token corrente sobrevive até expirar (`ACCESS_TOKEN_MINUTES`).
    Invalidá-lo na hora exigiria consultar o banco em toda requisição.
    """
    usuario = db.get(Usuario, user.id)
    if usuario is not None:
        usuario.sessoes_validas_apos = datetime.now(UTC)
        db.flush()


# --------------------------------------------------------------------------
# Senha: esquecer, conferir o link, redefinir
#
# AS TRÊS SÃO PÚBLICAS, e usam `get_auth_db` pelo mesmo motivo do login: quem
# chega aqui ainda não tem tenant para o row-level security consultar. O token
# faz o papel do filtro — ele resolve o usuário, e o usuário resolve a
# organização.
# --------------------------------------------------------------------------
@router.post("/senha/esqueci", status_code=status.HTTP_202_ACCEPTED)
def esqueci_a_senha(
    payload: EsqueciSenhaRequest, db: Session = Depends(get_auth_db)
) -> dict[str, str]:
    """Registra o pedido. **Responde 202 sempre**, exista a conta ou não.

    Confirmar que um e-mail está cadastrado transforma esta rota em lista de
    usuários da plataforma — e é uma rota pública, sem autenticação.

    ENQUANTO NÃO HOUVER SMTP, o pedido chega ao admin pelo sino, e é ele quem
    gera o link em Usuários & acessos. O dia em que houver servidor de e-mail,
    é aqui que o envio entra: o token já é criado, e o que muda é o canal.
    """
    candidatos = _candidatos(db, payload.login, payload.org)

    # Com o e-mail em várias organizações e sem senha para desempatar, não há
    # como saber de qual conta é o pedido. O 202 continua, e o admin da
    # organização certa é quem age — avisar todas seria vazar a existência da
    # conta para tenants vizinhos.
    if len(candidatos) == 1:
        usuario = candidatos[0]
        if usuario.status == "ativo" and acesso.pedido_recente(db, usuario) is None:
            acesso.criar(db, usuario=usuario, tipo=acesso.REDEFINICAO)
            acesso.avisar_admins(db, usuario)

    return {
        "detalhe": (
            "Se este e-mail tiver conta, quem administra a organização foi avisado "
            "e vai enviar o link de definição de senha."
        )
    }


@router.get("/senha/{token}", response_model=ConviteSenhaOut)
def conferir_link_de_senha(
    token: str, db: Session = Depends(get_auth_db)
) -> ConviteSenhaOut:
    """Valida o link SEM consumi-lo, para a tela poder se apresentar.

    Separado da redefinição de propósito: descobrir que o link expirou depois de
    digitar a senha duas vezes é o pior momento possível para descobrir.
    """
    try:
        linha, usuario = acesso.resolver(db, token)
    except acesso.TokenInvalido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="link inválido, expirado ou já usado — peça outro",
        ) from None

    org = db.get(Organizacao, usuario.org_id)
    return ConviteSenhaOut(
        login=usuario.login,
        nome=usuario.nome,
        tipo=linha.tipo,
        organizacao=org.nome if org else "",
        expira_em=linha.expira_em,
        # O mínimo vem do servidor: a tela é pública e não tem outra forma de
        # saber a regra antes de o usuário errá-la.
        senha_minima=SENHA_MINIMA,
    )


@router.post("/senha/redefinir", status_code=status.HTTP_204_NO_CONTENT)
def redefinir_senha(payload: RedefinirSenhaRequest, db: Session = Depends(get_auth_db)) -> None:
    """Troca o token pela senha nova, uma vez, e derruba as sessões antigas."""
    try:
        acesso.usar(db, payload.token, payload.senha)
    except acesso.TokenInvalido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="link inválido, expirado ou já usado — peça outro",
        ) from None


# --------------------------------------------------------------------------
# SSO / OIDC
# --------------------------------------------------------------------------
def _um_por_identidade(db: Session, coluna: Any, valor: str) -> Usuario | None:
    """O usuário desta identidade externa, se ela resolver para exatamente um.

    Existe porque `scalar_one_or_none()` levanta `MultipleResultsFound` — e o
    cliente recebe **500** — quando o mesmo e-mail existe em duas organizações,
    que é justamente a configuração que o multi-tenant permite. Aqui a
    ambiguidade cai no 403 de "identidade sem usuário correspondente", que é o
    que ela é: o provedor autenticou alguém, e a plataforma não sabe quem.

    Ao contrário do login por senha, não há como desempatar: no SSO não existe
    uma segunda credencial para testar contra cada candidato.
    """
    encontrados = db.execute(select(Usuario).where(coluna == valor)).scalars().all()
    return encontrados[0] if len(encontrados) == 1 else None


def _exigir_oidc() -> None:
    if not settings.oidc_enabled:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="SSO desabilitado (defina OIDC_ENABLED=true e o OIDC_ISSUER)",
        )


@router.get("/oidc/login", response_model=OidcAuthorizeOut)
async def oidc_login() -> OidcAuthorizeOut:
    """Devolve a URL de autorização do provedor.

    O `state` é um JWT curto que carrega o `code_verifier` do PKCE assinado
    pela própria API — evita depender de sessão no servidor para um passo que
    dura segundos.
    """
    _exigir_oidc()
    verifier, challenge = oidc.new_pkce_pair()
    state = create_token(
        usuario_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        papel="leitor",
        permissoes=[verifier],   # o verifier viaja assinado dentro do state
        token_type="access",
    )
    return OidcAuthorizeOut(
        authorization_url=await oidc.authorization_url(state, challenge),
        state=state,
    )


@router.get("/oidc/callback", response_model=SessaoOut)
async def oidc_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_auth_db),
) -> SessaoOut:
    _exigir_oidc()
    try:
        state_claims = decode_token(state, expected_type="access")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="state inválido"
        ) from exc

    verifier = (state_claims.get("perms") or [""])[0]
    tokens: dict[str, Any] = await oidc.exchange_code(code, verifier)
    claims = await oidc.validate_id_token(tokens["id_token"])

    sub = (claims.get("sub") or "").strip()
    email = (claims.get("email") or "").strip().lower()

    # `sub` VAZIO É RECUSADO, e não tratado como "procure por e-mail". Sem esta
    # linha, `Usuario.oidc_sub == None` virava `IS NULL` no SQL e casava com
    # todo usuário que nunca usou SSO — num tenant com um único desses, o
    # provedor autenticaria uma identidade sem `sub` e a plataforma entregaria a
    # sessão de outra pessoa. O `sub` é obrigatório no OIDC; um token sem ele
    # está quebrado, e o lugar de dizer isso é aqui.
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="id_token sem 'sub' — identidade não identificável",
        )

    # Usuário precisa estar previamente cadastrado: SSO autentica, não provisiona.
    # (Provisionamento automático é decisão de produto — fica para a Fase 1.)
    usuario = _um_por_identidade(db, Usuario.oidc_sub, sub)
    if usuario is None and email:
        usuario = _um_por_identidade(db, Usuario.login, email)
        if usuario is not None:
            usuario.oidc_sub = sub
            db.add(usuario)

    if usuario is None or usuario.status != "ativo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="identidade sem usuário correspondente na plataforma",
        )
    return _sessao(usuario)
