"""As áreas de um projeto — acrescentar, renomear, remover (migration 0019).

O NOME É A CHAVE, e é isso que faz este módulo existir. `projeto.areas` guarda a
definição, mas quem consome guarda o nome DE NOVO em outros TRÊS lugares:
`disciplina.areas` (o array que a matriz modelo × área varre), `auditoria.area`
(a auditoria de LOD 400/500, que é por área) e `standard.nome` nas linhas de tipo
`setorizacao` (a imagem que explica o setor). Uma tela que gravasse só a lista do
projeto deixaria os outros três apontando para um nome que não existe mais — a
disciplina continuaria auditando 'COLO1' num projeto onde só há 'TORRE 1', e a
matriz mostraria as duas colunas.

Por isso as operações são NOMEADAS em vez de haver um PATCH da lista inteira: da
lista pronta não se deduz o ato. `['ADMIN', 'TORRE 1']` no lugar de
`['ADMIN', 'COLO1']` é indistinguível de "renomeei COLO1" e de "apaguei COLO1 e
criei TORRE 1" — e as duas leituras fazem coisas opostas com a auditoria que já
está preenchida lá dentro.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Auditoria, Disciplina, Modelo, Projeto, Standard, VersaoModelo
from app.schemas.projeto import normalizar_area as normalizar
from app.services.escopo import conflito

#: O `standard.tipo` das imagens de setor. Texto e não enum — ver o cabeçalho de
#: `pages/configuracao/Areas.tsx` para por que diretriz e setorização moram em
#: `standard` em vez de terem tabela própria.
TIPO_SETORIZACAO = "setorizacao"


def _existe(projeto: Projeto, nome: str) -> str | None:
    """O nome COMO ELE ESTÁ GRAVADO, se já houver um igual ignorando caixa.

    Comparação insensível a caixa porque 'Colo1' e 'COLO1' seriam duas colunas na
    matriz para o mesmo lugar da obra — que é exatamente o defeito que a lista do
    projeto veio resolver. Devolve o gravado, e não `True`, para a mensagem de
    erro poder mostrar qual é o que já existe.
    """
    alvo = nome.casefold()
    return next((a for a in projeto.areas if a.casefold() == alvo), None)


def _auditorias(projeto_id: uuid.UUID, nome: str):
    """As auditorias de uma área. Três saltos: auditoria → versão → modelo →
    projeto. `auditoria` não tem `projeto_id` — ela pertence a uma versão."""
    return (
        select(Auditoria)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto_id, Auditoria.area == nome)
    )


def _disciplinas(db: Session, projeto_id: uuid.UUID) -> list[Disciplina]:
    return list(
        db.execute(select(Disciplina).where(Disciplina.projeto_id == projeto_id)).scalars()
    )


def uso(db: Session, projeto: Projeto) -> dict[str, tuple[int, int]]:
    """Por área: quantas disciplinas a declaram e quantas auditorias existem nela.

    UMA CONSULTA PARA TODAS, e não uma por área: a tela lista as áreas do projeto
    de uma vez, e uma consulta por linha faria oito requisições ao banco para
    desenhar oito linhas.
    """
    contagem: dict[str, tuple[int, int]] = {a: (0, 0) for a in projeto.areas}

    for disciplina in _disciplinas(db, projeto.id):
        for area in disciplina.areas:
            d, x = contagem.get(area, (0, 0))
            contagem[area] = (d + 1, x)

    linhas = db.execute(
        select(Auditoria.area, func.count())
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto.id, Auditoria.area.is_not(None))
        .group_by(Auditoria.area)
    )
    for area, quantas in linhas:
        d, _ = contagem.get(area, (0, 0))
        contagem[area] = (d, quantas)

    return contagem


def acrescentar(db: Session, projeto: Projeto, nome: str) -> str:
    nome = normalizar(nome)
    if (gravado := _existe(projeto, nome)) is not None:
        raise conflito(f"o projeto já tem a área '{gravado}'")
    # Lista NOVA, e não `.append()`: a coluna é `ARRAY(Text)` e o SQLAlchemy
    # rastreia mutação de array por IDENTIDADE do objeto — mutar no lugar não
    # marca o campo como sujo e o UPDATE não sai.
    projeto.areas = [*projeto.areas, nome]
    db.flush()
    return nome


def renomear(db: Session, projeto: Projeto, de: str, para: str) -> str:
    """Troca o nome AQUI E EM QUEM O GUARDA — é a razão de a rota existir.

    A cascata alcança `disciplina.areas`, `auditoria.area` e a imagem do setor.
    Sem ela, renomear seria o mesmo que apagar: as auditorias de LOD 400/500
    continuariam gravadas com o nome antigo, sumiriam da matriz (que passa a
    varrer o novo) e não haveria tela nenhuma por onde reencontrá-las.

    A IMAGEM ENTROU NA CASCATA EM 07/08/2026, quando a grade de setorização veio
    do PEB para a mesma tela em que se renomeia. O defeito já existia — o
    `standard` de tipo `setorizacao` é casado por NOME, e renomear a área o
    deixava órfão, com o arquivo no S3 e fora de toda tela —, mas ficava
    invisível porque as duas coisas viviam em seções diferentes. Com elas uma
    debaixo da outra, renomear uma linha fazia a imagem sumir da grade logo
    abaixo, na mesma tela e no mesmo segundo.
    """
    para = normalizar(para)
    if (atual := _existe(projeto, de)) is None:
        raise conflito(f"o projeto não tem a área '{de}'")
    # Só a CAIXA mudando é renomeação legítima ('colo1' → 'COLO1'): aí o nome
    # igual encontrado é ele mesmo, e barrar impediria justamente a correção.
    if (choque := _existe(projeto, para)) is not None and choque != atual:
        raise conflito(f"o projeto já tem a área '{choque}'")

    projeto.areas = [para if a == atual else a for a in projeto.areas]

    for disciplina in _disciplinas(db, projeto.id):
        if atual in disciplina.areas:
            disciplina.areas = [para if a == atual else a for a in disciplina.areas]

    for auditoria in db.execute(_auditorias(projeto.id, atual)).scalars():
        auditoria.area = para

    for imagem in db.execute(
        select(Standard).where(
            Standard.projeto_id == projeto.id,
            Standard.tipo == TIPO_SETORIZACAO,
            Standard.nome == atual,
        )
    ).scalars():
        imagem.nome = para

    db.flush()
    return para


def remover(db: Session, projeto: Projeto, nome: str) -> None:
    """Tira a área do projeto e das disciplinas. RECUSA se houver auditoria.

    A auditoria é o dado de origem desta plataforma: sumir com a área de uma que
    já tem linha preenchida deixaria o trabalho no banco e fora de toda tela — a
    matriz varre as áreas das disciplinas, e a planilha se abre por área. Quem
    quer mesmo se livrar dela renomeia, que preserva o que já foi auditado, ou
    apaga a auditoria primeiro, que é um ato com nome próprio.

    Sair das disciplinas, por outro lado, é a parte que NÃO pode ficar para
    depois: uma disciplina apontando para área que o projeto não define é uma
    coluna fantasma na matriz, e não haveria mais onde tirá-la.

    A IMAGEM DO SETOR NÃO É APAGADA, e é decisão e não esquecimento — ao
    contrário do `renomear`, que a leva junto. A grade varre as áreas DO PROJETO,
    então o `standard` órfão não aparece em tela nenhuma; e se a área for
    recriada com o mesmo nome, a imagem volta com ela. Apagá-la significaria
    destruir um arquivo no S3 dentro de uma operação que o usuário confirmou como
    "tirar o setor da lista" — e a confirmação da tela não fala em imagem. É o
    mesmo princípio que faz `DELETE /projetos/{id}` não tocar nos filhos.
    """
    if (atual := _existe(projeto, nome)) is None:
        raise conflito(f"o projeto não tem a área '{nome}'")

    quantas = db.execute(
        select(func.count()).select_from(_auditorias(projeto.id, atual).subquery())
    ).scalar_one()
    if quantas:
        raise conflito(
            f"a área '{atual}' tem {quantas} auditoria(s) e não pode ser removida — "
            "renomeie-a, ou remova antes as auditorias dela"
        )

    projeto.areas = [a for a in projeto.areas if a != atual]

    for disciplina in _disciplinas(db, projeto.id):
        if atual in disciplina.areas:
            disciplina.areas = [a for a in disciplina.areas if a != atual]

    db.flush()


def exigir_definidas(projeto: Projeto, areas: list[str]) -> list[str]:
    """As áreas de uma disciplina precisam estar DEFINIDAS NO PROJETO.

    É o que dá dente à definição: sem isto, a lista do projeto seria uma sugestão
    e a disciplina continuaria podendo inventar um setor que não existe em lugar
    nenhum — que é o estado que a 0019 veio corrigir.

    Devolve os nomes COMO ESTÃO GRAVADOS no projeto, e não como vieram: quem
    manda 'colo1' está falando da COLO1, e gravar a caixa do pedido reintroduziria
    a divergência pela porta dos fundos.
    """
    definidas = {a.casefold(): a for a in projeto.areas}
    resolvidas: list[str] = []
    for area in areas:
        gravada = definidas.get(normalizar(area).casefold())
        if gravada is None:
            raise conflito(
                f"a área '{area}' não está definida no projeto — "
                "cadastre-a em Configurações do projeto › Setorização"
            )
        resolvidas.append(gravada)
    return resolvidas
