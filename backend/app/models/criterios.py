"""Biblioteca de critérios e checklists — plano técnico, seção 3.3.

O critério é canônico e reutilizável: "Model name" existe uma vez e é
instanciado no checklist Geral e no IFC. Editar o critério reflete em todos os
checklists que o usam — é o que evita a duplicação das planilhas de hoje.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, OrgMixin, RemovivelMixin, TimestampMixin, uuid_pk
from app.models.enums import Automacao, ChecklistTipo, CriterioNivel, pg_enum


class Criterio(OrgMixin, TimestampMixin, RemovivelMixin, Base):
    __tablename__ = "criterio"
    __table_args__ = (UniqueConstraint("projeto_id", "codigo", name="uq_criterio_projeto_codigo"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    codigo: Mapped[str] = mapped_column(Text, nullable=False)      # 'SATELLITE'
    # Rótulo bilíngue: é daqui que sai o relatório PT/EN.
    nome_pt: Mapped[str] = mapped_column(Text, nullable=False)
    nome_en: Mapped[str] = mapped_column(Text, nullable=False)
    categoria: Mapped[str | None] = mapped_column(Text)
    nivel: Mapped[CriterioNivel] = mapped_column(
        pg_enum(CriterioNivel, "criterio_nivel"), nullable=False
    )
    automacao: Mapped[Automacao] = mapped_column(pg_enum(Automacao, "automacao"), nullable=False)
    standard_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("standard.id", ondelete="SET NULL")
    )
    # Parâmetro nativo do Revit ou custom: BF_FIRE RATING, 4D_AREA...
    parametro_esperado: Mapped[str | None] = mapped_column(Text)
    criterio_aceitacao: Mapped[str | None] = mapped_column(Text)
    instrucao: Mapped[str | None] = mapped_column(Text)
    referencia_url: Mapped[str | None] = mapped_column(Text)

    standard = relationship("Standard")


class ChecklistItem(OrgMixin, TimestampMixin, Base):
    """Junção checklist × critério, com os overrides locais.

    O mesmo critério exige coisas diferentes conforme a fase e o formato — é
    isso que `fase`, `min_lod` e `min_loi` capturam (A5.37).
    """

    __tablename__ = "checklist_item"
    __table_args__ = (
        UniqueConstraint(
            "projeto_id", "checklist", "criterio_id", name="uq_checklist_item_unico"
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    checklist: Mapped[ChecklistTipo] = mapped_column(
        pg_enum(ChecklistTipo, "checklist_tipo"), nullable=False
    )
    criterio_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("criterio.id", ondelete="CASCADE"), nullable=False
    )
    ordem: Mapped[int | None] = mapped_column(Integer)
    obrigatorio: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    fase: Mapped[str | None] = mapped_column(Text)     # geral | issue-for-construction | ...
    min_lod: Mapped[str | None] = mapped_column(Text)  # 300 | 350 | 400 | 500
    min_loi: Mapped[str | None] = mapped_column(Text)
    instrucao_override: Mapped[str | None] = mapped_column(Text)
    peso: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))

    criterio: Mapped[Criterio] = relationship()
