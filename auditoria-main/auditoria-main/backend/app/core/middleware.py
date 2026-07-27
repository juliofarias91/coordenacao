"""Middleware que publica o autor da requisição no contexto.

Por que aqui e não na dependência `get_current_user`: rotas síncronas do
FastAPI rodam num threadpool, e o `anyio` **copia** o contexto para a thread
trabalhadora. Uma `ContextVar` definida dentro dessa thread não volta para o
chamador nem alcança as outras threads da mesma requisição — foi exatamente
assim que a trilha de auditoria passou a gravar `usuario_id` nulo.

O middleware roda no laço assíncrono, antes de qualquer cópia de contexto:
o valor definido aqui alcança as dependências e o handler.
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.contexto import definir_autor
from app.core.security import TokenError, decode_token


class AutorMiddleware(BaseHTTPMiddleware):
    """Lê o Bearer e publica (usuário, organização) no contexto.

    Não autoriza nada: token ausente ou inválido apenas deixa o autor nulo, e
    quem recusa a requisição continua sendo `get_current_user`. Duplicar a
    decisão de autenticação aqui criaria dois lugares para mantê-la.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        definir_autor(None, None)

        cabecalho = request.headers.get("authorization", "")
        if cabecalho.lower().startswith("bearer "):
            try:
                claims = decode_token(cabecalho[7:].strip(), expected_type="access")
                definir_autor(uuid.UUID(claims["sub"]), uuid.UUID(claims["org"]))
            except (TokenError, ValueError, KeyError):
                pass  # a rota decide o que fazer com token ruim

        return await call_next(request)
