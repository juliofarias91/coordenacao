"""Confere se o SMTP está de pé — e, se pedirem, manda um e-mail de verdade.

    python -m scripts.verificar_email                     # só lê o .env
    python -m scripts.verificar_email --conectar          # abre, cifra e AUTENTICA
    python -m scripts.verificar_email --enviar voce@x.com # manda a mensagem real

Existe porque, até aqui, a única forma de saber se o e-mail funciona era subir a
aplicação, pedir uma redefinição de senha por uma tela pública e esperar. Quando
não chegava, o motivo estava num `log.warning` engolido no meio da saída do
servidor — e as três causas prováveis (senha errada, remetente de domínio não
verificado, porta/TLS trocados) produzem mensagens muito diferentes que ninguém
via.

O QUE CADA MODO PROVA, e o que NÃO prova:

  padrão      só lê o `.env`. Diz se os campos estão preenchidos e coerentes
              entre si (587 com SSL ligado é o engano mais comum). NÃO fala com
              servidor nenhum — some com a pergunta "esqueci de preencher?" sem
              custo e sem rede.

  --conectar  resolve o host, abre a conexão, faz STARTTLS e AUTENTICA. Prova
              que a credencial vale. É até onde dá para ir sem gastar cota nem
              incomodar ninguém: PARA ANTES de enviar.
              ATENÇÃO: não prova que a mensagem será aceita — a recusa por
              remetente de domínio não verificado acontece depois, no
              `MAIL FROM`.

  --enviar    a prova real, e a única que cobre a verificação de domínio: monta
              o modelo do convite com dados de teste e entrega ao provedor.
              Chegar na caixa é o teste; cair no spam também é resposta, e
              significa DKIM/SPF faltando.

Sai com código 1 quando encontra problema — serve num cron ou no CI de um
ambiente novo. `.env` errado é código 2, como no `verificar_storage`.
"""

# ⚠ NADA QUE ESTE ARQUIVO IMPRIME PODE SAIR DO CP1252 — nem a docstring acima,
# que o argparse mostra no `--help`. O console do Windows escreve em cp1252, e um
# caractere fora dele derruba o script com `UnicodeEncodeError` no meio da saída,
# ANTES da linha que a pessoa veio ler. Já aconteceu com o `⚠` e com o `→` (que
# está nesta linha só porque comentário não é impresso). Acentos, `—` e `…` estão
# no cp1252 e podem ficar; setas, emoji e sinais de alerta, não.
from __future__ import annotations

import argparse
import smtplib
import socket
import sys

from app.core.config import settings
from app.services import email


def _mascara(valor: str) -> str:
    """Bastante para reconhecer a chave, pouco para vazá-la num print.

    A saída disto vai parar em ticket e em captura de tela — foi assim que a
    chave privada do EmailJS acabou colada num arquivo versionado, duas vezes.
    """
    if not valor:
        return "(vazio)"
    if len(valor) <= 8:
        return "*" * len(valor)
    return f"{valor[:4]}{'*' * (len(valor) - 8)}{valor[-4:]}"


def _mostrar_config() -> list[str]:
    """Imprime o que está no `.env` e devolve os problemas encontrados."""
    print(f"host       {settings.smtp_host or '(vazio)'}")
    print(f"porta      {settings.smtp_port}")
    print(f"TLS        {'SSL direto' if settings.smtp_ssl else 'STARTTLS'}")
    print(f"usuário    {settings.smtp_user or '(vazio — envio sem autenticação)'}")
    print(f"senha      {_mascara(settings.smtp_password)}")
    print(f"remetente  {settings.smtp_remetente or '(vazio)'}")
    print(f"nome       {settings.smtp_remetente_nome}")
    print(f"base       {settings.app_base_url}")

    problemas: list[str] = []
    if not settings.smtp_host:
        problemas.append("SMTP_HOST vazio")
    if not settings.smtp_remetente:
        problemas.append("SMTP_REMETENTE vazio — é o `From`, e sem ele nada sai")
    if settings.smtp_user and not settings.smtp_password:
        problemas.append("SMTP_USER preenchido e SMTP_PASSWORD vazio")

    # As duas portas têm significados opostos, e trocá-las dá erro de handshake
    # que não menciona porta nenhuma — some numa mensagem sobre "wrong version
    # number" que manda quem lê procurar no lugar errado.
    if settings.smtp_port == 465 and not settings.smtp_ssl:
        problemas.append("porta 465 pede SMTP_SSL=true (SSL direto)")
    if settings.smtp_port == 587 and settings.smtp_ssl:
        problemas.append("porta 587 pede SMTP_SSL=false (STARTTLS)")

    return problemas


def main() -> int:
    # `RawDescription` porque a docstring acima é uma TABELA: sem ele o argparse
    # rejunta tudo num parágrafo só e a coluna "o que cada modo prova" some.
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--conectar", action="store_true", help="conecta e autentica, sem enviar")
    p.add_argument("--enviar", metavar="DESTINO", help="manda a mensagem real para este endereço")
    args = p.parse_args()

    problemas = _mostrar_config()
    print(f"\nconfigurado(): {email.configurado()}")

    if problemas:
        print("\nPROBLEMAS NO .env:")
        for item in problemas:
            print(f"  - {item}")
        print("\nPreencha o `.env` da RAIZ. Passo a passo em `docs/EMAIL.md`.")
        return 1

    if not (args.conectar or args.enviar):
        print("\nRESULTADO: os campos estão preenchidos e coerentes.")
        print("Isto NÃO É PROVA — o provedor não foi consultado.")
        print("Rode com --conectar para provar a credencial.")
        return 0

    print(f"\nconectando em {settings.smtp_host}:{settings.smtp_port}…")
    try:
        # A MESMA função que a aplicação usa para enviar — conectar, cifrar e
        # autenticar. Uma cópia local aqui provaria um caminho que não é o de
        # produção. Ela já vem autenticada; o script só não manda nada.
        with email.conectar():
            alvo = settings.smtp_user or "(sem autenticação — SMTP_USER vazio)"
            print(f"  conexão aberta, cifrada e autenticada como {alvo}")
    except smtplib.SMTPAuthenticationError as exc:
        print(f"\n  o provedor RECUSOU a credencial: {exc.smtp_code} {exc.smtp_error!r}")
        print("\n  Confira SMTP_USER e SMTP_PASSWORD. Em provedor de API (Resend,")
        print("  Brevo) o usuário é fixo e a senha é a CHAVE — não o seu e-mail.")
        print("  No Google Workspace tem de ser SENHA DE APP; a da conta não entra.")
        return 1
    except (OSError, smtplib.SMTPException) as exc:
        # `OSError` cobre DNS, recusa de conexão e timeout — os três chegam aqui
        # como coisas diferentes e todos significam "não cheguei ao servidor".
        print(f"\n  não cheguei ao servidor: {type(exc).__name__}: {exc}")
        print("\n  Host errado, porta bloqueada pela rede, ou TLS trocado")
        print("  (587 = STARTTLS, 465 = SSL direto).")
        return 1

    if not args.enviar:
        print("\nRESULTADO: a credencial vale.")
        print("Isto AINDA NÃO PROVA que a mensagem é aceita — a recusa por")
        print("remetente de domínio não verificado só aparece no envio.")
        print("Rode com --enviar SEU@EMAIL para a prova completa.")
        return 0

    print(f"\nenviando para {args.enviar}…")
    # O MODELO REAL, com dados de teste: é o que mostra como a mensagem chega
    # num cliente de verdade. O assunto diz que é teste e o link não leva a
    # convite nenhum — se cair na caixa errada, não engana ninguém.
    enviado = email._enviar(  # noqa: SLF001 — script de diagnóstico do próprio módulo
        para=args.enviar,
        assunto="Teste de envio · SPBIM Coordenação",
        html=email._modelo(  # noqa: SLF001
            "acesso/convite.html",
            {
                "to_email": args.enviar,
                "project_name": "TESTE — nenhum projeto de verdade",
                "cargo": "Visualizador",
                "invited_by": "verificar_email.py",
                "link": email.link("/entrar"),
                "validade": "0 dias (isto é um teste)",
            },
        ),
    )
    if not enviado:
        print("\nRESULTADO: o envio falhou. O motivo está no log, como aviso.")
        print("A causa mais comum aqui é SMTP_REMETENTE de domínio NÃO")
        print(f"VERIFICADO na conta do provedor — hoje é `{settings.smtp_remetente}`.")
        return 1

    print("\nRESULTADO: o provedor aceitou a mensagem.")
    print("Aceitar não é entregar: confira a caixa, e o SPAM junto.")
    print("Chegou no spam? Faltam SPF/DKIM no DNS do domínio do remetente.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except socket.gaierror as exc:
        print(f"\no host `{settings.smtp_host}` não resolve: {exc}")
        sys.exit(2)
