"""Automação das auditorias — Fase 3.

Três níveis de custo (plano técnico, seção 6). O piloto ataca os dois mais
baratos:

- **Nível 0** — `nomenclatura`: regex/segmentação, sem tocar no modelo. Custo
  zero, ganho imediato.
- **Nível 1** — `ifc` (IfcOpenShell, in-house, sem custo de token) e `revit`
  (APS Model Derivative, ~0,5 token Flex por job).
- **Nível 2** — Design Automation for Revit: fora do piloto.

O `executor` amarra tudo: dado uma versão, descobre quais critérios do
checklist são automatizáveis, roda o verificador certo e grava
`resultado_check` + `ocorrencia`.
"""

from app.services.automacao.executor import (
    Achado,
    executar_auditoria_automatica,
    verificadores_disponiveis,
)

__all__ = ["Achado", "executar_auditoria_automatica", "verificadores_disponiveis"]
