"""SP-103 · Usuários e permissões finas."""

from __future__ import annotations

import re
import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.enums import (
    PAGINAS_OCULTAVEIS,
    PERMISSOES,
    PREFIXO_PAGINA,
    PapelUsuario,
)
from app.schemas.comum import ESCRITA, Identificado

SENHA_MINIMA = 10

# A COMPOSIÇÃO, ao lado do comprimento (05/08/2026). O mínimo de 10 continua o
# que era; o que entrou foi exigir letra, número e caractere especial — as
# quatro linhas do checklist que a tela de cadastro mostra enquanto se digita.
#
# `[^\W\d_]` é "letra" com unicode ligado: `[a-z]` recusaria uma senha em que a
# única letra fosse acentuada, e quem escolhe senha em português escolhe.
# Especial é o complemento — não-alfanumérico, com o `_` incluído à força
# porque `\w` o considera palavra.
_LETRA = re.compile(r"[^\W\d_]", re.UNICODE)
_NUMERO = re.compile(r"\d")
_ESPECIAL = re.compile(r"[\W_]", re.UNICODE)


def validar_senha(valor: str) -> str:
    """A regra inteira, num lugar só — e ela DIZ TUDO O QUE FALTA de uma vez.

    Levantar no primeiro problema faria quem digitou `abcdefghij` descobrir que
    falta número, acrescentar um, e só então descobrir que falta especial. A
    tela já mostra o checklist ao vivo; esta é a rede de baixo, para quem chama
    a API direto.

    ⚠ VALE NA ESCRITA, NUNCA NA LEITURA. Nenhuma senha já gravada é reconferida
    — quem tem uma de antes desta regra continua entrando com ela, e só esbarra
    aqui no dia em que for trocá-la. Conferir no login trancaria contas legítimas
    numa tela que não tem como explicar o que houve.
    """
    faltando: list[str] = []
    if len(valor) < SENHA_MINIMA:
        faltando.append(f"pelo menos {SENHA_MINIMA} caracteres")
    if not _LETRA.search(valor):
        faltando.append("uma letra")
    if not _NUMERO.search(valor):
        faltando.append("um número")
    if not _ESPECIAL.search(valor):
        faltando.append("um caractere especial")
    if faltando:
        raise ValueError("a senha precisa de " + ", ".join(faltando))
    return valor


def _validar_permissoes(valor: list[str]) -> list[str]:
    """Permissões reais OU telas ocultas (`oculta:<rota>`), na mesma lista.

    OS DOIS VOCABULÁRIOS DIVIDEM A COLUNA, e o prefixo é o que os separa — ver
    `PREFIXO_PAGINA`, em `models/enums.py`, para por que a tela oculta mora aqui
    (a coluna já existe; o recurso não podia pedir migration) e por que ela nunca
    chega ao token.

    A ROTA É CONFERIDA CONTRA A LISTA. Guardada solta, uma rota inexistente
    ficaria no banco para sempre: a gaveta desenha só as telas que conhece, então
    ela não apareceria em interruptor nenhum para ser desligada.
    """
    reais = {p for p in valor if not p.startswith(PREFIXO_PAGINA)}
    desconhecidas = sorted(reais - set(PERMISSOES))
    if desconhecidas:
        raise ValueError(
            f"permissão desconhecida: {', '.join(desconhecidas)}. "
            f"Válidas: {', '.join(PERMISSOES)}"
        )

    rotas = {p.removeprefix(PREFIXO_PAGINA) for p in valor if p.startswith(PREFIXO_PAGINA)}
    fora = sorted(rotas - set(PAGINAS_OCULTAVEIS))
    if fora:
        raise ValueError(f"página desconhecida: {', '.join(fora)}")

    # DEVOLVE COMO VEIO. Cheguei a ordenar aqui — o valor é conjunto, e ordenar
    # evitaria a trilha registrar alteração numa gravação que só reordenasse a
    # mesma lista. Mas `test_criar_usuario_nao_devolve_hash_de_senha` fixa que
    # as permissões voltam na ordem em que foram enviadas, e normalizar isso é
    # decisão à parte: não é o que este recurso precisa, e mudar de carona o
    # comportamento de um campo que já existia é como se quebra o que funciona.
    return valor


class UsuarioCreate(BaseModel):
    model_config = ESCRITA

    login: EmailStr
    nome: str | None = Field(default=None, max_length=200)
    senha: str | None = Field(
        default=None,
        max_length=200,
        description=(
            f"Mínimo {SENHA_MINIMA} caracteres, com letra, número e caractere "
            "especial. Omita para um usuário que só entra por SSO."
        ),
    )
    papel: PapelUsuario
    empresa_id: uuid.UUID | None = None
    permissoes: list[str] = Field(
        default_factory=list,
        description="Vazio = usa o conjunto padrão do papel.",
    )
    idioma: str = Field(default="pt", pattern=r"^(pt|en)$")
    status: str = Field(default="ativo", pattern=r"^(ativo|inativo)$")

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v: list[str]) -> list[str]:
        return _validar_permissoes(v)

    @field_validator("senha")
    @classmethod
    def senha_forte(cls, v: str | None) -> str | None:
        # `None` PASSA, e é o ponto: usuário só de SSO não tem senha, e exigir
        # composição de um campo ausente barraria justamente quem o omite de
        # propósito. O que não passa é senha fraca escrita de fato.
        return None if v is None else validar_senha(v)


class UsuarioUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, max_length=200)
    papel: PapelUsuario | None = None
    empresa_id: uuid.UUID | None = None
    permissoes: list[str] | None = None
    idioma: str | None = Field(default=None, pattern=r"^(pt|en)$")
    status: str | None = Field(default=None, pattern=r"^(ativo|inativo)$")

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _validar_permissoes(v)


class PaginasUpdate(BaseModel):
    """As telas escondidas de uma conta, SEM o prefixo — corpo de
    `PUT /usuarios/{id}/paginas`.

    Só as telas: as permissões reais nunca saem do servidor nem voltam por aqui.
    A rota funde as duas metades da coluna; ver a docstring dela.
    """

    model_config = ESCRITA

    paginas: list[str] = Field(default_factory=list)

    @field_validator("paginas")
    @classmethod
    def rotas_validas(cls, v: list[str]) -> list[str]:
        fora = sorted(set(v) - set(PAGINAS_OCULTAVEIS))
        if fora:
            raise ValueError(f"página desconhecida: {', '.join(fora)}")
        # Sem repetição: é conjunto, e aqui não há contrato de ordem para
        # preservar (diferente de `permissoes` — ver `_validar_permissoes`).
        return sorted(set(v))


class SenhaUpdate(BaseModel):
    model_config = ESCRITA

    senha: str = Field(max_length=200)

    @field_validator("senha")
    @classmethod
    def senha_forte(cls, v: str) -> str:
        return validar_senha(v)


class UsuarioOut(Identificado):
    org_id: uuid.UUID
    login: str
    nome: str | None
    papel: PapelUsuario
    empresa_id: uuid.UUID | None
    permissoes: list[str]
    idioma: str
    status: str
    # AS TELAS QUE ESTA CONTA NÃO VÊ, sem o prefixo. Campo próprio, e não uma
    # fatia de `permissoes`, porque são duas perguntas diferentes: "o que ela
    # pode fazer" e "o que ela enxerga no menu". Quem consome são a gaveta de
    # usuário (para desenhar os interruptores) e a barra lateral, pelo
    # `/auth/me`.
    paginas_ocultas: list[str] = []
    # Nunca sai daqui: senha_hash e oidc_sub.

    @model_validator(mode="after")
    def _separar_paginas(self) -> UsuarioOut:
        """Desmembra a coluna nas duas listas, para TODA rota que devolve um
        usuário — em vez de cada uma lembrar de fazer isso.

        Sem isto, `permissoes` chegaria à tela com `oculta:peb` dentro e o
        `Chips` de permissões desenharia uma etiqueta que não é permissão.
        """
        if any(p.startswith(PREFIXO_PAGINA) for p in self.permissoes):
            self.paginas_ocultas = sorted(
                p.removeprefix(PREFIXO_PAGINA)
                for p in self.permissoes
                if p.startswith(PREFIXO_PAGINA)
            )
            self.permissoes = [p for p in self.permissoes if not p.startswith(PREFIXO_PAGINA)]
        return self


class PermissaoOut(BaseModel):
    codigo: str
    papeis_padrao: list[PapelUsuario]
