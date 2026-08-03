"""As duas tabelas da importação de planilha (migration 0012).

PROVISÓRIAS E ISOLADAS. Não se ligam a `auditoria`, `criterio` nem
`resultado_check`: o que entra aqui alimenta um dashboard e nada mais. O porquê
está no cabeçalho da migration 0012 e em `services/importacao_planilha.py`.

Sem `TimestampMixin`: `updated_at` não faz sentido numa linha que nasce de um
arquivo e nunca é editada — importação se refaz, não se corrige.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, OrgMixin, uuid_pk


class ImportacaoPlanilha(OrgMixin, Base):
    __tablename__ = "importacao_planilha"

    id: Mapped[uuid.UUID] = uuid_pk()
    #: NULO PERMITIDO. As planilhas do DANTE 2 dizem `CPQ04-ARCH-R26` — nome do
    #: projeto anterior, copiado junto com o arquivo. Exigir o vínculo travaria
    #: a importação no erro de digitação deles.
    projeto_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE")
    )
    tipo: Mapped[str] = mapped_column(Text, nullable=False)  # 'geral' | 'lod300'
    arquivo: Mapped[str] = mapped_column(Text, nullable=False)
    disciplina: Mapped[str] = mapped_column(Text, nullable=False)
    modelo: Mapped[str | None] = mapped_column(Text)
    versao: Mapped[str | None] = mapped_column(Text)
    #: RECONTADA a partir dos itens — é esta que o dashboard soma.
    aprovacao: Mapped[float | None] = mapped_column(Float)
    #: A que a planilha declara. Existe para a tela mostrar a divergência: numa
    #: das oito, a fórmula do Excel conta o numerador até a linha 33 e o
    #: denominador até a 65, e declara metade da aprovação real.
    aprovacao_declarada: Mapped[float | None] = mapped_column(Float)
    itens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aprovados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    linhas: Mapped[list[ImportacaoItem]] = relationship(
        back_populates="planilha", cascade="all, delete-orphan", order_by="ImportacaoItem.ordem"
    )


class ImportacaoItem(OrgMixin, Base):
    __tablename__ = "importacao_item"

    id: Mapped[uuid.UUID] = uuid_pk()
    planilha_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("importacao_planilha.id", ondelete="CASCADE"),
        nullable=False,
    )
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Grupo de elemento do LOD 300 (FLOOR, CASEWORK…); nulo na geral.
    grupo: Mapped[str | None] = mapped_column(Text)
    item: Mapped[str] = mapped_column(Text, nullable=False)
    aprovado: Mapped[bool] = mapped_column(Boolean, nullable=False)
    comentario: Mapped[str | None] = mapped_column(Text)
    direcao: Mapped[str | None] = mapped_column(Text)

    planilha: Mapped[ImportacaoPlanilha] = relationship(back_populates="linhas")
