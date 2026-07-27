"""SP-304 · Nível 1 para Revit — propriedades via APS Model Derivative.

Mesma comparação da auditoria IFC, com uma diferença que importa no
orçamento: aqui **há custo**. Cada tradução consome ~0,5 token Flex, então o
job só roda quando o arquivo é .rvt e a `urn` existe — e a tradução é
reaproveitada entre critérios, nunca disparada uma vez por critério.

**Não verificado contra a Autodesk**: falta credencial do developer hub
(decisão aberta nº 3 do plano técnico). Os testes exercitam o parser da
árvore de propriedades com respostas gravadas; o transporte HTTP fica por
validar quando houver conta.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

import httpx

from app.services.aps import BASE, APSError, token
from app.services.automacao.ifc import Contagem, _preenchido

log = logging.getLogger(__name__)


def urn_base64(urn: str) -> str:
    """O Model Derivative endereça o modelo por URN em base64 sem padding."""
    if not urn.startswith("urn:"):
        return urn
    return base64.urlsafe_b64encode(urn.encode()).decode().rstrip("=")


async def _get(client: httpx.AsyncClient, url: str) -> httpx.Response:
    return await client.get(url, headers={"Authorization": f"Bearer {await token()}"})


async def obter_propriedades(urn: str) -> list[dict[str, Any]]:
    """Baixa a árvore de propriedades da primeira viewable do modelo.

    O endpoint responde 202 enquanto a extração está em andamento; nesse caso
    devolvemos lista vazia e quem chamou decide reenfileirar — bloquear o
    worker esperando tradução é como o orçamento de token escapa.
    """
    codificada = urn_base64(urn)
    async with httpx.AsyncClient(timeout=120) as client:
        metadados = await _get(
            client, f"{BASE}/modelderivative/v2/designdata/{codificada}/metadata"
        )
        if metadados.status_code != 200:
            raise APSError(f"metadados indisponíveis: {metadados.status_code}")

        viewables = metadados.json().get("data", {}).get("metadata", [])
        if not viewables:
            raise APSError("modelo sem viewable traduzida")
        guid = viewables[0]["guid"]

        resposta = await _get(
            client,
            f"{BASE}/modelderivative/v2/designdata/{codificada}/metadata/{guid}/properties",
        )
        if resposta.status_code == 202:
            log.info("tradução do URN %s ainda em andamento", urn)
            return []
        if resposta.status_code != 200:
            raise APSError(f"propriedades indisponíveis: {resposta.status_code}")

        return resposta.json().get("data", {}).get("collection", [])


def auditar_parametros_revit(colecao: list[dict[str, Any]], parametros: list[str]) -> Contagem:
    """Mesma regra da auditoria IFC, sobre a árvore do Model Derivative.

    A coleção vem como uma lista de objetos com `objectid`, `name` e
    `properties` (um dicionário de grupos → propriedades). Achatamos os grupos
    pelo mesmo motivo do IFC: o parâmetro 4D pode estar em qualquer um.
    """
    contagem = Contagem()
    if not parametros:
        return contagem

    for item in colecao:
        propriedades = item.get("properties") or {}
        if not isinstance(propriedades, dict):
            continue

        # Só elementos: o nó raiz e os agrupadores não têm propriedades reais.
        achatado: dict[str, Any] = {}
        for grupo in propriedades.values():
            if isinstance(grupo, dict):
                for chave, valor in grupo.items():
                    achatado.setdefault(chave, valor)
        if not achatado:
            continue

        contagem.analisados += 1

        faltando = [p for p in parametros if p not in achatado]
        vazios = [p for p in parametros if p in achatado and not _preenchido(achatado[p])]

        if not faltando and not vazios:
            contagem.ok += 1
            continue

        partes = []
        if faltando:
            partes.append(f"ausente: {', '.join(faltando)}")
        if vazios:
            partes.append(f"vazio: {', '.join(vazios)}")
        contagem.registrar_falha(
            str(item.get("externalId") or item.get("objectid") or "?"), "; ".join(partes)
        )

    return contagem


def auditar_parametros_por_urn(urn: str, parametros: list[str]) -> Contagem:
    """Ponte síncrona para o executor, que não é async."""
    colecao = asyncio.run(obter_propriedades(urn))
    return auditar_parametros_revit(colecao, parametros)
