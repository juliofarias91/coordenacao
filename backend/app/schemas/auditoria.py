"""SP-203/204/205 · Execução da auditoria, não-conformidades e publicação."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import AuditoriaEstado, ChecklistTipo, CheckStatus, OrigemResult
from app.schemas.comum import ESCRITA, Identificado
from app.schemas.criterio import CriterioOut

STATUS_NC = ("aberto", "em_analise", "resolvido")


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
    publicado_em: datetime | None


class AuditoriaDetalhe(AuditoriaOut):
    resultados: list[ResultadoOut] = Field(default_factory=list)
    pendentes: int = Field(default=0, description="Itens ainda em `pendente`.")


class AbrirAuditoria(BaseModel):
    model_config = ESCRITA

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
