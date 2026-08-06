"""Contratos de entrada/saída da autenticação."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import PapelUsuario
from app.schemas.usuario import validar_senha


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


class CadastroRequest(BaseModel):
    """Criar a própria conta — o cadastro por CÓDIGO DA ORGANIZAÇÃO.

    `org` NÃO É OPCIONAL AQUI, ao contrário do login, e é a diferença que define
    este recurso. No login o e-mail já existe em algum tenant e a senha desempata
    qual; no cadastro não existe em nenhum, e não há o que desempatar — sem o
    código, a conta teria de nascer numa organização escolhida pelo servidor.
    Toda entidade da plataforma carrega `org_id`, e adivinhá-lo é como se cria
    uma conta no tenant errado.

    Ele NÃO CRIA ORGANIZAÇÃO: quem se cadastra entra numa que já existe. Criar
    tenant continua sendo provisionamento, e continua saindo do seed — ver a
    docstring de `api/v1/organizacao.py`.
    """

    nome: str | None = Field(default=None, max_length=200)
    login: EmailStr = Field(description="E-mail, que é o login")
    senha: str = Field(max_length=200)
    org: str = Field(
        min_length=1,
        max_length=60,
        description="Código (slug) da organização que autoriza o cadastro aberto.",
    )

    @field_validator("senha")
    @classmethod
    def senha_forte(cls, v: str) -> str:
        return validar_senha(v)


class ConfigPublicaOut(BaseModel):
    """O que a tela de entrada precisa saber ANTES de haver sessão.

    Existe para o botão do Google não ser desenhado quando não há provedor
    configurado: um botão que só pode responder 501 é pior do que botão nenhum —
    ele promete um caminho de entrada que não existe, e quem o tenta conclui que
    a plataforma está fora do ar.

    Não diz QUAL organização aceita cadastro: isso depende do código, e a tela
    só descobre ao enviá-lo. Responder aqui transformaria a rota pública numa
    lista de tenants.
    """

    sso: bool = Field(description="Há provedor OIDC configurado e ligado")
    sso_rotulo: str = Field(description="Nome do provedor, para o rótulo do botão")
    senha_minima: int


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
    senha: str = Field(max_length=200)

    @field_validator("senha")
    @classmethod
    def senha_forte(cls, v: str) -> str:
        return validar_senha(v)


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
