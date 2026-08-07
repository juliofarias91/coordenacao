"""Envio de e-mail — o ÚNICO ponto da plataforma que conhece o provedor.

Hoje é SMTP. Foi EmailJS por um dia (07/08/2026), pela API REST, e antes disso
não havia canal nenhum — o pedido de redefinição morria numa notificação para o
admin, que entregava o link à mão.

═══ TODO E-MAIL SAI DAQUI, e isso é novo

Até a troca, o CONVITE saía do navegador (`frontend/src/services/email.ts`) e só
a REDEFINIÇÃO vinha do servidor. Havia razão: quem convida está autenticado e já
tem o token na mão, então mandá-lo pelo navegador não expunha nada.

A razão de a redefinição NUNCA ter podido sair do navegador é a que decidiu o
resto: `POST /auth/senha/esqueci` é público e anônimo, e o link é a credencial
da conta. Se a rota devolvesse o token para o front despachar, bastaria pedir a
redefinição do e-mail de um coordenador e ler a resposta para tomar a conta dele.

Com SMTP, o convite passa a seguir a mesma regra e não custa nada — o token já
nasce no servidor. O que se ganha: uma configuração em vez de duas, a chave
pública fora do bundle, e um lugar só para olhar quando um e-mail não chegar.

═══ NÃO É O "SISTEMA DE E-MAIL DO SUPABASE"

Vale registrar porque a pergunta vai voltar. O e-mail do Supabase é do Supabase
AUTH — confirmar cadastro, convidar, magic link, redefinir senha —, disparado
pelos fluxos deles sobre `auth.users`, com variáveis deles
(`{{ .ConfirmationURL }}`). Esta plataforma tem identidade própria: tabela
`usuario` com Argon2, JWT próprio, `token_acesso` para redefinição, e o Supabase
entra como Postgres gerenciado (ver `docs/SUPABASE.md`).

Ou seja: o Supabase não teria como mandar um link com o NOSSO token, porque o
fluxo não é dele. E mesmo adotando Supabase Auth seria preciso um SMTP — o
remetente embutido deles é limitado a poucos e-mails por hora e a documentação
deles diz para não usá-lo em produção.

═══ FALHA DE ENVIO NUNCA DERRUBA O PEDIDO

`enviar_*` devolve `True`/`False` e não levanta. O convite vale com ou sem
e-mail (o link está na tela de quem convidou), e a redefinição cai na
notificação do admin, que é o comportamento que a plataforma sempre teve. Sem
SMTP configurado, tudo continua funcionando como antes desta mudança.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

from app.core.config import settings

log = logging.getLogger(__name__)

# `backend/app/services/email.py` → `backend/app/emails`
_MODELOS = Path(__file__).resolve().parent.parent / "emails"

# Quanto esperar pelo servidor de e-mail. CURTO de propósito: o envio é
# SÍNCRONO, dentro da requisição, e um SMTP lento seguraria a resposta de quem
# clicou "convidar". Estourar o prazo é o mesmo que falhar — e falhar já tem
# caminho (o link continua na tela; o admin continua sendo avisado).
TIMEOUT = 12


def configurado() -> bool:
    """Se dá para enviar. Sem isto, todo caminho de e-mail degrada em silêncio.

    O REMETENTE ENTRA NA CONTA porque quase todo provedor recusa mensagem cujo
    `From` não seja de domínio verificado — sem ele o envio falharia no servidor
    do provedor, que é o pior lugar para descobrir.

    USUÁRIO SEM SENHA TAMBÉM É "NÃO CONFIGURADO", e esta linha custou uma
    confusão: o `.env` nasce com `SMTP_USER=resend` preenchido e a senha vazia,
    esperando a chave. Sem a conferência, `configurado()` respondia True, o
    caminho degradado (o link na tela, o aviso ao admin) NÃO entrava, e o envio
    ia morrer lá adiante no `login()` do provedor. Meio-caminho é pior do que
    não estar configurado: promete um e-mail que não vai sair.

    Senha vazia COM usuário vazio continua valendo — é relay interno sem
    autenticação, que é legítimo e não deve ser barrado aqui.
    """
    if not (settings.smtp_host and settings.smtp_remetente):
        return False
    return bool(settings.smtp_password) if settings.smtp_user else True


def _modelo(nome: str, variaveis: dict[str, str]) -> str:
    """Lê o HTML de `app/emails/` e troca os `{{campo}}`.

    SUBSTITUIÇÃO SIMPLES, e não um motor de template: os dois arquivos não têm
    condicional nem laço — são texto com buracos. Trazer Jinja para isto seria
    uma dependência a mais para resolver um `str.replace`.

    A sintaxe `{{campo}}` é a que os arquivos já usavam quando eram colados no
    painel do EmailJS. Ficou porque não custa nada e porque quem abrir o HTML
    reconhece o formato.

    ⚠ CAMPO QUE NÃO VIER NO `dict` SOBREVIVE LITERAL no corpo do e-mail — sem
    erro e sem log, porque quem lê `{{validade}}` é o destinatário. Levantar
    aqui seria pior: derrubaria o convite inteiro por causa de um buraco de
    texto, e falhar no e-mail nunca derruba o pedido (ver o topo do módulo).
    O `nome` é um caminho relativo a `app/emails/`, com a subpasta:
    `"acesso/convite.html"`.
    """
    html = (_MODELOS / nome).read_text(encoding="utf-8")
    for chave, valor in variaveis.items():
        html = html.replace("{{" + chave + "}}", valor)
    return html


def conectar() -> smtplib.SMTP:
    """Abre a conexão CIFRADA e AUTENTICADA com o provedor. O chamador fecha.

    PÚBLICA, e é o único ponto que sabe como se fala com o servidor. Quem mais a
    usa é `scripts/verificar_email.py`, e é por isso que ela não ficou privada:
    o script precisa provar a credencial SEM enviar nada, e uma segunda cópia
    desta lógica lá dentro responderia sobre um jeito de conectar que não é o
    que a aplicação usa — divergiria na primeira mudança de TLS ou de timeout, e
    o diagnóstico passaria a mentir justamente quando fosse consultado.

    `SMTP_SSL` é subclasse de `SMTP`, por isso o tipo de retorno cobre os dois.
    """
    contexto = ssl.create_default_context()
    if settings.smtp_ssl:
        s: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=TIMEOUT, context=contexto
        )
    else:
        s = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=TIMEOUT)
        s.starttls(context=contexto)
    # Sem usuário é relay interno sem autenticação — legítimo, e `login("")`
    # seria recusado por um servidor que não pede credencial nenhuma.
    if settings.smtp_user:
        s.login(settings.smtp_user, settings.smtp_password)
    return s


def _enviar(*, para: str, assunto: str, html: str) -> bool:
    if not configurado():
        log.info("e-mail não enviado: SMTP não configurado (assunto=%s)", assunto)
        return False

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = formataddr((settings.smtp_remetente_nome, settings.smtp_remetente))
    msg["To"] = para
    # ALTERNATIVA EM TEXTO, e não só HTML: cliente que não renderiza HTML
    # mostraria uma tela em branco, e filtro de spam pontua pior mensagem só-HTML.
    msg.set_content(
        "Este e-mail precisa de um leitor com HTML. "
        "Se não conseguir vê-lo, peça o link a quem o enviou."
    )
    msg.add_alternative(html, subtype="html")

    try:
        with conectar() as s:
            s.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 — e-mail nunca derruba o pedido
        # SEM O CORPO NO LOG: ele carrega o link, e link em log é a mesma
        # credencial num arquivo que muita gente lê.
        log.warning("falha ao enviar e-mail para %s (%s): %s", para, assunto, exc)
        return False


def link(caminho: str) -> str:
    """URL absoluta a partir da base configurada.

    Não usa o `Host` da requisição de propósito: ele é cabeçalho que o cliente
    controla, e montar o link de redefinição a partir dele deixaria um atacante
    escolher para que domínio a vítima seria levada.
    """
    return f"{settings.app_base_url.rstrip('/')}{caminho}"


def enviar_redefinicao_de_senha(*, para: str, nome: str | None, token: str) -> bool:
    """O link de definição de senha, para quem pediu.

    O `token` chega aqui e não sai daqui: vira URL dentro do corpo do e-mail.
    """
    return _enviar(
        para=para,
        assunto="Redefinir sua senha · SPBIM Coordenação",
        html=_modelo(
            "acesso/redefinir-senha.html",
            {
                "to_email": para,
                "to_name": nome or para,
                "link": link(f"/definir-senha/{token}"),
                # Duas horas — `acesso.VALIDADE[REDEFINICAO]`. Dizer o prazo evita
                # que o e-mail aberto no dia seguinte vire "o link não funciona".
                "validade": "2 horas",
            },
        ),
    )


def enviar_convite(
    *,
    para: str,
    projeto: str,
    papel: str,
    convidado_por: str,
    token: str,
) -> bool:
    """O convite para um projeto.

    O link leva à TELA DE CADASTRO já com o convite (`/cadastro?convite=…`), e
    não a uma tela de aceite: quem recebe quase nunca tem conta aqui. Ver
    `api/v1/convites_equipe.py`.
    """
    return _enviar(
        para=para,
        assunto=f"Convite para o projeto {projeto} · SPBIM Coordenação",
        html=_modelo(
            "acesso/convite.html",
            {
                "to_email": para,
                "project_name": projeto,
                "cargo": papel,
                "invited_by": convidado_por,
                "link": link(f"/cadastro?convite={token}"),
                # O prazo do LINK, não o do acesso — são coisas diferentes, e é o
                # do link que interessa a quem precisa clicar.
                "validade": "3 dias",
            },
        ),
    )
