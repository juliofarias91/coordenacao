"""Apontamentos, notificações, portal do cliente e trilha — seção 3.5."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, OrgMixin, TimestampMixin, uuid_pk
from app.models.enums import NotifTipo, pg_enum


class Apontamento(OrgMixin, TimestampMixin, Base):
    """Issue do projeto, espelhável no ACC Issues."""

    __tablename__ = "apontamento"

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    codigo: Mapped[str | None] = mapped_column(Text)     # 'AP-001'
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    modelo_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("modelo.id", ondelete="SET NULL")
    )
    disciplina: Mapped[str | None] = mapped_column(Text)
    prioridade: Mapped[str | None] = mapped_column(Text)  # alta | media | baixa
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'aberto'"))
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="SET NULL")
    )
    descricao: Mapped[str | None] = mapped_column(Text)
    acc_issue_id: Mapped[str | None] = mapped_column(Text, index=True)


class Notificacao(OrgMixin, TimestampMixin, Base):
    """`usuario_id` nulo = broadcast por papel (`papel_alvo`)."""

    __tablename__ = "notificacao"

    id: Mapped[uuid.UUID] = uuid_pk()
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("usuario.id", ondelete="CASCADE")
    )
    papel_alvo: Mapped[str | None] = mapped_column(Text)
    tipo: Mapped[NotifTipo] = mapped_column(pg_enum(NotifTipo, "notif_tipo"), nullable=False)
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    origem: Mapped[str | None] = mapped_column(Text)
    lida: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))


class Penalidade(OrgMixin, TimestampMixin, Base):
    """Ledger. `empresa.penalidades` é só o contador materializado disto."""

    __tablename__ = "penalidade"

    id: Mapped[uuid.UUID] = uuid_pk()
    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False
    )
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    peso: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    referencia: Mapped[str | None] = mapped_column(Text)


class ConviteCliente(OrgMixin, TimestampMixin, Base):
    """Visibilidade por campo do portal do cliente.

    O portal lê `secoes`/`colunas` para decidir o que mostrar — o cliente
    nunca toca a API interna.
    """

    __tablename__ = "convite_cliente"

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    cliente_nome: Mapped[str | None] = mapped_column(Text)
    cliente_email: Mapped[str | None] = mapped_column(Text)
    # {"painel": true, "matriz": true, "relatorio": false, "avanco": true}
    secoes: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # {"code": true, "disc": true, "co": false, ...}
    colunas: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class TrilhaAuditoria(OrgMixin, TimestampMixin, Base):
    """Audit log: quem mudou o quê. Append-only."""

    __tablename__ = "trilha_auditoria"

    id: Mapped[uuid.UUID] = uuid_pk()
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("usuario.id", ondelete="SET NULL")
    )
    entidade: Mapped[str | None] = mapped_column(Text, index=True)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    acao: Mapped[str | None] = mapped_column(Text)
    diff: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class ReporteErro(OrgMixin, TimestampMixin, Base):
    """Erro do SISTEMA reportado por quem usa — texto e print.

    NÃO CONFUNDIR COM `Apontamento`, que também é "um apontamento de erro" na
    fala do dia a dia e é outra coisa inteiramente: aquele é do MODELO auditado
    e vira issue no ACC; este é da PLATAFORMA, e vira trabalho de quem a
    mantém. Misturar os dois faria a lista de pendências de obra encher de
    "botão não funciona".

    Quem reporta é qualquer pessoa autenticada — quem não consegue usar a tela
    é justamente quem precisa avisar. Quem LÊ e resolve é só quem administra: o
    reporte carrega print, e print de tela de auditoria mostra dado de projeto.
    """

    __tablename__ = "reporte_erro"

    id: Mapped[uuid.UUID] = uuid_pk()
    # SET NULL e não CASCADE: o reporte sobrevive à saída de quem o abriu. Um
    # bug não deixa de existir porque a pessoa que o encontrou saiu da empresa.
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("usuario.id", ondelete="SET NULL")
    )
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    # A URL em que a pessoa estava. Preenchida pelo cliente, não digitada:
    # "não funciona" sem a tela é um chamado que começa com uma pergunta.
    caminho: Mapped[str | None] = mapped_column(Text)
    # Chave do print no S3. Nunca uma URL pública — o bucket é privado.
    print_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'aberto'"))
    # A resposta de quem administra: o que foi feito, ou por que não será.
    resposta: Mapped[str | None] = mapped_column(Text)
