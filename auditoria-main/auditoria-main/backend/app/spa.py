"""Serve a aplicação React a partir da própria API, quando ela estiver junto.

Existe para o caso de um container só — o jeito mais simples de hospedar o
piloto. O nginx do `frontend/` continua sendo o caminho quando API e web são
serviços separados; os dois convivem, e qual está em uso se decide por haver
ou não um diretório `static/` ao lado do código.

O motivo de fazer isto no servidor, e não com um redirecionamento: a SPA tem
rotas próprias (`/portal/<token>` é a que o cliente recebe por e-mail). Pedir
essa URL direto no navegador tem de devolver o `index.html`, e não 404 — é o
mesmo `try_files` que o nginx faz.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# `backend/app/spa.py` → `backend/static`
DIRETORIO_PADRAO = Path(__file__).resolve().parent.parent / "static"


def montar(app: FastAPI, *, prefixo_api: str, diretorio: Path | None = None) -> bool:
    """Monta a SPA se os arquivos existirem. Devolve se montou.

    Silencioso quando não há `static/`: é exatamente o caso do
    desenvolvimento, em que o Vite serve a aplicação na porta 5173.
    """
    raiz = diretorio or DIRETORIO_PADRAO
    index = raiz / "index.html"
    if not index.is_file():
        return False

    # Os assets levam hash no nome, então o cache pode ser longo. O
    # `index.html` não — ele é quem aponta para o hash novo depois do deploy.
    app.mount("/assets", StaticFiles(directory=raiz / "assets"), name="assets")

    @app.get("/{caminho:path}", include_in_schema=False)
    async def spa(request: Request, caminho: str) -> FileResponse:
        # Uma rota de API que chegou aqui é rota inexistente: devolver o
        # index.html faria o cliente receber HTML onde esperava JSON, e o erro
        # apareceria como "unexpected token <" em vez de 404.
        if request.url.path.startswith(prefixo_api):
            raise HTTPException(status_code=404, detail="rota não encontrada")

        arquivo = (raiz / caminho).resolve()
        # `resolve()` + verificação de prefixo: sem isso `../` sairia do
        # diretório servido.
        if caminho and raiz in arquivo.parents and arquivo.is_file():
            return FileResponse(arquivo)

        # Qualquer outra coisa é rota da SPA — inclusive `/portal/<token>`.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return True
