"""SP-105 · Disciplinas — o elo do cadastro.

A disciplina amarra projetista + checklists aplicáveis + nomenclatura + áreas.
É dela que a execução da auditoria (Fase 2) descobre quais abas mostrar.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, computed_field

from app.models.enums import ChecklistTipo, MacroDisc
from app.schemas.comum import ESCRITA, Identificado

SEG = r"^[A-Za-z0-9]+$"


class DisciplinaBase(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(
        default=None,
        max_length=120,
        description=(
            "O nome por extenso: 'Estrutura metálica'. OPCIONAL — a identidade é "
            "o `codigo`, que é o que entra na nomenclatura do arquivo."
        ),
    )
    macro: MacroDisc = Field(description="A=ARCH · C=CIVIL/ESTRUT · M=MEP · S=SITE")
    disc: str = Field(min_length=1, max_length=20, pattern=SEG, description="Ex.: STRC, ARCH, PLMB")
    sub: str = Field(
        min_length=1,
        max_length=20,
        pattern=SEG,
        description="Subdisciplina. Use 'NONE' quando não houver.",
    )
    projetista_id: uuid.UUID | None = Field(
        default=None, description="Empresa responsável pela entrega desta disciplina."
    )
    checklists: list[ChecklistTipo] = Field(
        default_factory=list, description="Auditorias aplicáveis a esta disciplina."
    )
    nomenclatura_id: uuid.UUID | None = Field(
        default=None, description="Standard do tipo 'nomenclatura' que vale aqui."
    )
    areas: list[str] = Field(
        default_factory=list,
        description="Setores auditados (ADMIN, COLO1…). Define o escopo modelo × área do LOD 500.",
    )


class DisciplinaCreate(DisciplinaBase):
    projeto_id: uuid.UUID


class DisciplinaUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, max_length=120)
    macro: MacroDisc | None = None
    disc: str | None = Field(default=None, min_length=1, max_length=20, pattern=SEG)
    sub: str | None = Field(default=None, min_length=1, max_length=20, pattern=SEG)
    projetista_id: uuid.UUID | None = None
    checklists: list[ChecklistTipo] | None = None
    nomenclatura_id: uuid.UUID | None = None
    areas: list[str] | None = None


class DisciplinaOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    codigo: str
    nome: str | None
    macro: MacroDisc
    disc: str
    sub: str
    projetista_id: uuid.UUID | None
    checklists: list[ChecklistTipo]
    nomenclatura_id: uuid.UUID | None
    areas: list[str]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cor_macro(self) -> str:
        """SP-107 · a cor da macrodisciplina sai do backend, para lista,
        matriz e gráficos não divergirem entre si."""
        return CORES_MACRO[self.macro]


# Cores do protótipo, com um ajuste: o teal do MEP era #0E7C6B, cuja saturação
# ficava abaixo do piso de legibilidade — a barra lia como cinza num gráfico.
# #0A8A72 é o mesmo tom, apenas saturado o suficiente para não sumir.
CORES_MACRO: dict[MacroDisc, str] = {
    MacroDisc.A: "#2547B0",
    MacroDisc.C: "#A85B12",
    MacroDisc.M: "#0A8A72",
    MacroDisc.S: "#6A3DAE",
}
