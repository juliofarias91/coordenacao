"""Aplicação FastAPI da plataforma de auditoria BIM da SPBIM."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__, spa
from app.api.router import api_router
from app.core.config import settings, verificar_producao
from app.core.logging import configurar_logging
from app.core.middleware import AutorMiddleware
from app.db import trilha as _trilha  # noqa: F401 — registra o listener da trilha

configurar_logging()

# Recusa subir em produção com segredo de desenvolvimento. Falhar no start é
# barulhento e barato; descobrir depois não é.
verificar_producao()

app = FastAPI(
    title="SPBIM · Plataforma de Auditoria BIM",
    version=__version__,
    description=(
        "A auditoria é a única fonte de dado. Painel de controle, matriz, "
        "relatório e KPIs são visões derivadas."
    ),
    openapi_url=f"{settings.api_prefix}/openapi.json",
    # A documentação interativa fica fora do ar em produção: ela expõe o
    # desenho inteiro da API para quem só precisava do portal.
    docs_url=None if settings.is_prod else f"{settings.api_prefix}/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Publica o autor da requisição no contexto, para a trilha de auditoria.
app.add_middleware(AutorMiddleware)

app.include_router(api_router, prefix=settings.api_prefix)


# Quando a aplicação React estiver empacotada junto (container único), a API
# a serve. Precisa vir DEPOIS do router: a rota curinga da SPA engoliria as
# rotas da API se fosse registrada antes.
_com_spa = spa.montar(app, prefixo_api=settings.api_prefix)

if not _com_spa:

    @app.get("/", include_in_schema=False)
    def raiz() -> dict[str, str]:
        """Sem a SPA junto, a raiz só se identifica — é o caso do
        desenvolvimento, em que o Vite serve a aplicação."""
        return {
            "servico": "spbim-auditoria-api",
            "versao": __version__,
            "docs": f"{settings.api_prefix}/docs",
        }
