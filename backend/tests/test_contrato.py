"""O contrato entre o backend e o cliente TypeScript.

POR QUE ESTE ARQUIVO EXISTE. `frontend/src/lib/api.ts` e `types.ts` são 1.100
linhas que espelham À MÃO as rotas e os schemas daqui. Todo endpoint novo mexe em
cinco lugares (rota, schema, `types.ts`, `api.ts`, tela), e nada obrigava os dois
lados a concordarem: renomear uma rota no Python deixava o cliente chamando um
caminho que não existe mais, e o sintoma só aparecia como 404 em produção.

A ALTERNATIVA ERA GERAR os tipos do `openapi.json` e apagar metade do
`types.ts`. Foi recusada de propósito: tipo gerado não tem comentário, e neste
projeto o comentário é documentação — `types.ts` explica por que `lod300` e
`lod350` entraram na migration 0004, e `api.ts` explica por que o `org_id` nunca
sai do token. Trocaríamos 545 linhas comentadas por 545 geradas e mudas.

Então a duplicação FICA, e o que não fica é a chance de ela divergir em silêncio.
Estes testes leem os arquivos TypeScript como texto e comparam com a fonte. Não
precisam de banco.
"""

from __future__ import annotations

import enum
import re
from pathlib import Path

import pytest

from app.main import app
from app.models.enums import ChecklistTipo, NotifTipo, PapelUsuario
from app.schemas.membro import PAGINAS_DO_PROJETO
from app.schemas.usuario import SENHA_MINIMA

# backend/tests/test_contrato.py -> tests -> backend -> raiz
FRONT = Path(__file__).resolve().parents[2] / "frontend" / "src"

requer_front = pytest.mark.skipif(not FRONT.exists(), reason="checkout sem o frontend")


def _ler(relativo: str) -> str:
    return (FRONT / relativo).read_text(encoding="utf-8")


# ===================================================== a regra de senha
@requer_front
def test_minimo_de_senha_igual_no_front_e_no_back() -> None:
    """O número está nos dois lados; divergir não pode passar em silêncio.

    A tela de definir senha é PÚBLICA e valida enquanto se digita, sem ter a quem
    perguntar — daí a duplicação ser deliberada. O que não pode voltar é o que
    havia antes: 10 no schema, 8 na tela de Configurações e nada no formulário do
    admin. Senha de 9 caracteres passava pela validação local e voltava um 422
    ilegível.
    """
    achado = re.search(r"MIN_SENHA\s*=\s*(\d+)", _ler("lib/senha.ts"))
    assert achado, "MIN_SENHA não encontrado em frontend/src/lib/senha.ts"
    assert int(achado.group(1)) == SENHA_MINIMA, (
        f"senha.ts exige {achado.group(1)} caracteres e schemas/usuario.py exige "
        f"{SENHA_MINIMA} — alinhe os dois"
    )


def test_paginas_ocultaveis_iguais_no_front_e_no_back() -> None:
    """As telas que um membro pode ter ocultas (migration 0016) são as MESMAS.

    O front deriva a lista de `ITENS_PROJETO` — os interruptores da gaveta de
    membro SÃO o menu, não uma cópia dele. O back precisa da mesma lista para
    recusar rota inexistente no `PATCH /membros/{id}`: guardada, ela seria
    invisível na gaveta (que desenha só as telas que conhece) e ficaria no banco
    sem caminho pela interface para tirá-la.

    Tela de projeto NOVA quebra este teste, e é o objetivo: acrescentá-la em
    `PAGINAS_DO_PROJETO` é uma linha, e esquecer disso produziria uma página que
    ninguém consegue ocultar, sem nada na tela explicando por quê.
    """
    fonte = _ler("layout/nav.ts")
    # `ITENS_PROJETO` vai até o `]` sozinho na coluna 0 — o mesmo recorte que os
    # testes de enum fazem, e pela mesma razão: ler o array inteiro e só ele.
    bloco = re.search(r"export const ITENS_PROJETO[^=]*=\s*\[(.*?)\n\]", fonte, re.S)
    assert bloco, "ITENS_PROJETO não encontrado em frontend/src/layout/nav.ts"

    rotas = set(re.findall(r"rota:\s*'([^']+)'", bloco.group(1)))
    # Os recortes de auditoria entram por `...CHECKLISTS.map()`, com a rota em
    # template string — não há literal para casar, então eles se montam aqui a
    # partir da mesma constante que o arquivo usa.
    assert re.search(r"rota:\s*`auditoria/\$\{c\}`", bloco.group(1)), (
        "as rotas de auditoria mudaram de forma em ITENS_PROJETO"
    )
    lista = re.search(r"CHECKLISTS\s*=\s*\[(.*?)\]", fonte, re.S)
    assert lista, "CHECKLISTS não encontrado em frontend/src/layout/nav.ts"
    rotas |= {f"auditoria/{c}" for c in re.findall(r"'([^']+)'", lista.group(1))}

    assert rotas == set(PAGINAS_DO_PROJETO), (
        "as telas ocultáveis divergiram — "
        f"só no front: {sorted(rotas - set(PAGINAS_DO_PROJETO))}; "
        f"só no back: {sorted(set(PAGINAS_DO_PROJETO) - rotas)}"
    )


# ============================================================== os enums
def _uniao_ts(fonte: str, nome: str) -> set[str]:
    """Os literais de uma união TypeScript nomeada: `type X = 'a' | 'b'`.

    O `\\|?` inicial é para a forma quebrada em linhas, em que o primeiro token é
    a própria barra:

        export type Papel =
          | 'admin'
          | 'coordenador'

    Exige `type <nome> =`, e não qualquer `<nome>:`, porque um campo chamado
    `tipo` aparece meia dúzia de vezes no arquivo e o `re.search` casaria com o
    primeiro — que não é o que se quer travar. É por isso que
    `frontend/src/lib/types.ts` declara `NotifTipo` como tipo nomeado em vez de
    união inline no campo.
    """
    achado = re.search(rf"\btype\s+{nome}\s*=\s*(\|?(?:\s*'[^']+'\s*\|?)+)", fonte)
    assert achado, f"`export type {nome}` não encontrado no TypeScript"
    return set(re.findall(r"'([^']+)'", achado.group(1)))


@requer_front
@pytest.mark.parametrize(
    ("arquivo", "nome_ts", "enum_py"),
    [
        ("lib/types.ts", "ChecklistTipo", ChecklistTipo),
        ("lib/api.ts", "Papel", PapelUsuario),
        ("lib/types.ts", "NotifTipo", NotifTipo),
    ],
)
def test_enums_do_front_espelham_o_backend(
    arquivo: str, nome_ts: str, enum_py: type[enum.Enum]
) -> None:
    """Um valor a mais ou a menos no TypeScript vira 422 ou opção fantasma.

    Foi o que aconteceu com `ifc` e `lod350`: os dois estavam na lista de
    recortes que a tela de critérios oferecia e em nenhum serviço do backend, e
    dava para montar checklist que nenhuma tela abre. **Este teste não pega
    aquele caso** — a união `ChecklistTipo` é o contrato do enum e está certa
    tendo os sete. O que ele pega é a união e o enum divergirem.
    """
    do_front = _uniao_ts(_ler(arquivo), nome_ts)
    do_back = {m.value for m in enum_py}
    assert do_front == do_back, (
        f"{arquivo} declara {sorted(do_front)} e {enum_py.__name__} tem "
        f"{sorted(do_back)} — só no front: {sorted(do_front - do_back)}; "
        f"só no back: {sorted(do_back - do_front)}"
    )


# ============================================================== as rotas
def _caminhos_do_cliente(fonte: str) -> set[str]:
    """Os caminhos que `api.ts` chama, normalizados como os do OpenAPI.

    O cliente monta o caminho com template literal, e três formas aparecem:

        '/auth/login'                 → /auth/login
        `/modelos/${id}/versoes`      → /modelos/{}/versoes
        `/empresas${qs(filtros)}`     → /empresas        (qs é query, não caminho)

    A interpolação some antes de tudo: `${qs(...)}` inteiro (é query string) e
    depois qualquer `${...}` restante, que é sempre um parâmetro de caminho.

    TEMPLATE E STRING SÃO LIDOS SEPARADAMENTE, com delimitadores diferentes. Uma
    varredura só, com `[^`'\"]*`, partia no meio de
    `` `/apontamentos${qs({ projeto_id: projetoId ?? '' })}` `` — o `''` dentro do
    `qs` fecha a string mas não o template. Dentro de um template, só o backtick
    termina.
    """
    literais = [
        *re.findall(r"`([^`]*)`", fonte, re.DOTALL),
        *re.findall(r"'([^'\n]*)'", fonte),
        *re.findall(r'"([^"\n]*)"', fonte),
    ]
    caminhos: set[str] = set()
    for cru in literais:
        if not (cru.startswith("/") or cru.startswith("${BASE}/")):
            continue
        p = cru.replace("${BASE}", "")
        p = re.sub(r"\$\{qs\(.*?\)\}", "", p, flags=re.DOTALL)
        p = re.sub(r"\$\{[^}]*\}", "{}", p)
        p = p.split("?")[0].strip()
        # `/api/v1` é o valor padrão de BASE, não um endpoint.
        if not p or p == "/api/v1":
            continue
        caminhos.add(p.rstrip("/") or "/")
    return caminhos


def _caminhos_da_api() -> set[str]:
    prefixo = app.openapi()["paths"]
    return {
        re.sub(r"\{[^}]+\}", "{}", p.removeprefix("/api/v1")).rstrip("/") or "/"
        for p in prefixo
    }


@requer_front
def test_toda_rota_chamada_pelo_cliente_existe_na_api() -> None:
    """O que o cliente chama tem de existir no OpenAPI.

    É a trava que faltava: renomear ou remover uma rota no Python deixava
    `api.ts` apontando para o vazio, e o sintoma aparecia como 404 na tela de
    quem coordena obra — nunca no CI.

    A direção é só esta. O contrário (rota da API que o cliente não chama) NÃO é
    erro: o portal, o webhook do ACC e os exports existem para consumidores que
    não são esta aplicação.
    """
    do_cliente = _caminhos_do_cliente(_ler("lib/api.ts"))
    assert do_cliente, "nenhum caminho extraído de api.ts — o parser quebrou"

    da_api = _caminhos_da_api()
    orfas = sorted(do_cliente - da_api)
    assert not orfas, (
        "api.ts chama caminho que não existe na API: "
        + ", ".join(orfas)
        + f"\n(a API expõe {len(da_api)} caminhos)"
    )
