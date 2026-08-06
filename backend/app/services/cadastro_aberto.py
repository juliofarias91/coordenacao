"""Criar a própria conta — o cadastro por código da organização (05/08/2026).

Isto é uma REVERSÃO PARCIAL de uma decisão documentada, e vale dizer qual: até
aqui "o acesso é só por convite do admin", e o CLAUDE.md registrava que cadastro
aberto contradiz "SSO autentica, não provisiona". O que mudou foi o pedido; o
que NÃO mudou é o motivo original da regra — e é ele que dá forma a este módulo.

As três amarras que sobreviveram:

1. **O cadastro não cria organização.** Quem se cadastra entra numa que já
   existe, como usuário comum. Criar tenant continua sendo provisionamento, e
   continua saindo do seed.
2. **A organização precisa ter dito que aceita** (`cadastro_aberto`, migration
   0016). O slug é semipúblico — está no endereço do convite —, então sem o
   interruptor conhecê-lo bastaria para entrar no tenant.
3. **A conta nasce no papel MENOS privilegiado.** Ninguém se autoconcede
   permissão: `LEITOR` vê o que a organização já publicaria, e quem administra
   promove depois. Nascer coordenador daria a um estranho com o slug o poder de
   publicar round.

O provisionamento pelo SSO (`api/v1/auth.py::oidc_callback`) passa POR AQUI, e
é de propósito: são duas portas para o mesmo ato, e duas implementações
divergiriam na primeira regra nova — a segunda esqueceria o interruptor, ou o
papel, ou o e-mail em minúsculas.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.cadastro import Organizacao, Usuario
from app.models.enums import PapelUsuario

# O papel de quem chega sozinho. Ver a amarra nº 3 na docstring do módulo.
PAPEL_DE_ENTRADA = PapelUsuario.LEITOR


class CadastroRecusado(Exception):
    """Não dá para criar a conta, e a rota traduz o motivo em status HTTP."""


class OrganizacaoNaoAceita(CadastroRecusado):
    """Slug inexistente OU com o cadastro fechado — as duas na mesma exceção.

    UMA EXCEÇÃO SÓ, E ISSO É A DECISÃO. Separá-las daria à rota pública como
    responder "esta organização existe, mas não aceita cadastro" — que é
    exatamente a frase que transforma o formulário num verificador de tenants:
    quem quisesse saber quais organizações usam a plataforma teria só de digitar
    nomes prováveis e ler a diferença entre as duas respostas.
    """


class LoginJaExiste(CadastroRecusado):
    """O e-mail já tem conta NESTA organização.

    Não é vazamento: quem informou o código já mostrou pertencer ao contexto, e
    a alternativa — responder "criado" sem criar — mandaria a pessoa tentar
    entrar com uma senha que não vale. O caminho dela é "esqueci minha senha".
    """


def organizacao_que_aceita(db: Session, slug: str) -> Organizacao:
    """A organização deste código, se ela existir E aceitar cadastro."""
    org = db.execute(
        select(Organizacao).where(Organizacao.slug == slug.strip().lower())
    ).scalar_one_or_none()
    if org is None or not org.cadastro_aberto:
        raise OrganizacaoNaoAceita
    return org


def criar(
    db: Session,
    *,
    org: Organizacao,
    login: str,
    nome: str | None,
    senha: str | None = None,
    oidc_sub: str | None = None,
) -> Usuario:
    """A conta nova. `senha` para o cadastro por formulário, `oidc_sub` para o SSO.

    O LOGIN É NORMALIZADO AQUI, e não na borda: `_candidatos`, no login, procura
    por `login.strip().lower()`. Gravar 'Fulano@Empresa.com' criaria uma conta
    que o formulário de entrada nunca encontraria — e a pessoa veria "login ou
    senha inválidos" para uma senha que está certa.
    """
    limpo = login.strip().lower()

    existe = db.execute(
        select(Usuario.id).where(Usuario.org_id == org.id, Usuario.login == limpo)
    ).scalar_one_or_none()
    if existe is not None:
        raise LoginJaExiste

    usuario = Usuario(
        org_id=org.id,
        login=limpo,
        nome=(nome or "").strip() or None,
        senha_hash=hash_password(senha) if senha else None,
        oidc_sub=oidc_sub,
        papel=PAPEL_DE_ENTRADA,
        # Lista VAZIA, e não as permissões do papel copiadas: vazio significa
        # "usa o padrão do papel" (ver `_permissoes`, em `api/v1/auth.py`), e é
        # o que faz a conta acompanhar o papel se ele for promovido depois.
        permissoes=[],
        status="ativo",
    )
    db.add(usuario)
    db.flush()
    return usuario
