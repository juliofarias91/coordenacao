"""Convite de pessoas para um projeto — portado da VDCity (07/08/2026).

Origem: `K:\\SPBIM TECH\\...\\vdcity`, especificado em
`docs/convite-especificacao-portabilidade.md`. Lá a lógica inteira é uma função
Postgres (`accept_invite`, `security definer`), porque não há backend próprio.
Aqui ela é este módulo, e a diferença não é só de linguagem: `security definer`
existia para escrever em tabelas que o convidado ainda não pode tocar, e aqui
esse papel é do `get_auth_db` — a mesma sessão privilegiada que o login usa,
pela mesma razão (quem chega com um token ainda não tem tenant).

═══ OS DOIS FLUXOS

**A — por e-mail.** O convite trava num endereço. Na origem, este fluxo NÃO tem
token: o acesso é concedido na hora, gravando direto em `project_members`, e o
e-mail é só um aviso que aponta para a home. **Aqui ele TEM token** (a
"armadilha 5" da especificação, decidida a pedido em 07/08/2026), e o e-mail
leva `/convite/<token>`.

O motivo de divergir: o fluxo da origem funciona porque o casamento é por
e-mail — a pessoa se cadastra com aquele endereço e encontra o acesso lá. Mas
esta plataforma tem entrada pelo Google, e quem se cadastra com um Gmail pessoal
diferente do e-mail corporativo do convite ficaria sem vínculo nenhum, sem nada
que ligasse as duas pontas. O token liga.

**B — por link aberto.** Sem e-mail. Qualquer pessoa logada que abrir entra.

═══ USO ÚNICO OU REUTILIZÁVEL: HÍBRIDO, e o que decide é o `email`

A "armadilha 1" da especificação: na origem TODO link continua valendo depois do
aceite, até o `expires_at`. Decidido a pedido (07/08/2026):

- **Com e-mail** → uso único. Só aquela pessoa poderia aceitar, então reuso não
  tem função nenhuma e só alarga a janela em que um link vazado ainda serve.
- **Sem e-mail** → reutilizável até vencer. É o caso REAL do link aberto: um no
  grupo da disciplina e a equipe inteira entra. Morrer no primeiro uso o tornaria
  um convite individual com passos a mais.

═══ O QUE NÃO VEIO DA ORIGEM, e por quê

- **`company_members` e o bloco de empresa/equipe da RPC.** A seção 7 da
  especificação prevê descartá-los quando o destino não tem a mesma hierarquia, e
  é o caso: `companies` lá é o TENANT, e aqui o tenant é `organizacao`, cuja
  filiação é a própria linha de `usuario`. A `empresa` daqui é outra coisa — o
  fornecedor AUDITADO —, e um campo "empresa" no convite criaria projetista por
  engano a partir de um convite.
- **`resolveCompanyTeam`** (achar-ou-criar empresa pelo nome digitado) cai junto,
  pela mesma razão. A equipe continua: é `projeto_membro.equipe`, texto livre
  desde a 0014, e casa exato com `invites.project_team`.
- **`page_access`.** Na origem é por membro e por projeto; aqui as páginas
  ocultas moram em `usuario.permissoes` e valem na organização INTEIRA. Pôr isso
  num convite deixaria quem coordena um projeto mudando o que alguém enxerga em
  todos os outros. Fora do convite inteiro, a pedido.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ConviteEquipe, Projeto, ProjetoMembro, Usuario
from app.models.enums import PapelUsuario

# Validade do LINK — o primeiro dos três prazos. Três dias, como na origem.
#
# NÃO CONFUNDIR com `acesso_expira_em`, que é até quando a pessoa terá acesso ao
# projeto e é escolhido por quem convida. Este aqui é só segurança: um link que
# vazou para de servir. É a distinção que a especificação chama de "a parte mais
# fácil de errar".
VALIDADE_DO_LINK = timedelta(days=3)

# O papel de quem entra por um convite sem papel declarado. `leitor` é o menos
# privilegiado — mesma escolha de `cadastro_aberto.PAPEL_DE_ENTRADA`, e pela
# mesma razão: o padrão de um convite não pode ser o que dá mais poder.
PAPEL_PADRAO = PapelUsuario.LEITOR


class ConviteInvalido(Exception):
    """Token inexistente, vencido, já usado, ou de outro e-mail.

    UMA EXCEÇÃO PARA OS QUATRO CASOS na hora de PROCURAR — `resolver` não
    distingue, pelo mesmo motivo de `acesso.TokenInvalido`: dizer a quem
    apresenta um token qual dos quatro ele errou informa a quem está adivinhando
    e não ajuda quem tem o link certo, para quem a saída é a mesma (pedir outro).

    O aceite distingue DOIS casos depois de o convite ser encontrado — vencido e
    e-mail errado —, porque aí quem está do outro lado já provou ter o token e
    precisa saber o que fazer. Ver `aceitar`.
    """


class EmailDeOutraPessoa(ConviteInvalido):
    """O convite está travado num endereço, e quem aceitou tem outro.

    É o `wrong_email` da RPC de origem, e é o erro mais útil da lista: acontece
    de verdade quando alguém recebe o convite no e-mail corporativo e entra com o
    Google pessoal. A mensagem precisa dizer isso, senão a pessoa tenta de novo
    do mesmo jeito.
    """


class ConviteVencido(ConviteInvalido):
    """Passou de `expira_em`. É o `expired` da RPC de origem."""


def _hash(token: str) -> str:
    """SHA-256, como em `services/acesso.py`.

    Argon2 encarece o palpite de segredo de BAIXA entropia; `token_urlsafe(32)`
    são 256 bits de CSPRNG e não há dicionário a percorrer.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def _agora() -> datetime:
    return datetime.now(UTC)


def criar(
    db: Session,
    *,
    projeto: Projeto,
    papel: PapelUsuario,
    email: str | None = None,
    equipe: str | None = None,
    acesso_expira_em: datetime | None = None,
    criado_por: uuid.UUID | None = None,
) -> tuple[ConviteEquipe, str]:
    """Cria o convite e devolve `(linha, token em claro)`.

    O segundo item da tupla é a ÚNICA vez que o token existe fora do navegador de
    quem o receber — a coluna guarda só o hash. Guardá-lo em log, trilha ou
    resposta repetida desfaz o motivo de a coluna ser um hash.

    O E-MAIL É NORMALIZADO AQUI, e não na borda: o aceite compara com o login de
    quem está autenticado, que `services/cadastro_aberto.criar` grava em
    minúsculas. Sem isto, um convite para 'Fulano@Empresa.com' recusaria a pessoa
    certa com "este convite é de outro e-mail" — o pior erro possível, porque
    parece falha de segurança e é erro de digitação.
    """
    token = secrets.token_urlsafe(32)
    convite = ConviteEquipe(
        org_id=projeto.org_id,
        projeto_id=projeto.id,
        email=(email or "").strip().lower() or None,
        papel=papel,
        equipe=(equipe or "").strip() or None,
        token_hash=_hash(token),
        expira_em=_agora() + VALIDADE_DO_LINK,
        acesso_expira_em=acesso_expira_em,
        criado_por=criado_por,
    )
    db.add(convite)
    db.flush()
    return convite, token


def resolver(db: Session, token: str) -> ConviteEquipe:
    """O convite deste token, se ele ainda serve para ALGUÉM.

    Não confere e-mail — isso depende de quem está autenticado, e esta função é
    usada pela PRÉVIA, que é pública e roda antes de haver sessão. O que ela
    garante é que o token existe, não venceu, e não é um convite individual já
    gasto.
    """
    convite = db.execute(
        select(ConviteEquipe).where(ConviteEquipe.token_hash == _hash(token))
    ).scalar_one_or_none()
    if convite is None:
        raise ConviteInvalido
    if convite.expira_em < _agora():
        raise ConviteVencido
    # O HÍBRIDO, numa linha: individual e já aceito = acabou. Link aberto
    # (`email is None`) atravessa aceito e continua valendo até vencer.
    if convite.email is not None and convite.aceito_em is not None:
        raise ConviteInvalido
    return convite


def aceitar(db: Session, token: str, usuario: Usuario) -> ProjetoMembro:
    """Troca o token pelo vínculo. É o `accept_invite` da origem.

    IDEMPOTENTE POR DESENHO, como a RPC: se a pessoa já é membro, ATUALIZA o
    vínculo (papel, equipe, prazo) em vez de estourar no UNIQUE. Reabrir o mesmo
    link é o gesto mais provável do mundo — a pessoa clica duas vezes, ou volta
    ao e-mail dias depois — e ele não pode virar erro.

    ⚠ O PRAZO DE ACESSO É SOBRESCRITO, inclusive para nulo. Se o convite não tem
    prazo e a pessoa tinha um, ela passa a não ter: quem convidou de novo, sem
    data, está dizendo "sem prazo". Preservar o antigo faria um convite explícito
    ser silenciosamente ignorado.
    """
    convite = resolver(db, token)

    # A trava de e-mail. Comparada em minúsculas dos dois lados — `criar`
    # normaliza o convite, e `cadastro_aberto.criar` normaliza o login.
    if convite.email is not None and convite.email != usuario.login.strip().lower():
        raise EmailDeOutraPessoa

    membro = db.execute(
        select(ProjetoMembro).where(
            ProjetoMembro.projeto_id == convite.projeto_id,
            ProjetoMembro.usuario_id == usuario.id,
        )
    ).scalar_one_or_none()

    if membro is None:
        membro = ProjetoMembro(
            org_id=convite.org_id,
            projeto_id=convite.projeto_id,
            usuario_id=usuario.id,
            papel=convite.papel or PAPEL_PADRAO,
            equipe=convite.equipe,
            expira_em=convite.acesso_expira_em,
        )
        db.add(membro)
    else:
        membro.papel = convite.papel or membro.papel
        # `coalesce` na equipe, como a RPC de origem: um convite sem equipe não
        # apaga a que a pessoa já tinha no projeto. Diferente do prazo, logo
        # acima — ali o nulo é uma escolha, aqui é ausência de escolha.
        membro.equipe = convite.equipe or membro.equipe
        membro.expira_em = convite.acesso_expira_em

    # CARIMBA SEMPRE, inclusive no link aberto — ele continua valendo (o híbrido
    # é decidido em `resolver`), mas `aceito_em` é o que responde "este convite
    # chegou a ser usado?" na tela de quem convidou.
    convite.aceito_em = _agora()
    convite.aceito_por = usuario.id
    db.add(convite)
    db.flush()
    return membro
