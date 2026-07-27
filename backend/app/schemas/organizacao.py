"""SP-106 · A organização — o tenant visto de dentro.

Só existe uma organização por token: a do usuário autenticado. Não há rota de
listagem porque listar organizações é justamente o que o isolamento
multi-tenant existe para impedir.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.comum import ESCRITA, Identificado


class OrganizacaoUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(
        default=None,
        min_length=1,
        max_length=60,
        pattern=r"^[a-z0-9][a-z0-9-]*$",
        description="Identificador curto em minúsculas — entra no login multi-org.",
    )


class OrganizacaoOut(Identificado):
    nome: str
    slug: str | None


class ResumoOrganizacao(BaseModel):
    """O que a aba administrativa mostra de cara.

    As contagens vêm juntas de propósito: quatro requisições para montar um
    cabeçalho é latência que o admin sente a cada abertura da tela.
    """

    model_config = ESCRITA

    organizacao: OrganizacaoOut
    projetos: int
    usuarios: int
    usuarios_ativos: int
    empresas: int
