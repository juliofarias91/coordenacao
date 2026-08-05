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
    equipe: str | None = Field(
        default=None,
        max_length=80,
        description="COORDENAÇÃO, INOVAÇÃO, COMERCIAL. Texto livre: o conjunto ainda não é fixo.",
    )


class MembroUpdate(BaseModel):
    model_config = ESCRITA

    # `usuario_id` NÃO é atualizável de propósito: trocar a pessoa de um vínculo
    # existente é remover um membro e acrescentar outro, e fazê-lo por PATCH
    # deixaria a trilha dizendo "alterou" onde houve duas coisas distintas.
    papel: PapelUsuario | None = None
    funcao: str | None = Field(default=None, max_length=200)
    equipe: str | None = Field(default=None, max_length=80)


class MembroOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    usuario_id: uuid.UUID
    papel: PapelUsuario
    funcao: str | None
    equipe: str | None

    # Derivados do relacionamento: a tela lista pessoas, não ids. Resolver no
    # servidor evita que o cliente cruze duas listas para escrever um nome —
    # e evita uma consulta por linha, que é o que ele acabaria fazendo.
    usuario_nome: str | None = None
    usuario_login: str | None = None
    # A EMPRESA e o STATUS da pessoa, que a tela mostra em colunas próprias.
    # Vêm de `usuario`, não do vínculo: a empresa é de quem a pessoa é, e o
    # status (ativo / pendente) é da CONTA — alguém convidado e que ainda não
    # definiu senha aparece na lista do projeto como pendente, que é a
    # informação que quem coordena precisa para saber por que a pessoa não
    # apareceu.
    empresa_nome: str | None = None
    usuario_status: str | None = None
    # O PROJETO, para a lista global. Numa lista de um projeto só isto é
    # redundante; em "Todos os membros" é a coluna que diz de onde a linha vem.
    projeto_codigo: str | None = None
    projeto_nome: str | None = None
    # O papel na ORGANIZAÇÃO, ao lado do papel no projeto. Os dois juntos
    # respondem a pergunta que interessa: alguém pode ser coordenador aqui e
    # leitor na organização, e é a permissão de organização que hoje decide o
    # que a pessoa consegue fazer de fato.
    usuario_papel_org: PapelUsuario | None = None
