"""SP-101 · Projeto e cliente."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, computed_field

from app.schemas.comum import ESCRITA, Identificado

STATUS_PROJETO = ("config", "ativo", "piloto", "encerrado")


class ProjetoBase(BaseModel):
    model_config = ESCRITA

    nome: str = Field(min_length=1, max_length=200)
    # Desde a migration 0003 o cliente é entidade, e o projeto aponta para ela.
    # Antes era texto livre aqui, o que criava um cliente novo a cada digitação
    # diferente e não tinha onde guardar contato e e-mail.
    cliente_id: uuid.UUID | None = None
    coordenacao: str | None = Field(default=None, max_length=200)
    bep_ref: str | None = Field(
        default=None,
        max_length=200,
        description="Documento normativo vigente (ex.: 'A5.3.2 · Construction BEP')",
    )


class ProjetoCreate(ProjetoBase):
    codigo: str = Field(
        min_length=1,
        max_length=40,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Único na organização (ex.: 'CPQ11'). É o 1º segmento da nomenclatura.",
    )
    status: str = Field(default="config", pattern=r"^(config|ativo|piloto|encerrado)$")


class ProjetoUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    cliente_id: uuid.UUID | None = None
    coordenacao: str | None = Field(default=None, max_length=200)
    bep_ref: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, pattern=r"^(config|ativo|piloto|encerrado)$")


class ProjetoOut(Identificado):
    org_id: uuid.UUID
    codigo: str
    nome: str
    cliente_id: uuid.UUID | None
    coordenacao: str | None
    bep_ref: str | None
    status: str

    # Excluído da serialização: é o objeto do relacionamento, e quem lê a API
    # quer o nome, não o registro inteiro aninhado em toda listagem.
    cliente: object | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cliente_nome(self) -> str | None:
        """Nome do cliente, resolvido pelo relacionamento.

        Existe para a tabela de projetos não precisar de uma consulta por linha
        só para mostrar de quem é o projeto. É derivado — quem escreve manda
        `cliente_id`.
        """
        return getattr(self.cliente, "nome", None)
