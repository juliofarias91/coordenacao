"""A lixeira (migration 0006) — remoção reversível.

O QUE SE PROTEGE AQUI é que o filtro esteja na POLICY DE RLS, e não espalhado
pelas consultas. Se um dia alguém trocar o mecanismo por um `.where()` em cada
rota, estes testes continuam passando para a rota testada e falham para as
outras — que é exatamente o modo de falha que a policy existe para evitar.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from tests.conftest import API, Cenario, requer_banco


def _cliente(autenticado: TestClient) -> dict:
    resp = autenticado.post(f"{API}/clientes", json={"nome": f"Some {uuid.uuid4().hex[:6]}"})
    assert resp.status_code == 201, resp.text
    return resp.json()


@requer_banco
def test_remover_esconde_mas_nao_apaga(autenticado: TestClient) -> None:
    c = _cliente(autenticado)

    assert autenticado.delete(f"{API}/clientes/{c['id']}").status_code == 204

    # Sumiu das telas normais — é a policy escondendo, não um filtro de rota.
    assert autenticado.get(f"{API}/clientes/{c['id']}").status_code == 404
    assert c["id"] not in {x["id"] for x in autenticado.get(f"{API}/clientes").json()["itens"]}

    # E continua na lixeira.
    na_lixeira = autenticado.get(f"{API}/lixeira").json()
    alvo = next((i for i in na_lixeira if i["id"] == c["id"]), None)
    assert alvo is not None, "o item removido não apareceu na lixeira"
    assert alvo["tipo"] == "cliente"
    assert alvo["rotulo"] == c["nome"]


@requer_banco
def test_restaurar_traz_de_volta(autenticado: TestClient) -> None:
    c = _cliente(autenticado)
    autenticado.delete(f"{API}/clientes/{c['id']}")

    assert autenticado.post(f"{API}/lixeira/cliente/{c['id']}/restaurar").status_code == 204

    assert autenticado.get(f"{API}/clientes/{c['id']}").status_code == 200
    assert c["id"] not in {i["id"] for i in autenticado.get(f"{API}/lixeira").json()}


@requer_banco
def test_a_pasta_da_home_tambem_esconde_o_removido(autenticado: TestClient) -> None:
    """`/clientes/pastas` é outra consulta, com JOIN e agregação. Se o filtro
    estivesse nas rotas em vez da policy, esta seria a que alguém esqueceria."""
    c = _cliente(autenticado)
    autenticado.delete(f"{API}/clientes/{c['id']}")

    pastas = autenticado.get(f"{API}/clientes/pastas").json()
    assert c["id"] not in {p["id"] for p in pastas}


@requer_banco
def test_apagar_de_vez_exige_estar_na_lixeira(autenticado: TestClient) -> None:
    """Só alcança o que JÁ foi removido: apagar de vez algo em uso exigiria
    removê-lo antes, e esse é o passo em que se percebe o estrago."""
    c = _cliente(autenticado)

    em_uso = autenticado.delete(f"{API}/lixeira/cliente/{c['id']}")
    assert em_uso.status_code == 409

    autenticado.delete(f"{API}/clientes/{c['id']}")
    assert autenticado.delete(f"{API}/lixeira/cliente/{c['id']}").status_code == 204
    # Agora sim: não está na lixeira nem em lugar nenhum.
    assert c["id"] not in {i["id"] for i in autenticado.get(f"{API}/lixeira").json()}


@requer_banco
def test_lixeira_e_so_de_quem_administra(client: TestClient, cenario: Cenario) -> None:
    so_leitura = cenario.headers(permissoes=["ver_painel"])
    assert client.get(f"{API}/lixeira", headers=so_leitura).status_code == 403


@requer_banco
def test_tipo_desconhecido_nao_restaura(autenticado: TestClient) -> None:
    """A rota aceita só as chaves de `REMOVIVEIS`. Sem isso, um `tipo` livre
    convidaria a tentar restaurar tabela que sequer tem `deleted_at`."""
    resp = autenticado.post(f"{API}/lixeira/usuario/{uuid.uuid4()}/restaurar")
    assert resp.status_code == 404


@requer_banco
def test_criterio_removido_some_da_biblioteca(autenticado: TestClient, cenario: Cenario) -> None:
    """Outra entidade, outra rota — e a mesma policy fazendo o trabalho."""
    # `nivel` e `automacao` são obrigatórios: o schema não lhes dá padrão,
    # porque um critério sem nível não sabe se reprova o arquivo ou lista
    # ocorrências.
    resp = autenticado.post(
        f"{API}/criterios",
        json={
            "projeto_id": str(cenario.projeto.id),
            "codigo": f"TMP_{uuid.uuid4().hex[:6].upper()}",
            "nome_pt": "Temporário",
            "nome_en": "Temporary",
            "nivel": "modelo",
            "automacao": "manual",
        },
    )
    assert resp.status_code == 201, resp.text
    criado = resp.json()

    assert autenticado.delete(f"{API}/criterios/{criado['id']}").status_code == 204

    visiveis = autenticado.get(
        f"{API}/criterios", params={"projeto_id": str(cenario.projeto.id)}
    ).json()["itens"]
    assert criado["id"] not in {c["id"] for c in visiveis}
    assert criado["id"] in {i["id"] for i in autenticado.get(f"{API}/lixeira").json()}
