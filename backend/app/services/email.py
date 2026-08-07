"""Envio de e-mail — o ÚNICO ponto do backend que conhece o provedor.

Hoje é EmailJS pela **API REST**, e não pelo SDK de navegador. A escolha do
provedor foi do usuário (a conta já existe e já serve a plataforma VDCity); a de
enviar do SERVIDOR é técnica, e é a razão de este arquivo existir do lado de cá.

═══ POR QUE O NAVEGADOR NÃO PODE MANDAR ESTE E-MAIL

O convite de equipe é enviado pelo navegador (`frontend/src/services/email.ts`)
e está certo assim: quem convida está autenticado, já tem o token na mão porque
acabou de criá-lo, e o link aparece na tela ao lado.

A REDEFINIÇÃO DE SENHA é o oposto disso. `POST /auth/senha/esqueci` é público e
anônimo — qualquer pessoa digita qualquer e-mail. Se a rota devolvesse o token
para o front despachar, bastaria pedir a redefinição do e-mail de um coordenador
e ler a resposta para tomar a conta dele. O token não pode sair do servidor a não
ser dentro do corpo do e-mail, endereçado a quem já é dono da caixa.

É por isso que a rota responde 202 com uma frase fixa e nada mais, e é por isso
que o envio mora aqui.

═══ A API REST EXIGE A CHAVE PRIVADA

Fora do navegador o EmailJS pede `accessToken` (a Private Key da conta) além da
Public Key. É proposital do lado deles: sem isso, qualquer um que lesse a chave
pública do bundle mandaria e-mail em nome da conta. Junto disso, a conta precisa
ter a opção de uso por API ligada — ver o passo a passo em `docs/EMAIL.md`.

═══ FALHA DE ENVIO NÃO DERRUBA O PEDIDO

`enviar` devolve `True`/`False` e **não levanta**. Quem chama decide, e no caso da
redefinição a decisão já está tomada: o token foi criado e a notificação do admin
continua saindo. Sem servidor de e-mail configurado, o comportamento é o de antes
— o admin vê no sino e entrega o link à mão. O e-mail é um caminho a mais, não
uma dependência nova.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

_URL = "https://api.emailjs.com/api/v1.0/email/send"


def configurado() -> bool:
    """Se dá para enviar. Sem isto, todo caminho de e-mail degrada em silêncio.

    A chave PRIVADA entra na conta: sem ela a API REST recusa com 403, e o erro
    só apareceria no log de produção — melhor não tentar.
    """
    return bool(
        settings.emailjs_service
        and settings.emailjs_public_key
        and settings.emailjs_private_key
    )


def _enviar(template: str, params: dict[str, Any]) -> bool:
    if not configurado() or not template:
        log.info("e-mail não enviado: EmailJS não configurado (template=%s)", template)
        return False
    try:
        resp = httpx.post(
            _URL,
            json={
                "service_id": settings.emailjs_service,
                "template_id": template,
                "user_id": settings.emailjs_public_key,
                # A Private Key. Só existe em chamada fora do navegador.
                "accessToken": settings.emailjs_private_key,
                "template_params": params,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001 — e-mail nunca derruba o pedido
        # SEM O CORPO DOS PARÂMETROS NO LOG: eles carregam o link, e link em log
        # é a mesma credencial num arquivo que muita gente lê.
        log.warning("falha ao enviar e-mail (template=%s): %s", template, exc)
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
        settings.emailjs_template_senha,
        {
            "to_email": para,
            "to_name": nome or para,
            "link": link(f"/definir-senha/{token}"),
            # Duas horas — `acesso.VALIDADE[REDEFINICAO]`. Vai como texto porque
            # o template não faz conta, e porque dizer o prazo evita o e-mail
            # aberto no dia seguinte virar uma reclamação de link quebrado.
            "validade": "2 horas",
        },
    )
