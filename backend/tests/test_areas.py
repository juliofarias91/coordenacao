"""As áreas do projeto — os setores da obra (migration 0019).

A área existia em dois lugares e não era definida em nenhum: um `text[]` por
disciplina e uma lista chapada no front com os oito setores do CPQ11. A definição
subiu para o projeto; a disciplina MARCA quais audita.

O que estes testes trancam é o que custa caro reverter sem perceber: que o nome
tem UM dono, que renomear cascateia para quem o guarda em cópia, e que remover
não some com auditoria preenchida.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Auditoria, Disciplina, Standard
from app.models.enums import ChecklistTipo
from tests.conftest import API, Cenario, CenarioAuditavel, requer_banco

pytestmark = requer_banco


def _areas(autenticado: TestClient, projeto_id: uuid.UUID) -> list[dict]:
    r = autenticado.get(f"{API}/projetos/{projeto_id}/areas")
    assert r.status_code == 200, r.text
    return r.json()


def _criar(autenticado: TestClient, projeto_id: uuid.UUID, nome: str):
    return autenticado.post(f"{API}/projetos/{projeto_id}/areas", json={"nome": nome})


# ------------------------------------------------------------- o básico
def test_area_nasce_no_projeto_e_aparece_na_lista(
    autenticado: TestClient, cenario: Cenario
) -> None:
    assert _criar(autenticado, cenario.projeto.id, "ADMIN").status_code == 201
    assert _criar(autenticado, cenario.projeto.id, "COLO1").status_code == 201

    assert [a["nome"] for a in _areas(autenticado, cenario.projeto.id)] == ["ADMIN", "COLO1"]

    # E saem no projeto: é de lá que a aba de disciplinas e o PEB leem a lista.
    corpo = autenticado.get(f"{API}/projetos/{cenario.projeto.id}").json()
    assert corpo["areas"] == ["ADMIN", "COLO1"]


def test_area_repetida_e_recusada_mesmo_com_outra_caixa(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """'Colo1' e 'COLO1' seriam DUAS colunas na matriz para o mesmo lugar da
    obra — que é o defeito que a lista do projeto veio resolver."""
    assert _criar(autenticado, cenario.projeto.id, "COLO1").status_code == 201

    r = _criar(autenticado, cenario.projeto.id, "colo1")
    assert r.status_code == 409
    assert "COLO1" in r.json()["detail"]


def test_espaco_do_meio_e_colapsado(autenticado: TestClient, cenario: Cenario) -> None:
    """'TORRE  A' e 'TORRE A' só se distinguem contando espaços na tela."""
    assert _criar(autenticado, cenario.projeto.id, "  TORRE   A ").status_code == 201
    assert [a["nome"] for a in _areas(autenticado, cenario.projeto.id)] == ["TORRE A"]


# ------------------------------------------------- a disciplina só MARCA
def test_disciplina_so_marca_area_definida_no_projeto(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """É o que dá dente à definição.

    Sem isto a lista do projeto seria sugestão, e a disciplina continuaria
    podendo inventar um setor que não existe em lugar nenhum — o estado de antes
    da 0019, em que a matriz ganhava uma coluna por erro de digitação.
    """
    payload = {
        "projeto_id": str(cenario.projeto.id),
        "macro": "C",
        "disc": "STRC",
        "sub": "STEEL",
        "areas": ["COLO1"],
    }
    r = autenticado.post(f"{API}/disciplinas", json=payload)
    assert r.status_code == 409
    assert "COLO1" in r.json()["detail"]

    assert _criar(autenticado, cenario.projeto.id, "COLO1").status_code == 201
    assert autenticado.post(f"{API}/disciplinas", json=payload).status_code == 201


def test_a_caixa_gravada_e_a_do_projeto(autenticado: TestClient, cenario: Cenario) -> None:
    """Quem manda 'colo1' está falando da COLO1 do projeto. Gravar a caixa do
    pedido reintroduziria a divergência pela porta dos fundos."""
    _criar(autenticado, cenario.projeto.id, "COLO1")

    r = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(cenario.projeto.id),
            "macro": "C",
            "disc": "STRC",
            "sub": "STEEL",
            "areas": ["colo1"],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["areas"] == ["COLO1"]


def test_patch_sem_areas_nao_mexe_nelas(autenticado: TestClient, cenario: Cenario) -> None:
    """`exclude_unset`: campo ausente é "não mexa".

    Importa porque as disciplinas anteriores à 0019 podem ter área que o projeto
    não define (o backfill sobe a união, mas alguém pode remover uma depois). Um
    PATCH de nomenclatura não pode falhar por causa disso.
    """
    _criar(autenticado, cenario.projeto.id, "COLO1")
    criada = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(cenario.projeto.id),
            "macro": "C",
            "disc": "STRC",
            "sub": "STEEL",
            "areas": ["COLO1"],
        },
    ).json()

    r = autenticado.patch(f"{API}/disciplinas/{criada['id']}", json={"nome": "Estrutura"})
    assert r.status_code == 200, r.text
    assert r.json()["areas"] == ["COLO1"]


# ------------------------------------------------------------- renomear
def test_renomear_alcanca_a_disciplina(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    _criar(autenticado, cenario.projeto.id, "COLO1")
    criada = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(cenario.projeto.id),
            "macro": "C",
            "disc": "STRC",
            "sub": "STEEL",
            "areas": ["COLO1"],
        },
    ).json()

    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}/areas/COLO1", json={"nome": "TORRE 1"}
    )
    assert r.status_code == 200, r.text
    assert r.json() == ["TORRE 1"]

    db.expire_all()
    disciplina = db.execute(
        select(Disciplina).where(Disciplina.id == uuid.UUID(criada["id"]))
    ).scalar_one()
    assert disciplina.areas == ["TORRE 1"], "sem a cascata a disciplina audita um setor que sumiu"


def test_renomear_alcanca_a_auditoria(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """A parte cara: `auditoria.area` guarda o NOME.

    Sem a cascata, a auditoria de LOD 400/500 continuaria gravada com o nome
    antigo, sumiria da matriz (que passa a varrer o novo) e não haveria tela
    nenhuma por onde reencontrá-la.
    """
    projeto_id = auditavel.projeto.id
    _criar(autenticado, projeto_id, "COLO1")

    auditoria = Auditoria(
        org_id=auditavel.org.id,
        versao_id=auditavel.versao.id,
        checklist=ChecklistTipo.LOD500,
        area="COLO1",
    )
    db.add(auditoria)
    db.commit()

    r = autenticado.patch(
        f"{API}/projetos/{projeto_id}/areas/COLO1", json={"nome": "TORRE 1"}
    )
    assert r.status_code == 200, r.text

    db.expire_all()
    assert db.execute(
        select(Auditoria.area).where(Auditoria.id == auditoria.id)
    ).scalar_one() == "TORRE 1"


def test_renomear_alcanca_a_imagem_do_setor(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """A terceira cópia do nome: o `standard` de tipo `setorizacao`.

    A imagem que explica o setor é casada por NOME, e sem a cascata renomear a
    área a deixava órfã — o arquivo no S3 e nenhuma tela por onde alcançá-lo. O
    defeito é anterior a 07/08/2026; ficava invisível porque definir a área e ver
    a imagem eram seções diferentes. Com as duas na mesma tela (`Setorização`),
    renomear uma linha fazia a imagem sumir da grade logo abaixo.
    """
    _criar(autenticado, cenario.projeto.id, "COLO1")
    imagem = autenticado.post(
        f"{API}/standards",
        json={
            "projeto_id": str(cenario.projeto.id),
            "tipo": "setorizacao",
            "nome": "COLO1",
        },
    )
    assert imagem.status_code == 201, imagem.text

    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}/areas/COLO1", json={"nome": "TORRE 1"}
    )
    assert r.status_code == 200, r.text

    db.expire_all()
    assert db.execute(
        select(Standard.nome).where(Standard.id == uuid.UUID(imagem.json()["id"]))
    ).scalar_one() == "TORRE 1", "sem a cascata a imagem do setor fica órfã"


def test_remover_nao_apaga_a_imagem_do_setor(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """O oposto do de cima, e é decisão: remover NÃO destrói o arquivo.

    A grade varre as áreas do projeto, então o `standard` órfão não aparece em
    tela nenhuma — e se a área voltar com o mesmo nome, a imagem volta com ela.
    Apagá-la seria destruir um arquivo no S3 dentro de um ato que a tela confirma
    como "tirar o setor da lista", sem falar em imagem.
    """
    _criar(autenticado, cenario.projeto.id, "COLO1")
    imagem = autenticado.post(
        f"{API}/standards",
        json={
            "projeto_id": str(cenario.projeto.id),
            "tipo": "setorizacao",
            "nome": "COLO1",
        },
    ).json()

    r = autenticado.delete(f"{API}/projetos/{cenario.projeto.id}/areas/COLO1")
    assert r.status_code == 204, r.text

    db.expire_all()
    assert (
        db.execute(
            select(Standard.nome).where(Standard.id == uuid.UUID(imagem["id"]))
        ).scalar_one()
        == "COLO1"
    )


def test_renomear_so_a_caixa_e_permitido(autenticado: TestClient, cenario: Cenario) -> None:
    """'colo1' → 'COLO1' é justamente a correção que se quer fazer. Barrá-la por
    "já existe" impediria o único uso óbvio da renomeação."""
    _criar(autenticado, cenario.projeto.id, "colo1")
    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}/areas/colo1", json={"nome": "COLO1"}
    )
    assert r.status_code == 200, r.text
    assert r.json() == ["COLO1"]


def test_renomear_para_uma_que_ja_existe_e_recusado(
    autenticado: TestClient, cenario: Cenario
) -> None:
    _criar(autenticado, cenario.projeto.id, "COLO1")
    _criar(autenticado, cenario.projeto.id, "COLO2")
    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}/areas/COLO1", json={"nome": "COLO2"}
    )
    assert r.status_code == 409


# --------------------------------------------------------------- remover
def test_remover_tira_a_area_das_disciplinas(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """Uma disciplina apontando para área que o projeto não define é coluna
    fantasma na matriz — e não haveria mais onde tirá-la."""
    _criar(autenticado, cenario.projeto.id, "ADMIN")
    _criar(autenticado, cenario.projeto.id, "COLO1")
    criada = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(cenario.projeto.id),
            "macro": "C",
            "disc": "STRC",
            "sub": "STEEL",
            "areas": ["ADMIN", "COLO1"],
        },
    ).json()

    r = autenticado.delete(f"{API}/projetos/{cenario.projeto.id}/areas/COLO1")
    assert r.status_code == 204, r.text

    db.expire_all()
    disciplina = db.execute(
        select(Disciplina).where(Disciplina.id == uuid.UUID(criada["id"]))
    ).scalar_one()
    assert disciplina.areas == ["ADMIN"]


def test_remover_area_com_auditoria_e_recusado(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """A auditoria é o dado de origem da plataforma.

    Sumir com a área de uma que já tem linha preenchida deixaria o trabalho no
    banco e fora de toda tela: a matriz varre as áreas das disciplinas, e a
    planilha se abre por área.
    """
    projeto_id = auditavel.projeto.id
    _criar(autenticado, projeto_id, "COLO1")
    db.add(
        Auditoria(
            org_id=auditavel.org.id,
            versao_id=auditavel.versao.id,
            checklist=ChecklistTipo.LOD500,
            area="COLO1",
        )
    )
    db.commit()

    r = autenticado.delete(f"{API}/projetos/{projeto_id}/areas/COLO1")
    assert r.status_code == 409
    assert "COLO1" in r.json()["detail"]

    # E a contagem que a tela usa para avisar ANTES do clique bate.
    linha = next(a for a in _areas(autenticado, projeto_id) if a["nome"] == "COLO1")
    assert linha["auditorias"] == 1


def test_contadores_da_listagem(autenticado: TestClient, cenario: Cenario) -> None:
    _criar(autenticado, cenario.projeto.id, "ADMIN")
    for sub in ("STEEL", "CONCR"):
        autenticado.post(
            f"{API}/disciplinas",
            json={
                "projeto_id": str(cenario.projeto.id),
                "macro": "C",
                "disc": "STRC",
                "sub": sub,
                "areas": ["ADMIN"],
            },
        )

    linha = _areas(autenticado, cenario.projeto.id)[0]
    assert linha == {"nome": "ADMIN", "disciplinas": 2, "auditorias": 0}


# ------------------------------------------------------------- isolamento
def test_area_de_um_projeto_nao_vaza_para_outro(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """A lista é POR PROJETO — foi por não ser que o CPQ11 emprestava os setores
    dele a toda obra nova."""
    from app.models import Projeto

    outro = Projeto(org_id=cenario.org.id, codigo="OUTRO01", nome="Outro", status="ativo")
    db.add(outro)
    db.commit()

    _criar(autenticado, cenario.projeto.id, "COLO1")
    assert _areas(autenticado, outro.id) == []

    r = autenticado.post(
        f"{API}/disciplinas",
        json={
            "projeto_id": str(outro.id),
            "macro": "C",
            "disc": "STRC",
            "sub": "STEEL",
            "areas": ["COLO1"],
        },
    )
    assert r.status_code == 409


def test_escrita_exige_admin_cadastro(autenticado: TestClient, cenario: Cenario) -> None:
    """Definir setor é cadastro, como disciplina e projeto. `ver_painel` lê."""
    so_leitura = {"Authorization": f"Bearer {cenario.token(permissoes=['ver_painel'])}"}

    r = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/areas",
        json={"nome": "COLO1"},
        headers=so_leitura,
    )
    assert r.status_code == 403

    leitura = autenticado.get(f"{API}/projetos/{cenario.projeto.id}/areas", headers=so_leitura)
    assert leitura.status_code == 200


@pytest.mark.parametrize("nome", ["", " ", "COLO,1", "A" * 41])
def test_nome_invalido_e_422(autenticado: TestClient, cenario: Cenario, nome: str) -> None:
    """A vírgula entra na lista porque a tabela de disciplinas lista as áreas com
    `join(', ')` — um nome com vírgula se parte em duas na leitura."""
    assert _criar(autenticado, cenario.projeto.id, nome).status_code == 422
