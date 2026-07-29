"""Membro de projeto — quem participa, e com que papel nele (migration 0004)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.models.enums import PapelUsuario
from app.schemas.comum import ESCRITA, Identificado


class MembroCreate(BaseModel):
    model_config = ESCRITA

    usuario_id: uuid.UUID
    papel: PapelUsuario
    funcao: str | None = Field(default=None, max_length=200)


class MembroUpdate(BaseModel):
    model_config = ESCRITA

    # `usuario_id` NÃO é atualizável de propósito: trocar a pessoa de um vínculo
    # existente é remover um membro e acrescentar outro, e fazê-lo por PATCH
    # deixaria a trilha dizendo "alterou" onde houve duas coisas distintas.
    papel: PapelUsuario | None = None
    funcao: str | None = Field(default=None, max_length=200)


class MembroOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    usuario_id: uuid.UUID
    papel: PapelUsuario
    funcao: str | None

    # Derivados do relacionamento: a tela lista pessoas, não ids. Resolver no
    # servidor evita que o cliente cruze duas listas para escrever um nome —
    # e evita uma consulta por linha, que é o que ele acabaria fazendo.
    usuario_nome: str | None = None
    usuario_login: str | None = None
    # O papel na ORGANIZAÇÃO, ao lado do papel no projeto. Os dois juntos
    # respondem a pergunta que interessa: alguém pode ser coordenador aqui e
    # leitor na organização, e é a permissão de organização que hoje decide o
    # que a pessoa consegue fazer de fato.
    usuario_papel_org: PapelUsuario | None = None
