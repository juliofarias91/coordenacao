"""Execução da auditoria — plano técnico, seção 3.4.

Este é o dado de origem. Painel de controle, matriz LOD 500, relatório e KPIs
são consultas sobre estas tabelas — nenhum deles é mantido à mão.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, OrgMixin, RemovivelMixin, TimestampMixin, uuid_pk
from app.models.enums import (
    AuditoriaEstado,
    ChecklistTipo,
    CheckStatus,
    OrigemResult,
    pg_enum,
)


class Auditoria(OrgMixin, TimestampMixin, Base):
    """Uma rodada de verificação de uma versão contra um checklist.

    `area` só é preenchida nas auditorias de especificação (LOD 400/500), em
    que o escopo é modelo × área.
    """

    __tablename__ = "auditoria"

    id: Mapped[uuid.UUID] = uuid_pk()
    versao_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("versao_modelo.id", ondelete="CASCADE"), nullable=False
    )
    checklist: Mapped[ChecklistTipo] = mapped_column(
        pg_enum(ChecklistTipo, "checklist_tipo"), nullable=False
    )
    area: Mapped[str | None] = mapped_column(Text)
    round: Mapped[int | None] = mapped_column(Integer)
    estado: Mapped[AuditoriaEstado] = mapped_column(
        pg_enum(AuditoriaEstado, "auditoria_estado"),
        nullable=False,
        server_default=text("'nao_publicado'"),
    )
    # Derivado de resultado_check; materializado para o painel não recalcular.
    aprovacao_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    auditor_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("usuario.id", ondelete="SET NULL")
    )
    revisado_por: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("usuario.id", ondelete="SET NULL")
    )
    data_inicio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_fim: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entrega_estimada: Mapped[date | None] = mapped_column(Date)
    publicado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    resultados: Mapped[list[ResultadoCheck]] = relationship(
        back_populates="auditoria", cascade="all, delete-orphan"
    )
    nao_conformidades: Mapped[list[NaoConformidade]] = relationship(back_populates="auditoria")


class ResultadoCheck(OrgMixin, TimestampMixin, Base):
    """O status de um critério dentro de uma auditoria.

    `origem` é a costura da automação: o worker grava 'automatico', o auditor
    pode sobrescrever para 'manual'.
    """

    __tablename__ = "resultado_check"
    __table_args__ = (
        UniqueConstraint("auditoria_id", "criterio_id", name="uq_resultado_auditoria_criterio"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    auditoria_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("auditoria.id", ondelete="CASCADE"), nullable=False
    )
    criterio_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("criterio.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[CheckStatus] = mapped_column(
        pg_enum(CheckStatus, "check_status"), nullable=False, server_default=text("'pendente'")
    )
    origem: Mapped[OrigemResult] = mapped_column(
        pg_enum(OrigemResult, "origem_result"), nullable=False, server_default=text("'manual'")
    )
    # As duas frases da linha reprovada, e elas são diferentes: `comentario` é
    # o DIAGNÓSTICO (a coluna COMENTARY da planilha, "há elementos em fases
    # diferentes") e `direcao` é a ORIENTAÇÃO (a coluna DIRECTION, "alinhe
    # todos os elementos à mesma fase"). Uma descreve, a outra manda fazer.
    # Antes da 0008 só existia a primeira, e a orientação vazava para dentro
    # dela — o que tornava impossível mandar ao fornecedor só o que ele deve
    # fazer, sem o texto interno de diagnóstico.
    comentario: Mapped[str | None] = mapped_column(Text)
    direcao: Mapped[str | None] = mapped_column(Text)
    # Contadores do arquétipo nível-elemento (4D, LOD 400).
    itens_analisados: Mapped[int | None] = mapped_column(Integer)
    itens_ok: Mapped[int | None] = mapped_column(Integer)

    auditoria: Mapped[Auditoria] = relationship(back_populates="resultados")
    criterio = relationship("Criterio")
    ocorrencias: Mapped[list[Ocorrencia]] = relationship(
        back_populates="resultado", cascade="all, delete-orphan"
    )
    evidencias: Mapped[list[Evidencia]] = relationship(
        back_populates="resultado", cascade="all, delete-orphan"
    )


class Ocorrencia(OrgMixin, TimestampMixin, Base):
    """Um elemento reprovado. Só existe em resultado de nível elemento.

    É aqui que a auditoria 4D "explode": cada elemento sem o parâmetro 4D
    esperado vira uma linha com o GlobalId/ElementId.
    """

    __tablename__ = "ocorrencia"

    id: Mapped[uuid.UUID] = uuid_pk()
    resultado_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resultado_check.id", ondelete="CASCADE"), nullable=False
    )
    element_id: Mapped[str] = mapped_column(Text, nullable=False)
    detalhe: Mapped[str | None] = mapped_column(Text)

    resultado: Mapped[ResultadoCheck] = relationship(back_populates="ocorrencias")


class Evidencia(OrgMixin, TimestampMixin, RemovivelMixin, Base):
    __tablename__ = "evidencia"

    id: Mapped[uuid.UUID] = uuid_pk()
    resultado_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resultado_check.id", ondelete="CASCADE"), nullable=False
    )
    arquivo_url: Mapped[str] = mapped_column(Text, nullable=False)   # chave no S3
    legenda: Mapped[str | None] = mapped_column(Text)

    resultado: Mapped[ResultadoCheck] = relationship(back_populates="evidencias")


class NaoConformidade(OrgMixin, TimestampMixin, Base):
    """Achado que vira pendência acompanhável. Alimenta o relatório de RNC."""

    __tablename__ = "nao_conformidade"

    id: Mapped[uuid.UUID] = uuid_pk()
    auditoria_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("auditoria.id", ondelete="CASCADE"), nullable=False
    )
    criterio_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("criterio.id", ondelete="SET NULL")
    )
    resultado_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resultado_check.id", ondelete="SET NULL")
    )
    descricao: Mapped[str | None] = mapped_column(Text)
    recomendacao: Mapped[str | None] = mapped_column(Text)
    elementos: Mapped[str | None] = mapped_column(Text)   # IDs afetados
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="SET NULL")
    )
    prazo: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'aberto'")
    )  # aberto | em_analise | resolvido

    auditoria: Mapped[Auditoria] = relationship(back_populates="nao_conformidades")
    comentarios: Mapped[list[ComentarioFornecedor]] = relationship(
        back_populates="nao_conformidade", cascade="all, delete-orphan"
    )


class ComentarioFornecedor(OrgMixin, TimestampMixin, Base):
    """Loop de resposta do fornecedor (a coluna SUPPLIERS COMMENTS do LOD 400)."""

    __tablename__ = "comentario_fornecedor"

    id: Mapped[uuid.UUID] = uuid_pk()
    nc_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("nao_conformidade.id", ondelete="CASCADE"),
        nullable=False,
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("usuario.id", ondelete="SET NULL")
    )
    texto: Mapped[str | None] = mapped_column(Text)

    nao_conformidade: Mapped[NaoConformidade] = relationship(back_populates="comentarios")
