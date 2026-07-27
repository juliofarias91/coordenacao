"""Paginação por cursor — não toca no banco."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.core.pagination import (
    ParamsPagina,
    codificar_cursor,
    decodificar_cursor,
    montar_pagina,
)


def test_cursor_faz_ida_e_volta() -> None:
    quando = datetime(2026, 7, 26, 15, 30, 45, 123456, tzinfo=UTC)
    qual = uuid.uuid4()
    assert decodificar_cursor(codificar_cursor(quando, qual)) == (quando, qual)


def test_cursor_e_opaco_para_o_cliente() -> None:
    cursor = codificar_cursor(datetime.now(UTC), uuid.uuid4())
    assert "|" not in cursor and ":" not in cursor


@pytest.mark.parametrize("cursor", ["não-é-base64", "", "YWJj", "!!!"])
def test_cursor_invalido_vira_400(cursor: str) -> None:
    with pytest.raises(HTTPException) as exc:
        decodificar_cursor(cursor)
    assert exc.value.status_code == 400


class _Linha:
    def __init__(self, n: int) -> None:
        self.id = uuid.uuid4()
        self.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        self.n = n


def test_pagina_cheia_devolve_cursor() -> None:
    params = ParamsPagina(cursor=None, limite=2)
    # A consulta busca limite+1 para saber se há mais — aqui, 3 linhas.
    pagina = montar_pagina([_Linha(i) for i in range(3)], params, lambda linha: linha.n)
    assert pagina.itens == [0, 1]
    assert pagina.proximo_cursor is not None


def test_ultima_pagina_nao_devolve_cursor() -> None:
    params = ParamsPagina(cursor=None, limite=5)
    pagina = montar_pagina([_Linha(i) for i in range(3)], params, lambda linha: linha.n)
    assert pagina.itens == [0, 1, 2]
    assert pagina.proximo_cursor is None


def test_pagina_vazia() -> None:
    pagina = montar_pagina([], ParamsPagina(cursor=None, limite=10), lambda linha: linha.n)
    assert pagina.itens == []
    assert pagina.proximo_cursor is None
