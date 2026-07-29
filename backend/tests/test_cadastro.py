"""Fase 1 · cadastro completo (SP-101 a SP-106).

Exercita os critérios de aceite do backlog contra a API de verdade.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from tests.conftest import API, Cenario, requer_banco

pytestmark = requer_banco


# ------------------------------------------------------------- SP-101 projeto
def test_criar_projeto_e_ler_de_volta(autenticado: TestClient) -> None:
    # Cliente é entidade desde a 0003: o projeto aponta por `cliente_id`, e a
    # leitura devolve `cliente_nome` resolvido pelo relacionamento.
    cliente = autenticado.post(f"{API}/clientes", json={"nome": "Microsoft"}).json()
    r = autenticado.post(
        f"{API}/projetos",
        json={"codigo": "cpq99", "nome": "CPQ99 — Data Center", "cliente_id": cliente["id"]},
    )
    assert r.status_code == 201, r.text
    criado = r.json()
    assert criado["codigo"] == "CPQ99", "o código deve ser normalizado em maiúsculas"
    assert criado["status"] == "config"

    r = autenticado.get(f"{API}/projetos/{criado['id']}")
    assert r.status_code == 200
    assert r.json()["cliente_nome"] == "Microsoft"


def test_codigo_de_projeto_e_unico_na_organizacao(autenticado: TestClient) -> None:
    payload = {"codigo": "DUPL", "nome": "Primeiro"}
    assert autenticado.post(f"{API}/projetos", json=payload).status_code == 201
    r = autenticado.post(f"{API}/projetos", json={**payload, "nome": "Segundo"})
    assert r.status_code == 409
    assert "DUPL" in r.json()["detail"]


def test_patch_so_altera_o_que_foi_enviado(autenticado: TestClient, cenario: Cenario) -> None:
    cliente = autenticado.post(f"{API}/clientes", json={"nome": "Prologis"}).json()
    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}", json={"cliente_id": cliente["id"]}
    )
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["cliente_nome"] == "Prologis"
    assert corpo["nome"] == "Projeto de teste", "o nome não foi enviado e não podia mudar"


def test_projeto_de_outra_organizacao_da_404(autenticado: TestClient) -> None:
    r = autenticado.get(f"{API}/projetos/{uuid.uuid4()}")
    assert r.status_code == 404


# ------------------------------------------------------------- SP-102 empresa
def _criar_empresa(client: TestClient, nome: str, **extra) -> dict:
    r = client.post(f"{API}/empresas", json={"nome": nome, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_empresa_com_papeis_e_contatos(autenticado: TestClient) -> None:
    empresa = _criar_empresa(
        autenticado,
        "Mendes Holler",
        tipo="terceirizada",
        papeis=["trade", "bim"],
        ferramenta="Revit",
    )
    assert set(empresa["papeis"]) == {"trade", "bim"}

    r = autenticado.post(
        f"{API}/empresas/{empresa['id']}/contatos",
        json={
            "nome": "Carlos Mendes",
            "cargo": "Coordenador BIM",
            "email": "carlos@mendesholler.com",
            "disciplina": "FPRT-FPRT",
        },
    )
    assert r.status_code == 201, r.text

    detalhe = autenticado.get(f"{API}/empresas/{empresa['id']}").json()
    assert len(detalhe["contatos"]) == 1
    assert detalhe["contatos"][0]["email"] == "carlos@mendesholler.com"


def test_cadeia_de_subcontratacao(autenticado: TestClient) -> None:
    contratante = _criar_empresa(autenticado, "Racional", tipo="propria")
    sub = _criar_empresa(autenticado, "T2B", contratada_por=contratante["id"])
    assert sub["contratada_por"] == contratante["id"]


def test_subcontratacao_nao_pode_ser_circular(autenticado: TestClient) -> None:
    a = _criar_empresa(autenticado, "Empresa A")
    b = _criar_empresa(autenticado, "Empresa B", contratada_por=a["id"])

    # Fechar o ciclo A → B → A trava quem sobe a cadeia.
    r = autenticado.patch(f"{API}/empresas/{a['id']}", json={"contratada_por": b["id"]})
    assert r.status_code == 409
    assert "circular" in r.json()["detail"]


def test_empresa_nao_contrata_a_si_mesma(autenticado: TestClient) -> None:
    a = _criar_empresa(autenticado, "Empresa Sozinha")
    r = autenticado.patch(f"{API}/empresas/{a['id']}", json={"contratada_por": a["id"]})
    assert r.status_code == 409


def test_filtro_por_papel(autenticado: TestClient) -> None:
    _criar_empresa(autenticado, "Só Modeladora", papeis=["bim"])
    _criar_empresa(autenticado, "Só Instaladora", papeis=["trade"])

    r = autenticado.get(f"{API}/empresas", params={"papel": "bim"})
    assert r.status_code == 200
    nomes = [e["nome"] for e in r.json()["itens"]]
    assert "Só Modeladora" in nomes
    assert "Só Instaladora" not in nomes


# ------------------------------------------------------------- SP-103 usuário
def test_criar_usuario_nao_devolve_hash_de_senha(autenticado: TestClient) -> None:
    r = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": "ana@t2b.com",
            "nome": "Ana Torres",
            "senha": "uma-senha-longa-o-bastante",
            "papel": "auditor",
            "permissoes": ["ver_painel", "executar"],
        },
    )
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert "senha" not in corpo and "senha_hash" not in corpo
    assert corpo["permissoes"] == ["ver_painel", "executar"]


def test_permissao_desconhecida_e_recusada(autenticado: TestClient) -> None:
    r = autenticado.post(
        f"{API}/usuarios",
        json={"login": "x@y.com", "papel": "leitor", "permissoes": ["apagar_tudo"]},
    )
    assert r.status_code == 422
    assert "apagar_tudo" in r.text


def test_usuario_sem_senha_e_valido_para_sso(autenticado: TestClient) -> None:
    r = autenticado.post(f"{API}/usuarios", json={"login": "sso@spbim.com", "papel": "leitor"})
    assert r.status_code == 201


def test_login_e_unico_na_organizacao(autenticado: TestClient) -> None:
    payload = {"login": "repetido@spbim.com", "papel": "leitor"}
    assert autenticado.post(f"{API}/usuarios", json=payload).status_code == 201
    assert autenticado.post(f"{API}/usuarios", json=payload).status_code == 409


def test_admin_nao_desativa_a_si_mesmo(autenticado: TestClient, cenario: Cenario) -> None:
    r = autenticado.patch(f"{API}/usuarios/{cenario.admin.id}", json={"status": "inativo"})
    assert r.status_code == 409


def test_catalogo_de_permissoes(autenticado: TestClient) -> None:
    r = autenticado.get(f"{API}/usuarios/permissoes")
    assert r.status_code == 200
    codigos = {p["codigo"] for p in r.json()}
    assert "publicar" in codigos and "admin_cadastro" in codigos


# ------------------------------------------------------ SP-104 nomenclatura
SEGMENTOS = [
    {"k": "PROJETO", "vals": ["CPQ11"]},
    {"k": "MACRO", "vals": ["A", "C", "M", "S"]},
    {"k": "DISC", "vals": []},
    {"k": "SUB", "vals": []},
    {"k": "SETOR", "vals": []},
    {"k": "SW", "vals": ["R22", "R24", "RX3"]},
]


def test_definir_e_ler_nomenclatura(autenticado: TestClient, cenario: Cenario) -> None:
    r = autenticado.put(
        f"{API}/projetos/{cenario.projeto.id}/nomenclatura", json={"segmentos": SEGMENTOS}
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["segmentos"]) == 6

    r = autenticado.get(f"{API}/projetos/{cenario.projeto.id}/nomenclatura")
    assert r.status_code == 200
    assert r.json()["segmentos"][0]["vals"] == ["CPQ11"]


def test_redefinir_nomenclatura_arquiva_a_anterior(
    autenticado: TestClient, cenario: Cenario
) -> None:
    url = f"{API}/projetos/{cenario.projeto.id}/nomenclatura"
    primeiro = autenticado.put(url, json={"segmentos": SEGMENTOS}).json()
    segundo = autenticado.put(url, json={"segmentos": SEGMENTOS[:4]}).json()

    assert primeiro["id"] != segundo["id"], "o padrão antigo é preservado, não sobrescrito"
    assert autenticado.get(url).json()["id"] == segundo["id"]


def test_nomenclatura_com_segmento_repetido_e_recusada(
    autenticado: TestClient, cenario: Cenario
) -> None:
    r = autenticado.put(
        f"{API}/projetos/{cenario.projeto.id}/nomenclatura",
        json={"segmentos": [{"k": "DISC", "vals": []}, {"k": "DISC", "vals": []}]},
    )
    assert r.status_code == 422


def test_projeto_sem_nomenclatura_da_404(autenticado: TestClient, cenario: Cenario) -> None:
    r = autenticado.get(f"{API}/projetos/{cenario.projeto.id}/nomenclatura")
    assert r.status_code == 404


# -------------------------------------------------------- SP-105 disciplina
def test_codigo_da_disciplina_deriva_de_disc_e_sub(
    autenticado: TestClient, cenario: Cenario
) -> None:
    r = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(cenario.projeto.id),
            "macro": "C",
            "disc": "strc",
            "sub": "steel",
            "checklists": ["ifc", "lod400"],
            "areas": ["COLO1", "COLO2"],
        },
    )
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert corpo["codigo"] == "STRC-STEEL"
    assert corpo["cor_macro"] == "#A85B12", "cor da macrodisciplina C (SP-107)"
    assert set(corpo["checklists"]) == {"ifc", "lod400"}


def test_disciplina_e_unica_por_projeto(autenticado: TestClient, cenario: Cenario) -> None:
    payload = {
        "projeto_id": str(cenario.projeto.id),
        "macro": "A",
        "disc": "ARCH",
        "sub": "CEIL",
    }
    assert autenticado.post(f"{API}/disciplinas", json=payload).status_code == 201
    r = autenticado.post(f"{API}/disciplinas", json=payload)
    assert r.status_code == 409
    assert "ARCH-CEIL" in r.json()["detail"]


def test_disciplina_recusa_standard_que_nao_e_nomenclatura(
    autenticado: TestClient, cenario: Cenario
) -> None:
    dicionario = autenticado.post(
        f"{API}/standards",
        json={
            "projeto_id": str(cenario.projeto.id),
            "nome": "Dicionário IFC",
            "tipo": "vocabulario",
        },
    ).json()

    r = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(cenario.projeto.id),
            "macro": "M",
            "disc": "FPRT",
            "sub": "FPRT",
            "nomenclatura_id": dicionario["id"],
        },
    )
    assert r.status_code == 409
    assert "vocabulario" in r.json()["detail"]


def test_renomear_disciplina_refaz_o_codigo(autenticado: TestClient, cenario: Cenario) -> None:
    criada = autenticado.post(
        f"{API}/disciplinas",
        json={"projeto_id": str(cenario.projeto.id), "macro": "A", "disc": "ARCH", "sub": "WOOD"},
    ).json()

    r = autenticado.patch(f"{API}/disciplinas/{criada['id']}", json={"sub": "FACD"})
    assert r.status_code == 200
    assert r.json()["codigo"] == "ARCH-FACD"


# --------------------------------------------------------- SP-106 critérios
def _criar_criterio(client: TestClient, projeto_id, codigo: str, **extra) -> dict:
    r = client.post(
        f"{API}/criterios",
        json={
            "projeto_id": str(projeto_id),
            "codigo": codigo,
            "nome_pt": f"Critério {codigo}",
            "nome_en": f"Criterion {codigo}",
            "nivel": "modelo",
            "automacao": "auto",
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_criterio_e_bilingue_e_unico_no_projeto(autenticado: TestClient, cenario: Cenario) -> None:
    c = _criar_criterio(autenticado, cenario.projeto.id, "SATELLITE")
    assert c["nome_pt"] and c["nome_en"]

    r = autenticado.post(
        f"{API}/criterios",
        json={
            "projeto_id": str(cenario.projeto.id),
            "codigo": "satellite",
            "nome_pt": "Outro",
            "nome_en": "Other",
            "nivel": "modelo",
            "automacao": "manual",
        },
    )
    assert r.status_code == 409, "o código é normalizado, então 'satellite' colide com 'SATELLITE'"


def test_um_criterio_serve_a_varios_checklists(autenticado: TestClient, cenario: Cenario) -> None:
    """CA central da SP-106: editar o critério reflete em todos os checklists."""
    projeto_id = str(cenario.projeto.id)
    model_name = _criar_criterio(autenticado, cenario.projeto.id, "MODEL_NAME")
    satellite = _criar_criterio(autenticado, cenario.projeto.id, "SATELLITE")

    for checklist in ("geral", "ifc"):
        r = autenticado.put(
            f"{API}/checklists/{checklist}/itens",
            json={
                "projeto_id": projeto_id,
                "itens": [
                    {"criterio_id": model_name["id"]},
                    {"criterio_id": satellite["id"]},
                ],
            },
        )
        assert r.status_code == 200, r.text

    # Uma única edição do critério canônico...
    autenticado.patch(f"{API}/criterios/{model_name['id']}", json={"nome_pt": "Nome do modelo"})

    # ...aparece nos dois checklists, porque eles guardam o id, não o texto.
    for checklist in ("geral", "ifc"):
        itens = autenticado.get(
            f"{API}/checklists/{checklist}", params={"projeto_id": projeto_id}
        ).json()["itens"]
        alvo = next(i for i in itens if i["criterio_id"] == model_name["id"])
        assert alvo["criterio"]["nome_pt"] == "Nome do modelo"

    usos = {
        c["codigo"]: c["usos"]
        for c in autenticado.get(f"{API}/criterios", params={"projeto_id": projeto_id}).json()[
            "itens"
        ]
    }
    assert usos["MODEL_NAME"] == 2


def test_checklist_recusa_criterio_repetido(autenticado: TestClient, cenario: Cenario) -> None:
    c = _criar_criterio(autenticado, cenario.projeto.id, "DUP")
    r = autenticado.put(
        f"{API}/checklists/geral/itens",
        json={
            "projeto_id": str(cenario.projeto.id),
            "itens": [{"criterio_id": c["id"]}, {"criterio_id": c["id"]}],
        },
    )
    assert r.status_code == 409


def test_put_de_checklist_substitui_a_composicao(autenticado: TestClient, cenario: Cenario) -> None:
    projeto_id = str(cenario.projeto.id)
    a = _criar_criterio(autenticado, cenario.projeto.id, "AAA")
    b = _criar_criterio(autenticado, cenario.projeto.id, "BBB")

    autenticado.put(
        f"{API}/checklists/geral/itens",
        json={"projeto_id": projeto_id, "itens": [{"criterio_id": a["id"]}]},
    )
    r = autenticado.put(
        f"{API}/checklists/geral/itens",
        json={"projeto_id": projeto_id, "itens": [{"criterio_id": b["id"]}]},
    )
    assert r.status_code == 200
    assert [i["criterio_id"] for i in r.json()["itens"]] == [b["id"]]


def test_criterio_em_uso_nao_pode_ser_removido(autenticado: TestClient, cenario: Cenario) -> None:
    c = _criar_criterio(autenticado, cenario.projeto.id, "EM_USO")
    autenticado.put(
        f"{API}/checklists/geral/itens",
        json={"projeto_id": str(cenario.projeto.id), "itens": [{"criterio_id": c["id"]}]},
    )
    r = autenticado.delete(f"{API}/criterios/{c['id']}")
    assert r.status_code == 409

    # Fora do checklist, some sem cerimônia.
    autenticado.put(
        f"{API}/checklists/geral/itens",
        json={"projeto_id": str(cenario.projeto.id), "itens": []},
    )
    assert autenticado.delete(f"{API}/criterios/{c['id']}").status_code == 204


def test_ordem_do_checklist_e_preservada(autenticado: TestClient, cenario: Cenario) -> None:
    projeto_id = str(cenario.projeto.id)
    criterios = [_criar_criterio(autenticado, cenario.projeto.id, f"ORD{i}") for i in range(3)]
    esperado = [criterios[2]["id"], criterios[0]["id"], criterios[1]["id"]]

    r = autenticado.put(
        f"{API}/checklists/geral/itens",
        json={"projeto_id": projeto_id, "itens": [{"criterio_id": cid} for cid in esperado]},
    )
    assert [i["criterio_id"] for i in r.json()["itens"]] == esperado


# --------------------------------------------------------- PEB (diretrizes)
# Diretriz e imagem de setorização são `standard` com `tipo` próprio, e não
# tabela nova: `standard.tipo` é coluna de TEXTO, então os dois tipos não
# custaram migration. O que se protege aqui é essa decisão — se alguém trocar o
# campo por um enum do Postgres, estes testes quebram e obrigam a pensar.


@requer_banco
def test_diretriz_do_peb_e_um_standard(autenticado: TestClient, cenario: Cenario) -> None:
    r = autenticado.post(
        f"{API}/standards",
        json={
            "projeto_id": str(cenario.projeto.id),
            "nome": "Sistema de coordenadas",
            "tipo": "diretriz",
            "referencia": "Ponto base compartilhado nos eixos A/0.01.",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["tipo"] == "diretriz"

    # O filtro por tipo é o que separa as diretrizes dos padrões de
    # nomenclatura na mesma tabela — sem ele a tela do PEB listaria os dois.
    so_diretrizes = autenticado.get(
        f"{API}/standards", params={"projeto_id": str(cenario.projeto.id), "tipo": "diretriz"}
    ).json()["itens"]
    assert [s["nome"] for s in so_diretrizes] == ["Sistema de coordenadas"]


@requer_banco
def test_setorizacao_tambem_e_standard(autenticado: TestClient, cenario: Cenario) -> None:
    """`nome` é o setor; a imagem entra depois, por `/standards/{id}/imagem`."""
    r = autenticado.post(
        f"{API}/standards",
        json={"projeto_id": str(cenario.projeto.id), "nome": "ADMIN", "tipo": "setorizacao"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["referencia_url"] is None


@requer_banco
def test_tipo_de_standard_desconhecido_e_recusado(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """O `pattern` do schema é o que restringe, já que a coluna é texto livre.
    Sem ele, um erro de digitação criaria um tipo que nenhuma tela lista."""
    r = autenticado.post(
        f"{API}/standards",
        json={"projeto_id": str(cenario.projeto.id), "nome": "X", "tipo": "diretrizes"},
    )
    assert r.status_code == 422


@requer_banco
def test_remover_standard(autenticado: TestClient, cenario: Cenario) -> None:
    criado = autenticado.post(
        f"{API}/standards",
        json={"projeto_id": str(cenario.projeto.id), "nome": "Some", "tipo": "diretriz"},
    ).json()

    assert autenticado.delete(f"{API}/standards/{criado['id']}").status_code == 204
    assert autenticado.get(f"{API}/standards/{criado['id']}").status_code == 404


@requer_banco
def test_remover_nomenclatura_nao_apaga_a_disciplina(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """A disciplina existe independentemente do padrão de nome usado nela.

    O CONTRATO MUDOU COM A LIXEIRA (migration 0006) e este teste foi reescrito
    para o novo. Antes, apagar o padrão era um DELETE e o `ON DELETE SET NULL`
    zerava `disciplina.nomenclatura_id`. Com remoção reversível a linha
    continua no banco — a FK nunca dispara — e o vínculo é PRESERVADO.

    Isso é melhor, e é o ponto do teste agora: quem removeu o padrão por engano
    restaura e a disciplina volta a apontar para ele, sem ter de refazer a
    ligação em cada uma. O que se garante aqui é que a disciplina sobrevive e
    que o padrão sai de vista enquanto está na lixeira.
    """
    padrao = autenticado.post(
        f"{API}/standards",
        json={
            "projeto_id": str(cenario.projeto.id),
            "nome": "Nomenclatura de arquivos",
            "tipo": "nomenclatura",
        },
    ).json()
    disciplina = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(cenario.projeto.id),
            "macro": "S",
            "disc": "SITE",
            "sub": "NONE",
            "nomenclatura_id": padrao["id"],
        },
    ).json()

    assert autenticado.delete(f"{API}/standards/{padrao['id']}").status_code == 204

    sobreviveu = autenticado.get(f"{API}/disciplinas/{disciplina['id']}")
    assert sobreviveu.status_code == 200, "apagar o padrão levou a disciplina junto"
    # O vínculo FICA: é o que torna a restauração completa em vez de deixar as
    # disciplinas órfãs de um padrão que voltou.
    assert sobreviveu.json()["nomenclatura_id"] == padrao["id"]
    # E o padrão some das listas — quem esconde é a policy de RLS, não um
    # filtro na rota.
    assert autenticado.get(f"{API}/standards/{padrao['id']}").status_code == 404
