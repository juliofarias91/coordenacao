"""SP-301 · Nível 0 — validação de nomenclatura.

Custo zero: não abre o modelo, só compara o nome do arquivo contra o padrão
por segmentos do projeto (`PROJETO-MACRO-DISC-SUB-SETOR-SW`). É a primeira
automação porque o ganho é imediato e visível.

Duas nuances do domínio que a implementação precisa respeitar:

- **O sufixo de software é opcional.** `R22`/`R24`/`RX3` codificam a origem,
  mas somem para outras ferramentas (Navisworks entrega
  `CPQ11-C-STRC-CONCR-A12`). Segmentos marcados como `opcional` podem faltar
  no fim do nome sem reprovar.
- **A extensão não faz parte do padrão.** `.ifc`/`.rvt` são descartados antes
  da comparação.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

EXTENSOES_CONHECIDAS = {".ifc", ".rvt", ".nwd", ".nwc", ".dwg", ".pdf"}


@dataclass
class SegmentoAvaliado:
    k: str
    valor: str
    ok: bool
    esperados: list[str] = field(default_factory=list)
    motivo: str | None = None


@dataclass
class Veredito:
    ok: bool
    nome: str
    segmentos: list[SegmentoAvaliado]
    mensagem: str

    @property
    def divergencias(self) -> list[SegmentoAvaliado]:
        return [s for s in self.segmentos if not s.ok]


def _limpar(nome: str) -> str:
    limpo = (nome or "").strip()
    sufixo = PurePosixPath(limpo).suffix.lower()
    if sufixo in EXTENSOES_CONHECIDAS:
        limpo = limpo[: -len(sufixo)]
    return limpo


def validar(nome: str, segmentos: list[dict[str, Any]]) -> Veredito:
    """Compara `nome` com o padrão e explica segmento a segmento.

    A resposta é sempre por segmento — dizer só "nome inválido" obrigaria o
    fornecedor a adivinhar onde errou, que é justamente o atrito que esta
    automação existe para remover.
    """
    limpo = _limpar(nome)
    partes = limpo.split("-") if limpo else []

    avaliados: list[SegmentoAvaliado] = []
    for i, definicao in enumerate(segmentos):
        rotulo = str(definicao.get("k", f"SEG{i + 1}"))
        aceitos = [str(v) for v in (definicao.get("vals") or [])]
        opcional = bool(definicao.get("opcional", False))
        valor = partes[i] if i < len(partes) else ""

        if not valor:
            avaliados.append(
                SegmentoAvaliado(
                    k=rotulo,
                    valor="",
                    ok=opcional,
                    esperados=aceitos,
                    motivo=None if opcional else "segmento ausente",
                )
            )
            continue

        if aceitos and valor not in aceitos:
            avaliados.append(
                SegmentoAvaliado(
                    k=rotulo,
                    valor=valor,
                    ok=False,
                    esperados=aceitos,
                    motivo=f"valor fora da lista aceita ({', '.join(aceitos)})",
                )
            )
            continue

        avaliados.append(SegmentoAvaliado(k=rotulo, valor=valor, ok=True, esperados=aceitos))

    # Segmentos a mais também reprovam: o nome tem de casar com o padrão
    # inteiro, senão 'CPQ11-C-STRC-CONCR-ADMIN-R22-COPIA' passaria.
    excedentes = partes[len(segmentos) :]
    for j, extra in enumerate(excedentes):
        avaliados.append(
            SegmentoAvaliado(
                k=f"EXTRA{j + 1}", valor=extra, ok=False, motivo="segmento além do padrão"
            )
        )

    ok = all(s.ok for s in avaliados)
    if ok:
        mensagem = "nome conforme o padrão do projeto"
    else:
        falhas = [s for s in avaliados if not s.ok]
        mensagem = "; ".join(f"{s.k}: {s.motivo or 'inválido'}" for s in falhas)

    return Veredito(ok=ok, nome=limpo, segmentos=avaliados, mensagem=mensagem)


def exemplo_do_padrao(segmentos: list[dict[str, Any]]) -> str:
    """Como o padrão se lê, usando o 1º valor aceito de cada segmento."""
    partes = []
    for s in segmentos:
        aceitos = s.get("vals") or []
        partes.append(str(aceitos[0]) if aceitos else str(s.get("k", "?")))
    return "-".join(partes)
