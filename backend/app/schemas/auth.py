"""Contratos de entrada/saída da autenticação."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PapelUsuario
from app.schemas.usuario import SENHA_MINIMA


class LoginRequest(BaseModel):
    login: str = Field(description="E-mail do usuário")
    senha: str
    org: str | None = Field(
        default=None,
        description=(
            "Slug da organização. Opcional enquanto houver um único tenant; "
            "obrigatório quando o mesmo e-mail existir em mais de uma organização."
        ),
    )


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Validade do access token, em segundos")


class UsuarioOut(BaseModel):
    """O usuário DA SESSÃO — a projeção que o login e o `/auth/me` devolvem.

    É outra classe que a `UsuarioOut` de `schemas/usuario.py`, que é a do
    CADASTRO e traz `status`. Duas projeções do mesmo registro para dois
    consumidores: aqui quem lê é a aplicação que acabou de entrar; lá, a tela de
    contas. Quem acrescentar campo precisa decidir em qual das duas ele entra —
    e `paginas_ocultas` entra nas DUAS, por motivos diferentes: aqui a barra
    lateral precisa saber o que não desenhar, lá a gaveta precisa preencher os
    interruptores.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    login: str
    nome: str | None
    papel: PapelUsuario
    empresa_id: uuid.UUID | None
    permissoes: list[str]
    # AS TELAS QUE ESTA CONTA NÃO VÊ, sem o prefixo. Elas viajam dentro de
    # `usuario.permissoes` no banco (`oculta:<rota>`, ver `models/enums.py`) e
    # são separadas na saída — `permissoes`, acima, já chega limpo e resolvido.
    #
    # NÃO É PERMISSÃO: esconde item de menu. Quem barra a API é o
    # `requer_permissao` sobre `permissoes`.
    paginas_ocultas: list[str] = []
    idioma: str


class SessaoOut(BaseModel):
    """Resposta do login: tokens + o usuário, para o front não fazer duas chamadas."""

    tokens: TokenPair
    usuario: UsuarioOut


class OidcAuthorizeOut(BaseModel):
    authorization_url: str
    state: str


# ------------------------------------------------------------------ senha
class EsqueciSenhaRequest(BaseModel):
    login: str = Field(description="E-mail da conta")
    org: str | None = Field(
        default=None, description="Slug, quando o mesmo e-mail existir em várias organizações"
    )


class RedefinirSenhaRequest(BaseModel):
    token: str
    senha: str = Field(min_length=SENHA_MINIMA, max_length=200)


class ConviteSenhaOut(BaseModel):
    """O que se sabe sobre um token, para a tela pública se apresentar.

    Devolver o login de um token válido não vaza nada: o token É a credencial, e
    quem o tem já poderia trocar a senha. O que a tela ganha é poder dizer "olá,
    fulano" em vez de pedir senha nova sem dizer para qual conta.
    """

    login: str
    nome: str | None
    tipo: str = Field(description="convite | redefinicao")
    organizacao: str
    expira_em: datetime
    senha_minima: int = Field(description="Mínimo de caracteres exigido pelo servidor")


class ConviteCriadoOut(BaseModel):
    """A resposta de quem GERA o link. O token só aparece aqui, uma vez."""

    token: str
    caminho: str = Field(description="Caminho da tela pública, ex.: /definir-senha/<token>")
    tipo: str
    expira_em: datetime
    usuario_id: uuid.UUID
