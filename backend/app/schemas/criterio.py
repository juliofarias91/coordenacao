"""SP-106 · Biblioteca de critérios e composição dos checklists.

O critério é canônico: "Model name" existe uma vez e é instanciado no
checklist Geral e no IFC. O `ChecklistItem` é a junção, e é nela que moram os
overrides locais (instrução, fase, LOD/LOI mínimos, peso).
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.models.enums import Automacao, ChecklistTipo, CriterioNivel
from app.schemas.comum import ESCRITA, Identificado


class CriterioBase(BaseModel):
    model_config = ESCRITA

    nome_pt: str = Field(min_length=1, max_length=200)
    nome_en: str = Field(min_length=1, max_length=200)
    categoria: str | None = Field(
        default=None, max_length=120, description="Agrupa na tela (ex.: 'Aspectos gerais')"
    )
    nivel: CriterioNivel = Field(
        description="modelo=pass/fail no arquivo · elemento=explode em ocorrências por ID"
    )
    automacao: Automacao = Field(
        description="auto=extração de propriedades · design_automation=Revit headless · manual"
    )
    standard_id: uuid.UUID | None = None
    parametro_esperado: str | None = Field(
        default=None, max_length=120, description="Ex.: '4D_AREA', 'BF_FIRE RATING'"
    )
    criterio_aceitacao: str | None = None
    instrucao: str | None = None
    referencia_url: str | None = Field(default=None, max_length=500)


class CriterioCreate(CriterioBase):
    projeto_id: uuid.UUID
    codigo: str = Field(
        min_length=1,
        max_length=60,
        pattern=r"^[A-Za-z0-9_]+$",
        description="Identificador estável (ex.: 'SATELLITE'). Único no projeto.",
    )


class CriterioUpdate(BaseModel):
    model_config = ESCRITA

    nome_pt: str | None = Field(default=None, min_length=1, max_length=200)
    nome_en: str | None = Field(default=None, min_length=1, max_length=200)
    categoria: str | None = Field(default=None, max_length=120)
    nivel: CriterioNivel | None = None
    automacao: Automacao | None = None
    standard_id: uuid.UUID | None = None
    parametro_esperado: str | None = Field(default=None, max_length=120)
    criterio_aceitacao: str | None = None
    instrucao: str | None = None
    referencia_url: str | None = Field(default=None, max_length=500)


class CriterioOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    codigo: str
    nome_pt: str
    nome_en: str
    categoria: str | None
    nivel: CriterioNivel
    automacao: Automacao
    standard_id: uuid.UUID | None
    parametro_esperado: str | None
    criterio_aceitacao: str | None
    instrucao: str | None
    referencia_url: str | None


class CriterioComUso(CriterioOut):
    """Em quantos checklists o critério é usado — é o que a tela da biblioteca
    mostra para deixar claro que editar aqui reflete em todos eles."""

    usos: int = 0


# ----------------------------------------------------------------- checklists
class ItemChecklistIn(BaseModel):
    model_config = ESCRITA

    criterio_id: uuid.UUID
    ordem: int | None = None
    obrigatorio: bool = True
    fase: str | None = Field(
        default=None, max_length=60, description="geral | issue-for-construction | …"
    )
    min_lod: str | None = Field(default=None, max_length=10)   # 300 | 350 | 400 | 500
    min_loi: str | None = Field(default=None, max_length=10)
    instrucao_override: str | None = None
    peso: int = Field(default=1, ge=1, le=100)


class ChecklistIn(BaseModel):
    model_config = ESCRITA

    projeto_id: uuid.UUID
    itens: list[ItemChecklistIn] = Field(
        description="Composição completa do checklist. Substitui a anterior."
    )


class ItemChecklistOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    checklist: ChecklistTipo
    criterio_id: uuid.UUID
    ordem: int | None
    obrigatorio: bool
    fase: str | None
    min_lod: str | None
    min_loi: str | None
    instrucao_override: str | None
    peso: int
    criterio: CriterioOut


class ChecklistOut(BaseModel):
    checklist: ChecklistTipo
    projeto_id: uuid.UUID
    itens: list[ItemChecklistOut]


# -------------------------------------------------------------------- gabarito
class LinhaGabarito(BaseModel):
    """Uma linha do gabarito DE FÁBRICA, antes de virar critério de um projeto.

    Não é `CriterioOut`: aqui não há `id`, `projeto_id` nem `created_at`, porque
    isto não é uma linha do banco — é a estrutura padrão, que mora em código
    (`services/gabarito.py`). Devolver um `CriterioOut` com ids falsos faria a
    tela achar que pode editá-la.

    `codigo` vai junto porque é ele que casa esta linha com o `Criterio` do
    projeto, quando o projeto adotar o gabarito.
    """

    codigo: str
    nome_pt: str
    nome_en: str
    categoria: str
    instrucao: str | None = None
    criterio_aceitacao: str | None = None
    parametro_esperado: str | None = None


class GabaritoIn(BaseModel):
    model_config = ESCRITA

    projeto_id: uuid.UUID
    disciplina: str | None = Field(
        default=None,
        max_length=20,
        description=(
            "OBRIGATÓRIA nos checklists de LOD, ignorada na geral. Os 17 itens da "
            "geral são os mesmos nas oito disciplinas; os de LOD não — FLOOR e "
            "STRUCTURAL COLUMNS são categorias de estrutura. É o código da "
            "disciplina (`STRC`), não o id."
        ),
    )


class GabaritoAplicado(ChecklistOut):
    """O que a aplicação do gabarito fez, em códigos.

    A tela mostra isto como frase: "15 critérios criados, 2 já existiam". O
    detalhe importa porque aplicar o gabarito num projeto que já mexeu na
    biblioteca não sobrescreve nada — e quem clicou merece saber o que foi
    preservado em vez de precisar ir conferir item por item.
    """

    criterios_criados: list[str] = Field(default_factory=list)
    criterios_reaproveitados: list[str] = Field(default_factory=list)
    itens_criados: list[str] = Field(default_factory=list)
    itens_existentes: list[str] = Field(default_factory=list)
