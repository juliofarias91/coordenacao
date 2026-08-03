"""Traz o HISTÓRICO de rounds já auditados das planilhas de controle.

O QUE ISTO RESOLVE. O onboarding (`gerar_cpq11_das_planilhas.py` +
`abrir_auditorias_cpq11.py`) trouxe o cadastro — empresas, disciplinas, modelos,
versões — e abriu a primeira auditoria de cada modelo. O que ficou de fora foi o
trabalho JÁ FEITO: as planilhas guardam, por modelo, o percentual de aprovação
de cada round que a coordenação fechou. São 39 colunas de round na geral e 52 na
de LOD 300.

    ROUND 12 - APPROVAL (%) = 0,87   →   auditoria round 12, 87%, publicada

**O QUE NÃO É FEITO AQUI, e a distinção é o ponto.** O cabeçalho dos scripts de
onboarding registra uma decisão anterior: não se reconstrói a resposta item a
item a partir de um agregado, porque isso encheria a plataforma de dado
inventado. Isso continua valendo. O que entra é o agregado COMO AGREGADO — o
round existiu, o percentual é real, e os itens simplesmente não estão
disponíveis. A auditoria importada nasce **sem nenhum `resultado_check`**, e é
por essa ausência que a interface a reconhece.

**O RESPONSÁVEL NÃO ENTRA.** As planilhas atribuem a análise a nove pessoas
(EDSON, ALINNE, IURY, YASMIN…) e nenhuma tem conta; `auditoria.auditor_id` é
chave estrangeira para `usuario`, e criar nove contas para preencher um campo
não foi pedido. Decisão de 30/07/2026: usar só os usuários atuais, e o
histórico fica sem auditor.

**A VERSÃO É A ATUAL, e é uma imprecisão consciente.** Os rounds históricos
rodaram sobre versões que a plataforma não tem — só a vigente foi cadastrada.
`auditoria.versao_id` é obrigatório, então todos apontam para ela. O que se
perde é "que versão tinha 87%"; o que se ganha é a curva de evolução do modelo,
que é o que os KPIs mostram.

Uso:

    python -m scripts.importar_historico              # simulação, não grava
    python -m scripts.importar_historico --aplicar    # grava
"""

from __future__ import annotations

import pathlib
import re
import sys
from decimal import ROUND_HALF_UP, Decimal

import openpyxl
from sqlalchemy import select

from app.db.session import AuthSessionLocal
from app.models import Auditoria, Modelo, Projeto, VersaoModelo
from app.models.enums import AuditoriaEstado, ChecklistTipo

BASES = pathlib.Path(__file__).resolve().parents[2] / "bases"

# Qual planilha alimenta qual recorte, e onde está o cabeçalho de cada uma.
#
# A linha do cabeçalho é fixa e diferente entre as duas — as planilhas têm
# títulos mesclados em cima, em quantidade diferente. Procurar a linha pelo
# conteúdo seria mais esperto e mais frágil: bastaria alguém inserir uma linha
# de anotação para o palpite mudar de alvo.
FONTES = (
    ("GENERAL AUDIT - CONTROL.xlsx", "PROGRESS CONTROL", 4, ChecklistTipo.GERAL),
    ("LOD300_SPECIFIC AUDIT_CONTROL.xlsx", "LOD 300 - CONTROL", 3, ChecklistTipo.LOD300),
)

# `ROUND 12 - APPROVAL (%)` e `R12 - APPROVAL (%)` e `R12- APPROVAL (%)`.
# As três grafias convivem nos arquivos — a de LOD 300 perde o espaço antes do
# hífen a partir do R4, e uma regex tolerante custa menos que normalizar 91
# cabeçalhos à mão.
COLUNA_ROUND = re.compile(r"^R(?:OUND)?\s*(\d+)\s*-?\s*APPROVAL", re.I)


def pct(valor: float) -> Decimal:
    """Fração da planilha → porcentagem do banco.

    As planilhas guardam 0,87; `aprovacao_pct` guarda 87,00 — é o que
    `recalcular_aprovacao` grava (`* 100`), e misturar as duas escalas faria o
    painel mostrar 0,87% de aprovação.
    """
    return (Decimal(str(valor)) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def ler(arquivo: str, aba: str, linha_cab: int) -> list[tuple[str, dict[int, float]]]:
    """`[(codigo_do_modelo, {round: fração}), …]` de uma planilha de controle."""
    wb = openpyxl.load_workbook(BASES / arquivo, read_only=True, data_only=True)
    try:
        linhas = list(wb[aba].iter_rows(min_row=linha_cab, values_only=True))
    finally:
        wb.close()

    cab = [str(c) if c is not None else "" for c in linhas[0]]
    i_nome = next((i for i, c in enumerate(cab) if "FILE NAME (R24)" in c), None)
    if i_nome is None:
        raise SystemExit(f"{aba}: não achei a coluna FILE NAME (R24)")
    rounds = {i: int(m.group(1)) for i, c in enumerate(cab) if (m := COLUNA_ROUND.match(c.strip()))}

    achados = []
    for row in linhas[1:]:
        if i_nome >= len(row) or not row[i_nome]:
            continue
        codigo = str(row[i_nome]).strip()
        if not codigo.upper().startswith("CPQ11"):
            continue
        # Só número entra. As planilhas usam "NOT PUBLISHED", "-" e células
        # vazias para dizer "não houve", e `float("NOT PUBLISHED")` explodiria.
        valores = {
            n: float(row[i])
            for i, n in rounds.items()
            if i < len(row) and isinstance(row[i], int | float) and not isinstance(row[i], bool)
        }
        if valores:
            achados.append((codigo, valores))
    return achados


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    db = AuthSessionLocal()

    projeto = db.execute(select(Projeto).where(Projeto.codigo == "CPQ11")).scalars().first()
    if projeto is None:
        raise SystemExit("projeto CPQ11 não encontrado — rode o onboarding antes")

    # Índice por código em CAIXA ALTA: o banco guarda `.RVT` e a planilha `.rvt`.
    modelos = {
        m.codigo.upper(): m
        for m in db.execute(select(Modelo).where(Modelo.projeto_id == projeto.id)).scalars()
    }

    criadas = renumeradas = pulados = sem_modelo = 0
    for arquivo, aba, linha_cab, checklist in FONTES:
        print(f"\n--- {aba} → {checklist.value}")
        for codigo, valores in ler(arquivo, aba, linha_cab):
            modelo = modelos.get(codigo.upper())
            if modelo is None:
                sem_modelo += 1
                continue

            versao = db.execute(
                select(VersaoModelo)
                .where(VersaoModelo.modelo_id == modelo.id)
                .order_by(VersaoModelo.created_at.desc())
            ).scalars().first()
            if versao is None:
                sem_modelo += 1
                continue

            existentes = db.execute(
                select(Auditoria).where(
                    Auditoria.versao_id == versao.id, Auditoria.checklist == checklist
                )
            ).scalars().all()
            # Idempotente: o que já foi importado não entra de novo. Reconhece-se
            # pelo estado publicado — a auditoria ABERTA é a que fica.
            ja_importados = {
                a.round for a in existentes if a.estado is AuditoriaEstado.PUBLICADO
            }

            novos = sorted(n for n in valores if n not in ja_importados)
            if not novos:
                pulados += 1
                continue

            for n in novos:
                if aplicar:
                    db.add(
                        Auditoria(
                            org_id=projeto.org_id,
                            versao_id=versao.id,
                            checklist=checklist,
                            round=n,
                            aprovacao_pct=pct(valores[n]),
                            estado=AuditoriaEstado.PUBLICADO,
                        )
                    )
                criadas += 1

            # A auditoria ABERTA passa a ser a PRÓXIMA. Sem isto ela ficaria com
            # o mesmo número de um round histórico, e o painel mostraria dois
            # "round 1" para o mesmo modelo — um fechado e um em andamento.
            proximo = max(valores) + 1
            for a in existentes:
                if a.estado is not AuditoriaEstado.PUBLICADO and a.round != proximo:
                    if aplicar:
                        a.round = proximo
                    renumeradas += 1

        if aplicar:
            db.commit()

    print(f"\n{'GRAVADO' if aplicar else 'SIMULACAO (use --aplicar)'}")
    print(f"  rounds historicos a criar : {criadas}")
    print(f"  auditorias em aberto renumeradas: {renumeradas}")
    print(f"  modelos ja importados (pulados) : {pulados}")
    print(f"  linhas sem modelo correspondente: {sem_modelo}")


if __name__ == "__main__":
    main()
