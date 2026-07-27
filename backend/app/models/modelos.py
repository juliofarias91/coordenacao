"""Modelos BIM e suas versões — plano técnico, seção 3.3 (final).

Um `modelo` é a entrega de uma disciplina por uma instaladora; a
`versao_modelo` é cada rodada de arquivo que chega (V1, V2...), vinda do ACC
ou de upload manual.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, OrgMixin, TimestampMixin, uuid_pk
from app.models.enums import VersaoFormato, pg_enum


class Modelo(OrgMixin, TimestampMixin, Base):
    __tablename__ = "modelo"
    __table_args__ = (UniqueConstraint("projeto_id", "codigo", name="uq_modelo_projeto_codigo"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    codigo: Mapped[str] = mapped_column(Text, nullable=False)  # 'CPQ11-STRC-STEEL-DATA'
    disciplina_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("disciplina.id", ondelete="SET NULL")
    )
    instaladora_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="SET NULL")
    )
    modeladora_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="SET NULL")
    )
    acc_item_id: Mapped[str | None] = mapped_column(Text, index=True)

    versoes: Mapped[list[VersaoModelo]] = relationship(
        back_populates="modelo", cascade="all, delete-orphan", order_by="VersaoModelo.created_at"
    )


class VersaoModelo(OrgMixin, TimestampMixin, Base):
    __tablename__ = "versao_modelo"
    __table_args__ = (UniqueConstraint("modelo_id", "versao", name="uq_versao_modelo_versao"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    modelo_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("modelo.id", ondelete="CASCADE"), nullable=False
    )
    versao: Mapped[str] = mapped_column(Text, nullable=False)   # 'V3'
    round: Mapped[int | None] = mapped_column(Integer)
    formato: Mapped[VersaoFormato] = mapped_column(
        pg_enum(VersaoFormato, "versao_formato"), nullable=False
    )
    autoria: Mapped[str | None] = mapped_column(Text)           # 'Revit' | 'Tekla→IFC'
    acc_version: Mapped[str | None] = mapped_column(Text)       # R22 | R24
    arquivo_url: Mapped[str | None] = mapped_column(Text)       # chave no S3
    urn: Mapped[str | None] = mapped_column(Text)               # URN do APS (Revit)
    publicado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    modelo: Mapped[Modelo] = relationship(back_populates="versoes")
