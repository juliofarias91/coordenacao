"""Quem está fazendo a requisição, acessível fora da assinatura da função.

A trilha de auditoria (SP-406) precisa saber o autor de cada escrita, mas ela
roda num listener do SQLAlchemy — longe do handler que recebeu o token.
Passar o usuário por parâmetro até lá obrigaria toda função de serviço a
carregá-lo só para repassar adiante.

`ContextVar` é o mecanismo certo aqui: cada requisição (e cada task) tem o seu
valor, sem vazamento entre elas nem entre threads.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from contextvars import ContextVar

_usuario_atual: ContextVar[uuid.UUID | None] = ContextVar("usuario_atual", default=None)
_org_atual: ContextVar[uuid.UUID | None] = ContextVar("org_atual", default=None)


def definir_autor(usuario_id: uuid.UUID | None, org_id: uuid.UUID | None) -> None:
    _usuario_atual.set(usuario_id)
    _org_atual.set(org_id)


def autor() -> uuid.UUID | None:
    return _usuario_atual.get()


def org() -> uuid.UUID | None:
    return _org_atual.get()


@contextmanager
def como(usuario_id: uuid.UUID | None, org_id: uuid.UUID | None):
    """Define o autor por um bloco. Usado por workers e scripts."""
    token_usuario = _usuario_atual.set(usuario_id)
    token_org = _org_atual.set(org_id)
    try:
        yield
    finally:
        _usuario_atual.reset(token_usuario)
        _org_atual.reset(token_org)
