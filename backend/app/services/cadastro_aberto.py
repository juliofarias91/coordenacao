"""Criar a própria conta — o cadastro por código da organização (05/08/2026).

Isto é uma REVERSÃO PARCIAL de uma decisão documentada, e vale dizer qual: até
aqui "o acesso é só por convite do admin", e o CLAUDE.md registrava que cadastro
aberto contradiz "SSO autentica, não provisiona". O que mudou foi o pedido; o
que NÃO mudou é o motivo original da regra — e é ele que dá forma a este módulo.

**NÃO HÁ TRAVA (06/08/2026, a pedido).** Quem quiser cria a conta e entra. O
recurso passou por três formas em dois dias, e vale saber que as duas primeiras
foram retiradas de propósito, não esquecidas:

1. Código da organização digitado no formulário — saiu porque ninguém ia usá-lo.
2. `organizacao.cadastro_aberto`, um interruptor por tenant (migration 0016) —
   saiu porque nascia desligado e respondia "peça um convite a quem administra" a
   quem ERA quem administra. A migration 0017 derruba a coluna.

O QUE SOBROU é o mínimo que um multi-tenant permite: a conta precisa de um
`org_id`, e `organizacao_do_cadastro` o resolve sem perguntar nada a ninguém.

Duas coisas continuam de pé, e nenhuma é trava — são o desenho:

- **O cadastro não cria organização.** Criar tenant é provisionamento e sai do
  seed. Uma rota pública que fabricasse tenants não teria nada que impedisse mil
  deles.
- **A conta nasce LEITOR**, o papel menos privilegiado, com `permissoes` vazia.
  Sem nenhuma trava antes dela, o papel de entrada é o ÚNICO limite que resta
  entre alguém que acabou de se cadastrar e o que a plataforma faz — nascer
  coordenador daria a um desconhecido o poder de publicar round.

**A CONTA NASCE SEM VÍNCULO DE PROJETO, e é o ponto do desenho** (06/08/2026, a
pedido): quem liga a pessoa a um projeto é quem coordena, por
`POST /projetos/{id}/membros`. Este módulo NÃO toca em `projeto_membro`, e não é
omissão — é onde a autorização real acontece agora. Cadastrar-se responde "esta
pessoa existe na organização"; o vínculo responde "esta pessoa trabalha neste
projeto", e é ele que dá acesso a modelo, auditoria e relatório.
`test_conta_nova_nao_entra_em_projeto_nenhum` tranca isso.

O provisionamento pelo SSO (`api/v1/auth.py::oidc_callback`) passa POR AQUI, e
é de propósito: são duas portas para o mesmo ato, e duas implementações
divergiriam na primeira regra nova — a segunda esqueceria o papel, ou o e-mail
em minúsculas.
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


class SemOrganizacao(CadastroRecusado):
    """Não há NENHUMA organização no banco.

    Não é política, é instalação pela metade: a plataforma não foi semeada
    (`scripts/seed.py`). Vale como exceção própria porque a resposta a dar é
    outra — não adianta pedir convite a quem administra num sistema onde não há
    organização para administrar.
    """


class LoginJaExiste(CadastroRecusado):
    """O e-mail já tem conta NESTA organização.

    Não é vazamento: quem informou o código já mostrou pertencer ao contexto, e
    a alternativa — responder "criado" sem criar — mandaria a pessoa tentar
    entrar com uma senha que não vale. O caminho dela é "esqueci minha senha".
    """


def organizacao_do_cadastro(db: Session) -> Organizacao:
    """A organização em que uma conta nova nasce: a MAIS ANTIGA.

    Sem código digitado e sem interruptor, alguma regra tem de responder — a
    conta precisa de `org_id`, que é NOT NULL. Esta é a mais simples que funciona
    sem configuração e sem campo na tela, e ela acerta porque a PRIMEIRA
    organização provisionada é a da própria SPBIM: as outras, se houver, vieram
    depois dela.

    ⚠ `ORDER BY created_at` NÃO É ENFEITE. As duas alternativas óbvias falham no
    banco real do piloto, que hoje tem uma segunda linha (`org-2347b538`, resíduo
    de teste de 30/07): "a única que existir" recusaria todo cadastro enquanto
    aquela linha estiver lá, e "a primeira que vier" cairia dentro dela em parte
    das execuções — SELECT sem ORDER BY não promete ordem nenhuma, e o Postgres
    muda a sua conforme o plano.

    ⚠ RISCO CONHECIDO, e é o preço do que se pediu: com um SEGUNDO tenant de
    verdade, toda conta criada por conta própria continuará nascendo no primeiro,
    em silêncio. Não sobrou nada na requisição que diga outro destino. Cadastro
    por tenant exigiria um sinal novo — subdomínio, ou o código de volta — e isso
    é decisão de produto, não ajuste deste arquivo.
    """
    org = db.execute(
        select(Organizacao).order_by(Organizacao.created_at.asc()).limit(1)
    ).scalar_one_or_none()
    if org is None:
        raise SemOrganizacao
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
