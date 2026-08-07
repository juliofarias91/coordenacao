"""SP-101 · Projeto e cliente."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, computed_field, field_validator

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
    # --- ficha cadastral (migration 0011) ---------------------------------
    descricao: str | None = Field(default=None, max_length=4000)
    endereco: str | None = Field(default=None, max_length=400)
    data_inicio: date | None = None
    data_prevista: date | None = Field(
        default=None, description="Previsão de conclusão — muda ao longo do contrato"
    )
    data_conclusao: date | None = Field(
        default=None, description="Conclusão de fato — acontece uma vez"
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
    descricao: str | None = Field(default=None, max_length=4000)
    endereco: str | None = Field(default=None, max_length=400)
    data_inicio: date | None = None
    data_prevista: date | None = None
    data_conclusao: date | None = None


class ProjetoOut(Identificado):
    org_id: uuid.UUID
    codigo: str
    nome: str
    cliente_id: uuid.UUID | None
    coordenacao: str | None
    bep_ref: str | None
    status: str
    descricao: str | None
    endereco: str | None
    data_inicio: date | None
    data_prevista: date | None
    data_conclusao: date | None
    # SÓ DE LEITURA AQUI, e é a decisão central da 0019. `ProjetoUpdate` NÃO tem
    # `areas`: um PATCH manda a lista inteira, e da lista inteira não se deduz o
    # ATO — trocar 'COLO1' por 'TORRE 1' chega igual a apagar uma e criar outra,
    # e as duas coisas fazem coisas opostas com as auditorias que já existem na
    # área. Quem escreve são as rotas `/projetos/{id}/areas`, que nomeiam o ato.
    areas: list[str]

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


# ------------------------------------------------------------------ áreas
#
# O NOME É A IDENTIDADE (migration 0019): é ele que está em `disciplina.areas` e
# em `auditoria.area`. Daí o padrão ser restritivo — o nome vira coluna da matriz
# e segmento de conversa ("a auditoria da COLO2"), e um nome com vírgula
# atravessaria o `join(', ')` que a tabela de disciplinas usa para listá-las.
NOME_AREA = r"^[A-Za-z0-9][A-Za-z0-9 ._-]*$"


def normalizar_area(nome: str) -> str:
    """Espaços das pontas fora e os do meio colapsados.

    'COLO 1' e 'COLO  1' são o mesmo setor escrito duas vezes, e o segundo só se
    distingue do primeiro contando espaços na tela. Mora aqui, e não no serviço,
    porque roda ANTES do `pattern` — que exige começar por letra ou dígito e
    recusaria um nome colado de outro lugar com espaço na frente. Quem compara
    nomes (`services/areas.py`) importa esta.
    """
    return " ".join(nome.split())


class AreaEscrita(BaseModel):
    model_config = ESCRITA

    nome: str = Field(
        min_length=1,
        max_length=40,
        pattern=NOME_AREA,
        description="O setor da obra: ADMIN, COLO1, SITE, UTLS…",
    )

    @field_validator("nome", mode="before")
    @classmethod
    def _normalizar(cls, v: object) -> object:
        return normalizar_area(v) if isinstance(v, str) else v


class AreaOut(BaseModel):
    """Uma área e O QUE DEPENDE DELA.

    Os dois contadores existem para a tela poder avisar ANTES do clique. Sem
    eles, remover uma área é um botão que às vezes some com a coluna da matriz e
    às vezes devolve um 409 — e quem coordena não tem como saber qual dos dois
    antes de tentar.
    """

    nome: str
    disciplinas: int = Field(description="Quantas disciplinas declaram auditar esta área.")
    auditorias: int = Field(description="Quantas auditorias já existem nela. > 0 impede remover.")
