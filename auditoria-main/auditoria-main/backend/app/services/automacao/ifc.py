"""SP-303/305 · Nível 1 — extração de propriedades de arquivos IFC.

IfcOpenShell roda in-house: **sem custo de token**, ao contrário do caminho
Revit (APS). Por isso é a primeira automação de verdade do piloto — cobre o
maior volume de trabalho manual de hoje com a lógica mais simples.

Duas checagens vivem aqui:

- **4D de parâmetros** (SP-303): para cada elemento, verifica se os parâmetros
  esperados (`4D_DISCIPLINE`, `4D_AREA`, `4D_SUBAREA`, `4D_CELL`) existem e
  estão preenchidos. Cada falha vira uma ocorrência com o `GlobalId`.
- **Categorias** (SP-305): compara os `IfcElementAssembly` contra o
  vocabulário cadastrado como `Standard`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Um IFC de datacenter tem centenas de milhares de elementos. Gravar uma
# ocorrência por falha estouraria a tabela e a tela; guardamos as primeiras e
# **dizemos no comentário** que houve corte — contagem truncada em silêncio é
# pior que contagem ausente.
LIMITE_OCORRENCIAS = 500


@dataclass
class Ocorrido:
    element_id: str
    detalhe: str


@dataclass
class Contagem:
    analisados: int = 0
    ok: int = 0
    ocorrencias: list[Ocorrido] = field(default_factory=list)
    truncado: bool = False

    def registrar_falha(self, element_id: str, detalhe: str) -> None:
        if len(self.ocorrencias) < LIMITE_OCORRENCIAS:
            self.ocorrencias.append(Ocorrido(element_id=element_id, detalhe=detalhe))
        else:
            self.truncado = True


class IfcIndisponivel(RuntimeError):
    """IfcOpenShell não instalado — o extra `bim` do pyproject não foi aplicado."""


def abrir(caminho: str):
    """Abre o IFC. Import tardio: a API não precisa do IfcOpenShell carregado."""
    try:
        import ifcopenshell
    except ImportError as exc:  # pragma: no cover - depende do ambiente
        raise IfcIndisponivel(
            "IfcOpenShell não instalado; use `pip install -e \".[bim]\"` no worker"
        ) from exc
    return ifcopenshell.open(caminho)


def _psets(elemento) -> dict[str, dict[str, Any]]:
    import ifcopenshell.util.element

    try:
        return ifcopenshell.util.element.get_psets(elemento)
    except Exception:  # pragma: no cover - IFC malformado
        return {}


def _valores_por_propriedade(elemento) -> dict[str, Any]:
    """Achata todos os psets num único mapa `propriedade -> valor`.

    O parâmetro 4D pode estar em qualquer pset dependendo de quem exportou —
    o que importa é se ele existe em algum lugar do elemento.
    """
    achatado: dict[str, Any] = {}
    for pset in _psets(elemento).values():
        if not isinstance(pset, dict):
            continue
        for chave, valor in pset.items():
            if chave == "id":
                continue
            achatado.setdefault(chave, valor)
    return achatado


def _preenchido(valor: Any) -> bool:
    """Presente **e** com conteúdo.

    Um parâmetro que existe vazio é o mesmo problema que um ausente: o
    fornecedor não preencheu. A distinção aparece no detalhe da ocorrência,
    porque a correção é diferente (criar o parâmetro × preencher o valor).
    """
    if valor is None:
        return False
    if isinstance(valor, str):
        return bool(valor.strip())
    return True


def auditar_parametros(
    modelo_ifc, parametros: list[str], *, tipo_elemento: str = "IfcElement"
) -> Contagem:
    """SP-303 · presença dos parâmetros esperados, elemento a elemento.

    Um elemento só conta como OK quando **todos** os parâmetros pedidos estão
    preenchidos — é assim que a planilha 4D é lida hoje.
    """
    contagem = Contagem()
    if not parametros:
        return contagem

    for elemento in modelo_ifc.by_type(tipo_elemento):
        contagem.analisados += 1
        valores = _valores_por_propriedade(elemento)

        faltando: list[str] = []
        vazios: list[str] = []
        for parametro in parametros:
            if parametro not in valores:
                faltando.append(parametro)
            elif not _preenchido(valores[parametro]):
                vazios.append(parametro)

        if not faltando and not vazios:
            contagem.ok += 1
            continue

        partes = []
        if faltando:
            partes.append(f"ausente: {', '.join(faltando)}")
        if vazios:
            partes.append(f"vazio: {', '.join(vazios)}")
        contagem.registrar_falha(
            getattr(elemento, "GlobalId", str(elemento.id())), "; ".join(partes)
        )

    return contagem


def auditar_categorias(modelo_ifc, vocabulario: list[str]) -> Contagem:
    """SP-305 · `IfcElementAssembly` contra o dicionário do projeto.

    O vocabulário vem de um `Standard` do tipo `vocabulario` (ANCHOR, BEAM,
    COLUMN…). Sem vocabulário cadastrado não há o que comparar, e a checagem
    devolve contagem zerada — quem decide o que fazer com isso é o executor.
    """
    contagem = Contagem()
    aceitos = {v.strip().upper() for v in vocabulario if v and v.strip()}
    if not aceitos:
        return contagem

    for elemento in modelo_ifc.by_type("IfcElementAssembly"):
        contagem.analisados += 1
        # ObjectType é onde a categoria costuma vir; Name é o fallback usado
        # por exportadores que não preenchem o tipo.
        bruto = getattr(elemento, "ObjectType", None) or getattr(elemento, "Name", None) or ""
        categoria = str(bruto).strip().upper()

        if categoria in aceitos:
            contagem.ok += 1
        else:
            contagem.registrar_falha(
                getattr(elemento, "GlobalId", str(elemento.id())),
                f"categoria '{bruto or '(vazia)'}' fora do dicionário",
            )

    return contagem


def auditar_elementos_soltos(modelo_ifc) -> Contagem:
    """Elementos satélite: sem vínculo com estrutura espacial nem com conjunto.

    Um elemento que não está contido em nenhum andar/espaço e não faz parte de
    nenhum assembly está "flutuando" — é o que a auditoria Geral chama de
    satélite.
    """
    contagem = Contagem()

    agregados: set[int] = set()
    for relacao in modelo_ifc.by_type("IfcRelAggregates"):
        for filho in relacao.RelatedObjects or []:
            agregados.add(filho.id())

    contidos: set[int] = set()
    for relacao in modelo_ifc.by_type("IfcRelContainedInSpatialStructure"):
        for filho in relacao.RelatedElements or []:
            contidos.add(filho.id())

    for elemento in modelo_ifc.by_type("IfcElement"):
        contagem.analisados += 1
        if elemento.id() in contidos or elemento.id() in agregados:
            contagem.ok += 1
        else:
            contagem.registrar_falha(
                getattr(elemento, "GlobalId", str(elemento.id())),
                "sem estrutura espacial nem conjunto que o contenha",
            )
    return contagem


def contar_por_tipo(modelo_ifc, tipo: str) -> int:
    return len(modelo_ifc.by_type(tipo))


def resumo_do_arquivo(modelo_ifc) -> dict[str, Any]:
    """Metadados para a tela e para o log do worker."""
    projeto = next(iter(modelo_ifc.by_type("IfcProject")), None)
    return {
        "schema": modelo_ifc.schema,
        "projeto": getattr(projeto, "Name", None) if projeto else None,
        "elementos": contar_por_tipo(modelo_ifc, "IfcElement"),
        "assemblies": contar_por_tipo(modelo_ifc, "IfcElementAssembly"),
    }
