"""A ficha cadastral do projeto e a remoção reversível dele (migration 0011).

O projeto é o PAI de disciplina, modelo, auditoria e não-conformidade, e foi a
nona entidade a entrar na lixeira justamente por isso: numa plataforma cujo
produto é o histórico de auditoria, remoção irreversível de um projeto inteiro é
a operação mais cara que existe para errar.
"""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Modelo, Projeto
from app.models.enums import PapelUsuario
from tests.conftest import API, Cenario, CenarioAuditavel, requer_banco

pytestmark = requer_banco


# ============================================================ os campos
def test_ficha_grava_e_devolve_os_campos_novos(
    autenticado: TestClient, cenario: Cenario
) -> None:
    corpo = {
        "descricao": "Data center de três pavimentos, estrutura metálica.",
        "endereco": "Rod. dos Bandeirantes, km 32 — Cajamar/SP",
        "data_inicio": "2026-01-15",
        "data_prevista": "2026-12-20",
        "data_conclusao": "2027-02-10",
    }
    r = autenticado.patch(f"{API}/projetos/{cenario.projeto.id}", json=corpo)
    assert r.status_code == 200, r.text
    for campo, valor in corpo.items():
        assert r.json()[campo] == valor

    # E voltam na leitura, não só no eco do PATCH.
    lido = autenticado.get(f"{API}/projetos/{cenario.projeto.id}").json()
    assert lido["data_prevista"] == "2026-12-20"
    assert lido["data_conclusao"] == "2027-02-10"


def test_previsao_e_conclusao_sao_campos_DIFERENTES(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """A separação é o ponto: no mesmo campo, o atraso seria apagado.

    A previsão muda ao longo do contrato; a conclusão acontece uma vez. Guardar
    as duas juntas faz a atualização da previsão sobrescrever exatamente o dado
    que responde "atrasou quanto?".
    """
    autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}",
        json={"data_prevista": "2026-12-20", "data_conclusao": "2027-02-10"},
    )
    # Reprogramar a previsão não pode tocar a conclusão.
    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}", json={"data_prevista": "2027-03-01"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["data_prevista"] == "2027-03-01"
    assert r.json()["data_conclusao"] == "2027-02-10"


def test_data_invalida_e_recusada(autenticado: TestClient, cenario: Cenario) -> None:
    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}", json={"data_inicio": "15/01/2026"}
    )
    assert r.status_code == 422, r.text


def test_limpar_campo_com_null_funciona(autenticado: TestClient, cenario: Cenario) -> None:
    """`exclude_unset` no PATCH: `null` é valor, ausência é "não mexa"."""
    autenticado.patch(f"{API}/projetos/{cenario.projeto.id}", json={"endereco": "Rua X, 1"})
    r = autenticado.patch(f"{API}/projetos/{cenario.projeto.id}", json={"endereco": None})
    assert r.status_code == 200, r.text
    assert r.json()["endereco"] is None


def test_codigo_nao_muda_pelo_patch(autenticado: TestClient, cenario: Cenario) -> None:
    """O código é o 1º segmento da nomenclatura de todo arquivo entregue.

    `ProjetoUpdate` não o declara, e `ESCRITA` recusa campo desconhecido — então
    a tentativa não passa em silêncio: ela falha.
    """
    r = autenticado.patch(f"{API}/projetos/{cenario.projeto.id}", json={"codigo": "OUTRO"})
    assert r.status_code == 422, r.text


# ========================================================== a remoção
def test_remover_manda_para_a_lixeira_e_some_da_listagem(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    r = autenticado.delete(f"{API}/projetos/{cenario.projeto.id}")
    assert r.status_code == 204, r.text

    # Some das listas — e quem esconde é a POLICY DE RLS, não um filtro na
    # rota. É o que garante que nenhuma das outras consultas precise lembrar.
    listados = autenticado.get(f"{API}/projetos").json()["itens"]
    assert all(p["id"] != str(cenario.projeto.id) for p in listados)
    assert autenticado.get(f"{API}/projetos/{cenario.projeto.id}").status_code == 404

    # Mas a LINHA CONTINUA no banco: a sessão privilegiada a enxerga.
    #
    # `expire_all` ANTES de ler, e não é zelo: o `cenario` criou o projeto NESTA
    # sessão, então ele está no identity map com `deleted_at` nulo. Quem gravou
    # a remoção foi a sessão da API, noutra conexão — sem expirar, o `db.get`
    # devolve o objeto em cache e o teste passa a afirmar o contrário do que
    # aconteceu.
    db.expire_all()
    linha = db.get(Projeto, cenario.projeto.id)
    assert linha is not None and linha.deleted_at is not None


def test_projeto_removido_aparece_na_lixeira_e_volta(
    autenticado: TestClient, cenario: Cenario
) -> None:
    autenticado.delete(f"{API}/projetos/{cenario.projeto.id}")

    itens = autenticado.get(f"{API}/lixeira", params={"tipo": "projeto"}).json()
    meu = [i for i in itens if i["id"] == str(cenario.projeto.id)]
    assert len(meu) == 1, "o projeto removido tem de aparecer na lixeira"
    # O rótulo é o que identifica na lista de restauração.
    assert cenario.projeto.codigo in meu[0]["rotulo"]

    r = autenticado.post(f"{API}/lixeira/projeto/{cenario.projeto.id}/restaurar")
    assert r.status_code == 204, r.text
    assert autenticado.get(f"{API}/projetos/{cenario.projeto.id}").status_code == 200


def test_remover_nao_apaga_os_filhos(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """Disciplinas e modelos continuam apontando para o projeto, intactos.

    Some tudo da tela porque as consultas partem do projeto — não porque cada
    linha filha tenha sido marcada. Marcá-las faria a restauração ter de
    adivinhar quais já estavam removidas ANTES, e essa informação não existe.
    """
    autenticado.delete(f"{API}/projetos/{auditavel.projeto.id}")

    modelo = db.get(Modelo, auditavel.modelo.id)
    assert modelo is not None
    assert modelo.deleted_at is None if hasattr(modelo, "deleted_at") else True
    assert modelo.projeto_id == auditavel.projeto.id

    # E ao restaurar, o projeto volta com eles.
    autenticado.post(f"{API}/lixeira/projeto/{auditavel.projeto.id}/restaurar")
    modelos = autenticado.get(
        f"{API}/modelos", params={"projeto_id": str(auditavel.projeto.id)}
    ).json()["itens"]
    assert any(m["id"] == str(auditavel.modelo.id) for m in modelos)


def test_remover_exige_admin_cadastro(client: TestClient, cenario: Cenario) -> None:
    r = client.delete(
        f"{API}/projetos/{cenario.projeto.id}",
        headers=cenario.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel"]),
    )
    assert r.status_code == 403, r.text


def test_remover_duas_vezes_nao_move_a_data(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """Idempotente — senão o "removido há 3 dias" da tela mentiria."""
    autenticado.delete(f"{API}/projetos/{cenario.projeto.id}")
    # Expira ANTES da primeira leitura também — ver a nota em
    # `test_remover_manda_para_a_lixeira`. Sem isto `primeira` sai nula, e a
    # comparação final passa a testar nada.
    db.expire_all()
    primeira = db.get(Projeto, cenario.projeto.id).deleted_at  # type: ignore[union-attr]
    assert primeira is not None

    # A segunda chamada não acha o projeto (a policy o esconde) e devolve 404 —
    # o que já é a proteção. A data não pode ter mudado.
    autenticado.delete(f"{API}/projetos/{cenario.projeto.id}")
    db.expire_all()
    assert db.get(Projeto, cenario.projeto.id).deleted_at == primeira  # type: ignore[union-attr]


def test_a_ficha_nao_vaza_entre_organizacoes(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """O RLS vale para os campos novos como vale para os antigos."""
    autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}", json={"descricao": "segredo do cliente"}
    )
    de_fora = db.execute(
        select(Projeto).where(
            Projeto.descricao == "segredo do cliente", Projeto.org_id != cenario.org.id
        )
    ).scalars().all()
    assert de_fora == []


def test_data_conclusao_sozinha_e_valida(autenticado: TestClient, cenario: Cenario) -> None:
    """Sem previsão registrada, a conclusão ainda vale — a ficha se preenche aos
    poucos, e exigir a previsão para aceitar a conclusão travaria o caso comum
    de cadastrar uma obra que já terminou."""
    r = autenticado.patch(
        f"{API}/projetos/{cenario.projeto.id}", json={"data_conclusao": str(date(2027, 2, 10))}
    )
    assert r.status_code == 200, r.text
    assert r.json()["data_conclusao"] == "2027-02-10"
    assert r.json()["data_prevista"] is None
