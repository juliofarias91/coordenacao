"""Gera arquivos IFC de verdade para os testes da automação.

Testar o motor IFC com mocks não provaria nada: o risco está justamente em
como o IfcOpenShell expõe psets, agregações e estrutura espacial. Aqui os
arquivos são pequenos, mas são IFC reais, abertos pelo mesmo caminho de
código que abre a entrega do fornecedor.
"""

from __future__ import annotations

import tempfile
from typing import Any

import ifcopenshell
import ifcopenshell.api


def _novo() -> Any:
    modelo = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.run("root.create_entity", modelo, ifc_class="IfcProject", name="CPQ11")
    ifcopenshell.api.run("unit.assign_unit", modelo)
    return modelo


def _pset(modelo: Any, elemento: Any, nome: str, propriedades: dict[str, Any]) -> None:
    pset = ifcopenshell.api.run(
        "pset.add_pset", modelo, product=elemento, name=nome
    )
    ifcopenshell.api.run("pset.edit_pset", modelo, pset=pset, properties=propriedades)


def modelo_4d(
    *,
    elementos_ok: int = 2,
    elementos_sem_parametro: int = 1,
    elementos_com_parametro_vazio: int = 0,
    parametros: tuple[str, ...] = ("4D_DISCIPLINE", "4D_AREA"),
) -> Any:
    """Modelo para a auditoria 4D (SP-303).

    Todos os elementos ficam contidos num andar, para não serem contados como
    satélites por acidente.
    """
    modelo = _novo()
    andar = ifcopenshell.api.run(
        "root.create_entity", modelo, ifc_class="IfcBuildingStorey", name="TERREO"
    )

    criados = []
    for i in range(elementos_ok):
        viga = ifcopenshell.api.run(
            "root.create_entity", modelo, ifc_class="IfcBeam", name=f"VIGA-OK-{i}"
        )
        _pset(modelo, viga, "Pset_4D", {p: f"valor-{i}" for p in parametros})
        criados.append(viga)

    for i in range(elementos_sem_parametro):
        viga = ifcopenshell.api.run(
            "root.create_entity", modelo, ifc_class="IfcBeam", name=f"VIGA-SEM-{i}"
        )
        _pset(modelo, viga, "Pset_Outro", {"COR": "azul"})
        criados.append(viga)

    for i in range(elementos_com_parametro_vazio):
        viga = ifcopenshell.api.run(
            "root.create_entity", modelo, ifc_class="IfcBeam", name=f"VIGA-VAZIA-{i}"
        )
        # Primeiro parâmetro presente porém em branco: o fornecedor criou o
        # campo e não preencheu — falha diferente de "ausente".
        valores: dict[str, Any] = {p: f"valor-{i}" for p in parametros}
        valores[parametros[0]] = "   "
        _pset(modelo, viga, "Pset_4D", valores)
        criados.append(viga)

    ifcopenshell.api.run(
        "spatial.assign_container", modelo, products=criados, relating_structure=andar
    )
    return modelo


def modelo_com_assemblies(categorias: list[str]) -> Any:
    """Modelo para a auditoria de categorias (SP-305)."""
    modelo = _novo()
    andar = ifcopenshell.api.run(
        "root.create_entity", modelo, ifc_class="IfcBuildingStorey", name="TERREO"
    )
    conjuntos = []
    for i, categoria in enumerate(categorias):
        conjunto = ifcopenshell.api.run(
            "root.create_entity", modelo, ifc_class="IfcElementAssembly", name=f"ASM-{i}"
        )
        conjunto.ObjectType = categoria
        conjuntos.append(conjunto)
    ifcopenshell.api.run(
        "spatial.assign_container", modelo, products=conjuntos, relating_structure=andar
    )
    return modelo


def modelo_com_satelites(*, contidos: int = 2, soltos: int = 1) -> Any:
    """Modelo para a checagem de elementos satélite."""
    modelo = _novo()
    andar = ifcopenshell.api.run(
        "root.create_entity", modelo, ifc_class="IfcBuildingStorey", name="TERREO"
    )
    dentro = [
        ifcopenshell.api.run("root.create_entity", modelo, ifc_class="IfcBeam", name=f"DENTRO-{i}")
        for i in range(contidos)
    ]
    if dentro:
        ifcopenshell.api.run(
            "spatial.assign_container", modelo, products=dentro, relating_structure=andar
        )
    for i in range(soltos):
        ifcopenshell.api.run("root.create_entity", modelo, ifc_class="IfcBeam", name=f"SOLTO-{i}")
    return modelo


def gravar(modelo: Any) -> str:
    """Grava num arquivo temporário e devolve o caminho."""
    with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as arquivo:
        caminho = arquivo.name
    modelo.write(caminho)
    return caminho


def bytes_de(modelo: Any) -> bytes:
    import os

    caminho = gravar(modelo)
    try:
        with open(caminho, "rb") as arquivo:
            return arquivo.read()
    finally:
        os.unlink(caminho)
