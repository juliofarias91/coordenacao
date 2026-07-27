"""Router raiz da v1.

Fase 0: health e auth.
Fase 1: cadastro — projeto, empresas, usuários, standards, disciplinas e a
biblioteca de critérios.
Fase 2: modelos e versões, ingestão do ACC, execução da auditoria, views
derivadas (painel/matriz) e exports.
Fase 3: automação — validação de nomenclatura, penalidades e a auditoria
automatizada de parâmetros.
Fase 4: notificações, KPIs, placar de conformidade, apontamentos, portal do
cliente e a trilha de auditoria.
"""

from fastapi import APIRouter

from app.api.v1 import (
    apontamentos,
    auditorias,
    auth,
    automacao,
    criterios,
    disciplinas,
    empresas,
    exports,
    health,
    ingest,
    kpis,
    modelos,
    notificacoes,
    painel,
    portal,
    projetos,
    standards,
    trilha,
    usuarios,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)

# Fase 1 — cadastro
api_router.include_router(projetos.router)
api_router.include_router(empresas.router)
api_router.include_router(usuarios.router)
api_router.include_router(standards.router)
api_router.include_router(disciplinas.router)
api_router.include_router(criterios.router)

# Fase 2 — execução
api_router.include_router(modelos.router)
api_router.include_router(ingest.router)
api_router.include_router(auditorias.router)
api_router.include_router(painel.router)
api_router.include_router(exports.router)

# Fase 3 — automação
api_router.include_router(automacao.router)

# Fase 4 — colaboração e visão executiva
api_router.include_router(notificacoes.router)
api_router.include_router(kpis.router)
api_router.include_router(apontamentos.router)
api_router.include_router(portal.router)
api_router.include_router(trilha.router)
