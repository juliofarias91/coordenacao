"""Núcleo do cadastro — plano técnico, seção 3.2.

organização → cliente/projeto → empresas → disciplinas é a espinha do sistema.
A `disciplina` é o elo: amarra projetista, checklists aplicáveis, nomenclatura
e áreas.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, OrgMixin, TimestampMixin, uuid_pk
from app.models.enums import (
    ChecklistTipo,
    EmpresaPapel,
    EmpresaTipo,
    MacroDisc,
    PapelUsuario,
    pg_enum,
)


class Organizacao(TimestampMixin, Base):
    """Tenant. A SPBIM é uma; um dia outra consultoria pode ser outra."""

    __tablename__ = "organizacao"

    id: Mapped[uuid.UUID] = uuid_pk()
    nome: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str | None] = mapped_column(Text, unique=True)

    projetos: Mapped[list[Projeto]] = relationship(back_populates="organizacao")


class Cliente(OrgMixin, TimestampMixin, Base):
    """Quem CONTRATA a auditoria — a Microsoft do CPQ11.

    Não confundir com `Empresa`, que é quem PRODUZ o modelo (projetista,
    instaladora, modeladora) e responde por não-conformidade e penalidade. São
    lados opostos da mesa: o cliente recebe o relatório, a empresa é auditada
    nele. Misturar os dois numa tabela só faria a penalidade de uma virar
    histórico do outro.

    Era um campo de texto em `projeto` até a migration 0003. Virou entidade
    porque texto livre não agrupa — 'Microsoft', 'microsoft' e 'MS' seriam três
    pastas na home — e porque o cliente precisa de dados próprios (contato,
    e-mail) que não cabem repetidos em cada projeto dele.
    """

    __tablename__ = "cliente"
    __table_args__ = (UniqueConstraint("org_id", "nome", name="uq_cliente_org_nome"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    nome: Mapped[str] = mapped_column(Text, nullable=False)
    contato: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'ativo'"))

    projetos: Mapped[list[Projeto]] = relationship(back_populates="cliente")


class Projeto(OrgMixin, TimestampMixin, Base):
    __tablename__ = "projeto"
    __table_args__ = (UniqueConstraint("org_id", "codigo", name="uq_projeto_org_codigo"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    codigo: Mapped[str] = mapped_column(Text, nullable=False)          # 'CPQ11'
    nome: Mapped[str] = mapped_column(Text, nullable=False)
    # SET NULL, e não CASCADE: apagar um cliente não pode levar junto o
    # histórico de auditoria dos projetos dele.
    cliente_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("cliente.id", ondelete="SET NULL"), index=True
    )
    coordenacao: Mapped[str | None] = mapped_column(Text)
    bep_ref: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'config'"))

    organizacao: Mapped[Organizacao] = relationship(back_populates="projetos")
    cliente: Mapped[Cliente | None] = relationship(back_populates="projetos")
    disciplinas: Mapped[list[Disciplina]] = relationship(back_populates="projeto")


class Empresa(OrgMixin, TimestampMixin, Base):
    """Projetista/instaladora/modeladora. A mesma empresa pode ter vários papéis."""

    __tablename__ = "empresa"

    id: Mapped[uuid.UUID] = uuid_pk()
    nome: Mapped[str] = mapped_column(Text, nullable=False)
    cnpj: Mapped[str | None] = mapped_column(Text)
    tipo: Mapped[EmpresaTipo] = mapped_column(
        pg_enum(EmpresaTipo, "empresa_tipo"),
        nullable=False,
        server_default=text("'terceirizada'"),
    )
    # Cadeia de subcontratação: quem contratou esta empresa.
    contratada_por: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="SET NULL")
    )
    papeis: Mapped[list[EmpresaPapel]] = mapped_column(
        ARRAY(pg_enum(EmpresaPapel, "empresa_papel")),
        nullable=False,
        server_default=text("'{}'"),
    )
    ferramenta: Mapped[str | None] = mapped_column(Text)      # 'Revit' | 'Tekla'
    departamento: Mapped[str | None] = mapped_column(Text)
    disciplinas: Mapped[str | None] = mapped_column(Text)     # rótulo livre ('STRC / ARCH')
    logo_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'ativo'"))
    # Contador materializado; a fonte é o ledger `penalidade`.
    penalidades: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    contratante: Mapped[Empresa | None] = relationship(remote_side=[id])
    contatos: Mapped[list[Contato]] = relationship(
        back_populates="empresa", cascade="all, delete-orphan"
    )


class Contato(OrgMixin, TimestampMixin, Base):
    __tablename__ = "contato"

    id: Mapped[uuid.UUID] = uuid_pk()
    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str | None] = mapped_column(Text)
    cargo: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    telefone: Mapped[str | None] = mapped_column(Text)
    departamento: Mapped[str | None] = mapped_column(Text)
    disciplina: Mapped[str | None] = mapped_column(Text)

    empresa: Mapped[Empresa] = relationship(back_populates="contatos")


class Usuario(OrgMixin, TimestampMixin, Base):
    __tablename__ = "usuario"
    __table_args__ = (UniqueConstraint("org_id", "login", name="uq_usuario_org_login"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    login: Mapped[str] = mapped_column(Text, nullable=False)   # e-mail
    nome: Mapped[str | None] = mapped_column(Text)
    # Argon2. Nulo quando o usuário só entra por SSO.
    senha_hash: Mapped[str | None] = mapped_column(Text)
    # Identificador estável no provedor OIDC (o `sub` do token).
    oidc_sub: Mapped[str | None] = mapped_column(Text, index=True)
    papel: Mapped[PapelUsuario] = mapped_column(
        pg_enum(PapelUsuario, "papel_usuario"), nullable=False
    )
    empresa_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'ativo'"))
    permissoes: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )
    idioma: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pt'"))

    empresa: Mapped[Empresa | None] = relationship()


class Standard(OrgMixin, TimestampMixin, Base):
    """Padrão de referência que um critério consulta.

    tipo ∈ nomenclatura | conjunto_esperado | vocabulario | mapeamento.
    Generaliza o antigo "dicionário IFC".
    """

    __tablename__ = "standard"

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    referencia: Mapped[str | None] = mapped_column(Text)
    conteudo: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    referencia_url: Mapped[str | None] = mapped_column(Text)


class NomenclaturaPadrao(OrgMixin, TimestampMixin, Base):
    """Padrão validável por segmentos: PROJETO-MACRO-DISC-SUB-SETOR-SW.

    `segmentos` = [{"k": "PROJETO", "vals": ["CPQ11"]},
                   {"k": "MACRO",   "vals": ["A","C","M","S"]}, ...]
    Lista `vals` vazia = segmento livre (só precisa existir).
    """

    __tablename__ = "nomenclatura_padrao"

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    segmentos: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    vigente: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))


class Disciplina(OrgMixin, TimestampMixin, Base):
    """O elo: projetista + checklists aplicáveis + nomenclatura + áreas."""

    __tablename__ = "disciplina"
    __table_args__ = (
        UniqueConstraint("projeto_id", "codigo", name="uq_disciplina_projeto_codigo"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    codigo: Mapped[str] = mapped_column(Text, nullable=False)        # 'STRC-STEEL'
    macro: Mapped[MacroDisc] = mapped_column(pg_enum(MacroDisc, "macro_disc"), nullable=False)
    disc: Mapped[str] = mapped_column(Text, nullable=False)          # 'STRC'
    sub: Mapped[str] = mapped_column(Text, nullable=False)           # 'STEEL' | 'NONE'
    projetista_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("empresa.id", ondelete="SET NULL")
    )
    checklists: Mapped[list[ChecklistTipo]] = mapped_column(
        ARRAY(pg_enum(ChecklistTipo, "checklist_tipo")),
        nullable=False,
        server_default=text("'{}'"),
    )
    nomenclatura_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("standard.id", ondelete="SET NULL")
    )
    # Setores do projeto (ADMIN, COLO1..5, SITE, UTLS...). Escopo do LOD 500.
    areas: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )

    projeto: Mapped[Projeto] = relationship(back_populates="disciplinas")
    projetista: Mapped[Empresa | None] = relationship()


class ProjetoMembro(OrgMixin, TimestampMixin, Base):
    """Quem participa de um projeto, e com que papel NELE.

    Até a migration 0004 não existia vínculo nenhum entre usuário e projeto: o
    usuário pertencia à organização e, opcionalmente, a uma empresa. Isso
    respondia "quem tem conta" mas não "quem está no CPQ11" — e a segunda é a
    pergunta de quem coordena, porque a mesma pessoa é auditora num projeto e
    só leitora noutro.

    O QUE ESTA TABELA AINDA NÃO FAZ, e é deliberado: ela NÃO autoriza. Toda
    rota da API continua decidindo por `requer_permissao`, que lê as permissões
    de organização do token. Um membro registrado aqui não ganha acesso, e um
    não-membro não perde — o que ela dá é a lista de quem trabalha no projeto e
    o papel combinado com cada um.

    Fazer o contrário exigiria que toda consulta de todo endpoint passasse a
    checar participação, mudança que atinge as 72 rotas e o RLS junto. Com esta
    tabela no lugar, essa mudança passa a ser possível; sem ela, nem isso.
    """

    __tablename__ = "projeto_membro"
    __table_args__ = (
        # Uma linha por pessoa por projeto. Sem isto, "adicionar" duas vezes
        # criaria dois vínculos com papéis diferentes e nada diria qual vale.
        UniqueConstraint("projeto_id", "usuario_id", name="uq_membro_projeto_usuario"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projeto.id", ondelete="CASCADE"), nullable=False
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("usuario.id", ondelete="CASCADE"), nullable=False
    )
    # O MESMO enum do papel de organização, e não um novo: um segundo
    # vocabulário obrigaria a manter um mapa entre os dois, e o mapa
    # divergiria. 'coordenador' significa a mesma coisa nos dois lugares — o
    # que muda é o alcance.
    papel: Mapped[PapelUsuario] = mapped_column(
        pg_enum(PapelUsuario, "papel_usuario"), nullable=False
    )
    # Por que esta pessoa está no projeto: 'coordenação de estruturas',
    # 'auditoria 4D'. Texto livre porque é combinado de contrato, não enum.
    funcao: Mapped[str | None] = mapped_column(Text)

    projeto: Mapped[Projeto] = relationship()
    usuario: Mapped[Usuario] = relationship()
