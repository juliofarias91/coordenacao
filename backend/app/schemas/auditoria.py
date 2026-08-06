"""SP-203/204/205 · Execução da auditoria, não-conformidades e publicação."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import (
    AuditoriaEstado,
    ChecklistTipo,
    CheckStatus,
    MacroDisc,
    OrigemResult,
)
from app.schemas.comum import ESCRITA, Identificado
from app.schemas.criterio import CriterioOut

STATUS_NC = ("aberto", "em_analise", "resolvido")

# O vocabulário de `auditoria.andamento` e `auditoria.prioridade` (migration
# 0013). Tuplas e não enums do Postgres, pela razão que está na migration: são
# vocabulário de PROCESSO, e o processo de auditoria em obra muda mais do que o
# schema. Quem valida são estes `Literal`s — a validação vive na borda, que é
# onde dá para afrouxá-la sem um `ALTER TYPE`.
ANDAMENTOS = ("a_fazer", "em_andamento", "concluida", "bloqueada")
PRIORIDADES = ("alta", "media", "baixa")

Andamento = Literal["a_fazer", "em_andamento", "concluida", "bloqueada"]
Prioridade = Literal["alta", "media", "baixa"]


class OcorrenciaOut(Identificado):
    resultado_id: uuid.UUID
    element_id: str
    detalhe: str | None


class EvidenciaOut(Identificado):
    resultado_id: uuid.UUID
    arquivo_url: str
    legenda: str | None


class ResultadoUpdate(BaseModel):
    model_config = ESCRITA

    status: CheckStatus | None = None
    comentario: str | None = Field(
        default=None, description="O DIAGNÓSTICO — coluna COMENTARY da planilha."
    )
    direcao: str | None = Field(
        default=None,
        description=(
            "A ORIENTAÇÃO ao fornecedor — coluna DIRECTION da planilha. "
            "É o que a não-conformidade herda como `recomendacao`."
        ),
    )
    parametro_revit: str | None = Field(
        default=None,
        description=(
            "REVIT PARAMETER da planilha de LOD: o built-in em que a informação "
            "FOI encontrada. Onde ela deveria estar é `criterio.parametro_esperado`."
        ),
    )
    parametro_encontrado: str | None = Field(
        default=None, description="PARAMETER da planilha de LOD: o parâmetro NÃO nativo usado."
    )
    comentario_fornecedor: str | None = Field(
        default=None,
        description=(
            "SUPPLIERS COMMENTS. Autor diferente do de `comentario`, que é da "
            "coordenação — é por isso que são dois campos."
        ),
    )
    itens_analisados: int | None = Field(default=None, ge=0)
    itens_ok: int | None = Field(default=None, ge=0)
    elementos: list[str] | None = Field(
        default=None,
        description=(
            "IDs dos elementos reprovados. Substitui a lista inteira. "
            "Na Fase 3 quem preenche isto é o worker de auditoria automatizada."
        ),
    )


class ResultadoOut(Identificado):
    org_id: uuid.UUID
    auditoria_id: uuid.UUID
    criterio_id: uuid.UUID
    status: CheckStatus
    origem: OrigemResult
    comentario: str | None
    direcao: str | None
    parametro_revit: str | None
    parametro_encontrado: str | None
    comentario_fornecedor: str | None
    itens_analisados: int | None
    itens_ok: int | None
    # A coluna LOD da planilha de espec. ELA NÃO É DO RESULTADO nem do critério:
    # mora em `checklist_item.min_lod`, porque o MESMO critério pode ser exigido
    # em LOD diferente conforme o checklist — é para isso que a tabela de junção
    # existe (ver `models/criterios.py`). Vem preenchida no detalhe da auditoria,
    # que é quem faz o join; no PATCH de uma célula ela volta nula, e não faz
    # falta: a tela recarrega o detalhe inteiro depois de gravar, e é de lá que a
    # grade se redesenha (ver `salvar`, em `components/planilha.tsx`).
    min_lod: str | None = None
    criterio: CriterioOut
    ocorrencias: list[OcorrenciaOut] = Field(default_factory=list)
    evidencias: list[EvidenciaOut] = Field(default_factory=list)


class AuditoriaOut(Identificado):
    org_id: uuid.UUID
    versao_id: uuid.UUID
    checklist: ChecklistTipo
    area: str | None
    round: int | None
    estado: AuditoriaEstado
    aprovacao_pct: Decimal | None
    auditor_id: uuid.UUID | None
    revisado_por: uuid.UUID | None
    data_inicio: datetime | None
    data_fim: datetime | None
    # `entrega_estimada` existia na tabela desde a 0001 e NUNCA foi exposta: a
    # data planejada estava no banco e não chegava a tela nenhuma.
    entrega_estimada: date | None
    publicado_em: datetime | None
    andamento: Andamento
    prioridade: Prioridade | None


class AuditoriaDetalhe(AuditoriaOut):
    resultados: list[ResultadoOut] = Field(default_factory=list)
    pendentes: int = Field(default=0, description="Itens ainda em `pendente`.")


class AuditoriaDaLista(AuditoriaOut):
    """Uma auditoria com o MODELO resolvido, para a lista de um projeto.

    O painel da tela de auditoria agrupa por checklist e mostra, dentro de cada
    tipo, os modelos auditados. Com só `versao_id` ele teria de buscar cada
    versão e cada modelo para escrever um nome na tela — N+1 requisições para
    montar uma barra lateral.
    """

    modelo_id: uuid.UUID | None = None
    modelo_codigo: str | None = None
    versao_rotulo: str | None = Field(
        default=None, description="A versão auditada, como o modelo a nomeia ('V3')."
    )
    auditor_nome: str | None = None
    # A DISCIPLINA DO MODELO, para o painel agrupar por ela dentro de cada
    # recorte. Nula quando o modelo ainda não tem disciplina — `disciplina_id` é
    # `SET NULL` e o modelo pode ser cadastrado antes de ela existir.
    disciplina_codigo: str | None = None
    disciplina_nome: str | None = None
    # A macro vem junto porque é dela que sai a COR do grupo, e a paleta é por
    # macrodisciplina — não por disciplina. Sem ela a tela teria de buscar a
    # disciplina só para descobrir a cor.
    disciplina_macro: MacroDisc | None = None
    # AS ÁREAS DA DISCIPLINA — ADMN, COLO1, SITE… —, que é o que o painel desenha
    # como abas nos recortes por área.
    #
    # DA DISCIPLINA, E NÃO DAS AUDITORIAS QUE EXISTEM, e essa é a diferença que
    # faz a fileira aparecer: derivadas das auditorias, as abas só existiriam
    # depois de alguém abrir uma em cada área — e não haveria por onde abrir a
    # primeira, porque é a aba que leva até ela. É o escopo declarado, não o
    # trabalho já feito.
    #
    # Vem no MESMO join que já traz código, nome e macro: nenhuma requisição a
    # mais para o painel.
    disciplina_areas: list[str] = []


class PlanoAuditoria(BaseModel):
    """O que se PLANEJA numa auditoria, separado do que se executa nela.

    Estes campos são o conteúdo da gaveta de nova auditoria: quem faz, para
    quando, em que ordem de urgência. Nenhum deles altera resultado — quem
    altera é `PATCH /resultados/{id}` — e é por isso que são um schema à parte,
    reusado pela criação e pela edição.

    `estado` NÃO está aqui, de propósito: ele é de publicação e quem o move é o
    fluxo de round. Ver a migration 0013.
    """

    model_config = ESCRITA

    auditor_id: uuid.UUID | None = Field(
        default=None, description="O responsável. `auditor_id` é o nome da coluna desde a 0001."
    )
    data_inicio: datetime | None = None
    data_fim: datetime | None = None
    entrega_estimada: date | None = Field(default=None, description="A data planejada.")
    andamento: Andamento | None = None
    prioridade: Prioridade | None = None


class AuditoriaUpdate(PlanoAuditoria):
    """PATCH do plano. Todos os campos opcionais: a tela grava campo por campo."""


class AbrirAuditoria(PlanoAuditoria):
    checklist: ChecklistTipo | None = Field(
        default=None,
        description="Omita para abrir todos os checklists definidos na disciplina.",
    )
    area: str | None = Field(
        default=None, description="Só nas auditorias de especificação (LOD 400/500)."
    )


# ---------------------------------------------------------- não-conformidade
class NaoConformidadeCreate(BaseModel):
    model_config = ESCRITA

    criterio_id: uuid.UUID | None = None
    resultado_id: uuid.UUID | None = None
    descricao: str | None = None
    recomendacao: str | None = Field(default=None, description="Passos de correção.")
    elementos: str | None = Field(default=None, description="IDs afetados.")
    responsavel_id: uuid.UUID | None = None
    prazo: date | None = None


class NaoConformidadeUpdate(BaseModel):
    model_config = ESCRITA

    descricao: str | None = None
    recomendacao: str | None = None
    elementos: str | None = None
    responsavel_id: uuid.UUID | None = None
    prazo: date | None = None
    status: str | None = Field(default=None, pattern=r"^(aberto|em_analise|resolvido)$")


class ComentarioOut(Identificado):
    nc_id: uuid.UUID
    usuario_id: uuid.UUID | None
    texto: str | None


class ComentarioCreate(BaseModel):
    model_config = ESCRITA

    texto: str = Field(min_length=1)


class NaoConformidadeOut(Identificado):
    org_id: uuid.UUID
    auditoria_id: uuid.UUID
    criterio_id: uuid.UUID | None
    resultado_id: uuid.UUID | None
    descricao: str | None
    recomendacao: str | None
    elementos: str | None
    responsavel_id: uuid.UUID | None
    prazo: date | None
    status: str
    comentarios: list[ComentarioOut] = Field(default_factory=list)
