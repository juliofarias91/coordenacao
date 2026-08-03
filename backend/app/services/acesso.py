"""Definição de senha por token — convite e redefinição.

O QUE ISTO SUBSTITUI. Até aqui, quem esquecia a senha dependia de um admin
digitar uma nova no formulário de usuários e passá-la por fora. Três problemas
nisso: o admin fica sabendo a senha da pessoa, a senha viaja por WhatsApp, e
não havia primeiro acesso — só "peça sua senha a alguém".

DUAS OPERAÇÕES, UM MECANISMO. Convidar e redefinir terminam no mesmo lugar:
alguém escolhe uma senha sem apresentar a anterior. `tipo` guarda a diferença,
que é de texto na tela e de contexto ("bem-vindo" x "você pediu"), não de
regra.

O TOKEN NUNCA É GUARDADO. `criar()` é a única função que o devolve em claro, e
só nesta chamada — o banco fica com o SHA-256. Perder o link significa gerar
outro, o que é o comportamento certo para uma credencial de uso único.

QUEM ENTREGA O LINK É QUEM CHAMA. Aqui não há e-mail: a plataforma não tem SMTP,
e a decisão registrada foi entregar por link copiado pelo admin — o mesmo padrão
do convite do portal (`components/Convidar.tsx`) — deixando o canal de e-mail
para quando houver servidor. Este módulo produz e valida o token; por onde ele
viaja é problema da camada de cima.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.contexto import definir_autor
from app.core.security import hash_password
from app.models import Notificacao, TokenAcesso, Usuario
from app.models.enums import NotifTipo

CONVITE = "convite"
REDEFINICAO = "redefinicao"
TIPOS = (CONVITE, REDEFINICAO)

# Convite dura mais que redefinição: um é onboarding, que espera a pessoa achar
# tempo de entrar; o outro é resposta a um pedido feito agora. Prazo longo em
# redefinição alarga sem motivo a janela em que um link vazado ainda serve.
VALIDADE = {CONVITE: timedelta(days=7), REDEFINICAO: timedelta(hours=2)}

# Enquanto houver um pedido de redefinição vivo com menos que isto de idade, um
# novo pedido NÃO cria linha. `POST /auth/senha/esqueci` é público e sem
# autenticação: sem esta janela, um laço de requisições encheria a tabela e o
# sino do admin. Não é limite de tentativas de login — esse é assunto separado.
INTERVALO_ENTRE_PEDIDOS = timedelta(minutes=15)


class TokenInvalido(Exception):
    """Token inexistente, expirado ou já usado. Uma exceção para os três casos.

    De propósito: distinguir "não existe" de "expirou" para quem apresenta um
    token diz a um atacante se ele acertou o valor, e não ajuda quem tem o link
    certo — para essa pessoa a saída é a mesma, pedir outro.
    """


def _hash(token: str) -> str:
    """SHA-256, e não Argon2.

    Argon2 encarece o palpite de segredo de BAIXA entropia. `token_urlsafe(32)`
    são 256 bits de CSPRNG: não há dicionário a percorrer, e um KDF caro aqui só
    tornaria lenta a validação de um link legítimo.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def _agora() -> datetime:
    return datetime.now(UTC)


def criar(
    db: Session,
    *,
    usuario: Usuario,
    tipo: str,
    criado_por: uuid.UUID | None = None,
) -> tuple[TokenAcesso, str]:
    """Cria o token e devolve `(linha, token em claro)`.

    O segundo item da tupla é a ÚNICA vez que o valor existe fora do navegador
    de quem o receber. Guardá-lo em qualquer lugar desfaz o motivo de a coluna
    ser um hash.
    """
    if tipo not in TIPOS:
        raise ValueError(f"tipo de token desconhecido: {tipo}")

    token = secrets.token_urlsafe(32)
    linha = TokenAcesso(
        org_id=usuario.org_id,
        usuario_id=usuario.id,
        tipo=tipo,
        token_hash=_hash(token),
        expira_em=_agora() + VALIDADE[tipo],
        criado_por=criado_por,
    )
    db.add(linha)
    db.flush()
    return linha, token


def pedido_recente(db: Session, usuario: Usuario) -> TokenAcesso | None:
    """Pedido de redefinição ainda válido e novo demais para render outro."""
    limite = _agora() - INTERVALO_ENTRE_PEDIDOS
    return db.execute(
        select(TokenAcesso)
        .where(
            TokenAcesso.usuario_id == usuario.id,
            TokenAcesso.tipo == REDEFINICAO,
            TokenAcesso.usado_em.is_(None),
            TokenAcesso.expira_em > _agora(),
            TokenAcesso.created_at > limite,
        )
        .order_by(TokenAcesso.created_at.desc())
    ).scalars().first()


def resolver(db: Session, token: str) -> tuple[TokenAcesso, Usuario]:
    """O token e o usuário dele, se o token servir. Não consome.

    Existe separado de `usar()` para a tela poder dizer "este link expirou"
    ANTES de a pessoa digitar uma senha duas vezes.
    """
    linha = db.execute(
        select(TokenAcesso).where(TokenAcesso.token_hash == _hash(token))
    ).scalar_one_or_none()

    if linha is None or linha.usado_em is not None or linha.expira_em <= _agora():
        raise TokenInvalido

    usuario = db.get(Usuario, linha.usuario_id)
    # Usuário desativado depois de convidado: o link para de valer. Deixar
    # passar daria senha nova a uma conta que alguém decidiu desligar.
    if usuario is None or usuario.status != "ativo":
        raise TokenInvalido
    return linha, usuario


def usar(db: Session, token: str, senha: str) -> Usuario:
    """Troca o token pela senha nova. Uma vez.

    Os três efeitos são um só ato e ficam na mesma transação:

    1. a senha passa a ser a nova;
    2. o token queima (`usado_em`), então o link no e-mail/WhatsApp de alguém
       deixa de servir;
    3. **as sessões antigas caem.** É o passo que costuma faltar: sem ele, quem
       tomou a conta continua com um refresh token válido por 14 dias depois de
       o dono redefinir a senha — e a redefinição não teria resolvido nada.
    """
    linha, usuario = resolver(db, token)

    # O AUTOR DA TRILHA É O PRÓPRIO USUÁRIO. A rota é pública, então o
    # `AutorMiddleware` deixou o autor nulo e o log diria "automático" — mas
    # quem apresentou o link foi a pessoa, e "quem definiu esta senha" é
    # exatamente o que se pergunta ao log depois.
    #
    # Definir aqui funciona porque o listener da trilha roda no `before_flush`
    # logo abaixo, na MESMA thread desta chamada — é a armadilha inversa da que
    # criou o `AutorMiddleware`, onde o valor era definido numa thread e lido
    # noutra.
    definir_autor(usuario.id, usuario.org_id)

    usuario.senha_hash = hash_password(senha)
    usuario.sessoes_validas_apos = _agora()
    linha.usado_em = _agora()

    # Os outros tokens pendentes do mesmo usuário também queimam: se houve dois
    # pedidos, o segundo não pode continuar aberto depois de o primeiro ter
    # trocado a senha.
    for pendente in db.execute(
        select(TokenAcesso).where(
            TokenAcesso.usuario_id == usuario.id,
            TokenAcesso.usado_em.is_(None),
            TokenAcesso.id != linha.id,
        )
    ).scalars():
        pendente.usado_em = _agora()

    db.flush()
    return usuario


def avisar_admins(db: Session, usuario: Usuario) -> Notificacao:
    """Põe o pedido de redefinição na frente de quem pode atendê-lo.

    ENQUANTO NÃO HOUVER SMTP, esta notificação É a entrega: o usuário pede na
    tela de login, o admin vê no sino e gera o link em Usuários & acessos. Sem
    ela, "Esqueci minha senha" seria um botão que não faz nada visível para
    ninguém.

    Endereçada ao PAPEL e não a um usuário: quem atende é quem estiver
    disponível, e mandar para um admin específico faz o pedido morrer nas férias
    dele.
    """
    notificacao = Notificacao(
        org_id=usuario.org_id,
        usuario_id=None,
        papel_alvo="admin",
        tipo=NotifTipo.ACESSO,
        mensagem=(
            f"{usuario.nome or usuario.login} pediu redefinição de senha. "
            f"Gere o link em Usuários & acessos."
        ),
        origem=usuario.login,
    )
    db.add(notificacao)
    db.flush()
    return notificacao
