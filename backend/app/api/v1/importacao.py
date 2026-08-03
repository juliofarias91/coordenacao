"""Importação das planilhas de auditoria + o dashboard que sai delas.

PONTE PROVISÓRIA. Ver o cabeçalho da migration 0012 para o porquê de isto não
passar pelo caminho normal de auditoria. Três rotas e nada mais:

    POST   /importacao/planilhas   sobe N arquivos de uma vez
    GET    /importacao/dashboard   as médias
    DELETE /importacao/planilhas/{id}

O UPLOAD É MÚLTIPLO E TOLERANTE A FALHA PARCIAL. Subir catorze planilhas e
receber 400 porque a décima estava corrompida obrigaria a descobrir qual e
recomeçar. A resposta traz `importadas` e `recusadas`, e a tela mostra as duas —
o que deu certo já está gravado.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models import ImportacaoItem, ImportacaoPlanilha
from app.schemas.importacao import (
    Dashboard,
    FatiaDashboard,
    ItemCritico,
    PlanilhaOut,
    RecusaOut,
    ResultadoImportacao,
)
from app.services import importacao_planilha
from app.services.escopo import exigir

router = APIRouter(prefix="/importacao", tags=["importacao"])

#: Teto por arquivo. O maior dos reais tem 1,1 MB; 25 MB deixa folga de uma
#: ordem de grandeza e ainda impede que alguém derrube o processo subindo um
#: arquivo de 2 GB — `openpyxl` carrega tudo em memória.
LIMITE_BYTES = 25 * 1024 * 1024


@router.post(
    "/planilhas",
    response_model=ResultadoImportacao,
    status_code=status.HTTP_201_CREATED,
)
async def importar(
    arquivos: list[UploadFile] = File(...),
    projeto_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ResultadoImportacao:
    importadas: list[PlanilhaOut] = []
    recusadas: list[RecusaOut] = []

    for arquivo in arquivos:
        nome = arquivo.filename or "sem-nome.xlsx"
        conteudo = await arquivo.read()

        if len(conteudo) > LIMITE_BYTES:
            recusadas.append(RecusaOut(arquivo=nome, motivo="arquivo acima de 25 MB"))
            continue

        try:
            lidas = importacao_planilha.ler(nome, conteudo)
        except importacao_planilha.PlanilhaInvalida as e:
            recusadas.append(RecusaOut(arquivo=nome, motivo=str(e)))
            continue
        except Exception as e:  # noqa: BLE001
            # Uma planilha estranha não pode derrubar as outras treze.
            recusadas.append(RecusaOut(arquivo=nome, motivo=f"falha ao ler: {e}"))
            continue

        for lida in lidas:
            # REIMPORTAR SUBSTITUI. Uma planilha é identificada por
            # projeto+tipo+disciplina, e subir a versão nova do arquivo de ELEC
            # tem de trocar a antiga — senão a média conta o mesmo modelo duas
            # vezes e piora (ou melhora) sozinha a cada upload repetido.
            anteriores = db.execute(
                select(ImportacaoPlanilha.id).where(
                    ImportacaoPlanilha.projeto_id == projeto_id,
                    ImportacaoPlanilha.tipo == lida.tipo,
                    ImportacaoPlanilha.disciplina == lida.disciplina,
                )
            ).scalars().all()
            if anteriores:
                db.execute(
                    delete(ImportacaoPlanilha).where(ImportacaoPlanilha.id.in_(anteriores))
                )

            planilha = ImportacaoPlanilha(
                org_id=user.org_id,
                projeto_id=projeto_id,
                tipo=lida.tipo,
                arquivo=nome,
                disciplina=lida.disciplina,
                modelo=lida.modelo,
                versao=lida.versao,
                aprovacao=lida.aprovacao,
                aprovacao_declarada=lida.aprovacao_declarada,
                itens=len(lida.itens),
                aprovados=lida.aprovados,
            )
            db.add(planilha)
            db.flush()

            db.add_all(
                ImportacaoItem(
                    org_id=user.org_id,
                    planilha_id=planilha.id,
                    ordem=i.ordem,
                    grupo=i.grupo,
                    item=i.item,
                    aprovado=i.aprovado,
                    comentario=i.comentario,
                    direcao=i.direcao,
                )
                for i in lida.itens
            )
            importadas.append(PlanilhaOut.model_validate(planilha))

    db.flush()
    return ResultadoImportacao(importadas=importadas, recusadas=recusadas)


@router.get("/dashboard", response_model=Dashboard)
def dashboard(
    projeto_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Dashboard:
    """As médias.

    TUDO É CALCULADO EM PYTHON, sobre as planilhas já carregadas. São dezenas de
    linhas, não milhões — e um GROUP BY por tipo, por disciplina e um top-N de
    itens seriam três consultas para economizar milissegundos numa tela que
    ainda vai mudar de forma. Se a tabela crescer, isto vira SQL.

    A MÉDIA É PONDERADA PELOS ITENS, não a média das porcentagens. Uma planilha
    de LOD 300 tem 191 linhas e outra tem 54; tratar as duas como iguais faria o
    modelo menos auditado pesar o mesmo que o mais auditado. `aprovados / itens`
    somados é a taxa de aprovação real do conjunto.
    """
    stmt = select(ImportacaoPlanilha)
    if projeto_id is not None:
        stmt = stmt.where(ImportacaoPlanilha.projeto_id == projeto_id)
    planilhas = list(db.execute(stmt).scalars())

    def fatia(rotulo: str, grupo: list[ImportacaoPlanilha]) -> FatiaDashboard:
        itens = sum(p.itens for p in grupo)
        aprovados = sum(p.aprovados for p in grupo)
        return FatiaDashboard(
            rotulo=rotulo,
            planilhas=len(grupo),
            itens=itens,
            aprovados=aprovados,
            aprovacao=(aprovados / itens) if itens else None,
        )

    por_tipo = [
        fatia(tipo, [p for p in planilhas if p.tipo == tipo])
        for tipo in ("geral", "lod300")
        if any(p.tipo == tipo for p in planilhas)
    ]
    por_disciplina = sorted(
        (
            fatia(d, [p for p in planilhas if p.disciplina == d])
            for d in {p.disciplina for p in planilhas}
        ),
        key=lambda f: (f.aprovacao if f.aprovacao is not None else 1),
    )

    # OS ITENS QUE MAIS REPROVAM, cruzando todas as planilhas — é a pergunta que
    # a planilha isolada não responde e que justifica ter juntado tudo: "o que
    # está errado em TODO MUNDO?".
    contagem: dict[tuple[str, str], list[int]] = {}
    if planilhas:
        ids = [p.id for p in planilhas]
        tipo_de = {p.id: p.tipo for p in planilhas}
        for item in db.execute(
            select(ImportacaoItem).where(ImportacaoItem.planilha_id.in_(ids))
        ).scalars():
            chave = (tipo_de[item.planilha_id], item.item)
            atual = contagem.setdefault(chave, [0, 0])
            atual[0] += 1
            if not item.aprovado:
                atual[1] += 1

    criticos = sorted(
        (
            ItemCritico(
                tipo=tipo,
                item=nome,
                ocorrencias=total,
                reprovacoes=reprovados,
                taxa=reprovados / total,
            )
            for (tipo, nome), (total, reprovados) in contagem.items()
            # Aparecer numa planilha só não é padrão, é caso — e encheria o topo
            # da lista com item de uma disciplina única.
            if total > 1 and reprovados
        ),
        key=lambda c: (-c.taxa, -c.reprovacoes),
    )[:15]

    return Dashboard(
        total=fatia("total", planilhas),
        por_tipo=por_tipo,
        por_disciplina=por_disciplina,
        criticos=criticos,
        planilhas=[PlanilhaOut.model_validate(p) for p in planilhas],
    )


@router.delete("/planilhas/{planilha_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    planilha_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    planilha = exigir(db, ImportacaoPlanilha, planilha_id, "importação")
    # Apaga de verdade, sem lixeira: importação não se restaura — se refaz.
    db.delete(planilha)
