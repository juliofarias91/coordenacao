"""Autenticação por senha, e o rastro que ela deixa.

Cada teste aqui tranca um comportamento que já esteve errado:

1. **Redefinir senha não aparecia no log.** `CAMPOS_SENSIVEIS` esconde o valor
   de `senha_hash` — e devia —, mas como ele era o único campo do UPDATE o diff
   saía vazio e o `before_flush` descartava o registro. Um admin trocando a
   senha de outra pessoa não deixava rastro nenhum.
2. **O mínimo de senha era 10 no servidor e 8 na tela**, e o 422 do Pydantic
   chegava ao usuário como `[object Object]`.
3. **O mesmo e-mail em duas organizações trancava as duas.** É configuração
   válida do multi-tenant — o UNIQUE é `(org_id, login)` —, e a autenticação
   exigia match único, respondendo "login ou senha inválidos" a quem tinha as
   duas credenciais certas.
4. **O callback do SSO devolvia 500** nesse mesmo caso, porque
   `scalar_one_or_none()` levanta `MultipleResultsFound`.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.v1.auth import _um_por_identidade
from app.core.security import hash_password
from app.models import Organizacao, TrilhaAuditoria, Usuario
from app.models.enums import PapelUsuario
from tests.conftest import API, Cenario, requer_banco


# ==================================================== a regra de senha
# O espelho do mínimo entre back e front mora em `test_contrato.py`, junto das
# outras travas de contrato com o TypeScript.
@requer_banco
def test_senha_curta_devolve_422_com_o_campo_e_a_mensagem(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """Pina o FORMATO que o cliente HTTP precisa saber renderizar.

    `detail` de um 422 é uma lista de objetos, não de strings — e era por isso
    que `String(item)` no `extrairErro` mostrava `[object Object]` na tela.
    """
    r = autenticado.put(f"{API}/usuarios/{cenario.admin.id}/senha", json={"senha": "curta"})
    assert r.status_code == 422, r.text

    detalhe = r.json()["detail"]
    assert isinstance(detalhe, list)
    assert detalhe[0]["loc"] == ["body", "senha"]
    assert "at least" in detalhe[0]["msg"]


# ================================================= o rastro da senha
@requer_banco
def test_trocar_senha_entra_na_trilha(autenticado: TestClient, cenario: Cenario) -> None:
    r = autenticado.put(
        f"{API}/usuarios/{cenario.admin.id}/senha",
        json={"senha": "uma-senha-bem-mais-longa"},
    )
    assert r.status_code == 204, r.text

    linhas = autenticado.get(
        f"{API}/trilha",
        params={
            "entidade": "usuario",
            "entidade_id": str(cenario.admin.id),
            "acao": "trocou_senha",
        },
    ).json()["itens"]

    assert len(linhas) == 1, "redefinir senha tem de deixar exatamente uma linha"
    assert linhas[0]["usuario_id"] == str(cenario.admin.id)
    # A ação é a mensagem inteira: `entidade_id` já diz de quem era a senha, e
    # não há terceira informação que se possa dar sem revelar credencial.
    assert linhas[0]["diff"] is None


@requer_banco
def test_senha_junto_de_outro_campo_conta_o_ato_e_esconde_o_valor(
    db: Session, cenario: Cenario
) -> None:
    """Senha + outro campo no mesmo flush continua sendo `alterou`.

    O diff traz o outro campo por inteiro e a senha como `(oculto)`: o nome
    conta que a credencial foi tocada, o valor nunca sai daqui.
    """
    usuario = db.get(Usuario, cenario.admin.id)
    assert usuario is not None
    usuario.senha_hash = hash_password("outra-senha-bem-longa")
    usuario.nome = "Nome Novo"
    db.commit()

    linha = (
        db.execute(
            select(TrilhaAuditoria)
            .where(
                TrilhaAuditoria.entidade_id == cenario.admin.id,
                TrilhaAuditoria.acao == "alterou",
            )
            .order_by(TrilhaAuditoria.created_at.desc())
        )
        .scalars()
        .first()
    )
    assert linha is not None and linha.diff is not None
    assert linha.diff["nome"] == {"de": "Admin de Teste", "para": "Nome Novo"}
    assert linha.diff["senha_hash"] == {"de": "(oculto)", "para": "(oculto)"}
    assert "argon2" not in str(linha.diff), "o hash não pode vazar para a trilha"


# ============================ o mesmo e-mail em duas organizações
@contextmanager
def _duas_contas_mesmo_email(
    db: Session, org_a: Organizacao, senha_a: str, senha_b: str
) -> Generator[tuple[str, Organizacao]]:
    """Duas contas com o mesmo login, em organizações diferentes.

    Limpa a organização extra na saída: o `_limpar_org` do `cenario` só conhece
    a dele, e a trilha das criações segura a FK da organização se ficar.
    """
    login = f"dobro-{uuid.uuid4().hex[:8]}@spbim.test"
    org_b = Organizacao(nome="Org vizinha", slug=f"viz-{uuid.uuid4().hex[:8]}")
    db.add(org_b)
    db.flush()
    db.add_all(
        [
            Usuario(
                org_id=org_a.id,
                login=login,
                senha_hash=hash_password(senha_a),
                papel=PapelUsuario.AUDITOR,
            ),
            Usuario(
                org_id=org_b.id,
                login=login,
                senha_hash=hash_password(senha_b),
                papel=PapelUsuario.AUDITOR,
            ),
        ]
    )
    db.commit()
    try:
        yield login, org_b
    finally:
        db.execute(delete(Usuario).where(Usuario.login == login))
        db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.org_id == org_b.id))
        db.execute(delete(Organizacao).where(Organizacao.id == org_b.id))
        db.commit()


@requer_banco
def test_login_desempata_pela_senha_quando_o_email_esta_em_duas_orgs(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """Sem perguntar nada: senhas distintas já dizem qual organização é.

    Antes as duas contas ficavam inacessíveis — `_buscar_usuario` devolvia
    `None` por haver dois matches, e a resposta era "login ou senha inválidos"
    para quem tinha a senha certa.
    """
    with _duas_contas_mesmo_email(db, cenario.org, "senha-da-primeira", "senha-da-segunda") as (
        login,
        org_b,
    ):
        r = client.post(f"{API}/auth/login", json={"login": login, "senha": "senha-da-segunda"})
        assert r.status_code == 200, r.text
        assert r.json()["usuario"]["org_id"] == str(org_b.id)

        r = client.post(f"{API}/auth/login", json={"login": login, "senha": "senha-da-primeira"})
        assert r.status_code == 200, r.text
        assert r.json()["usuario"]["org_id"] == str(cenario.org.id)


@requer_banco
def test_mesma_senha_nas_duas_orgs_pede_a_organizacao(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """Aqui a senha não desempata, e escolher em silêncio entraria na errada."""
    igual = "senha-igual-nas-duas"
    with _duas_contas_mesmo_email(db, cenario.org, igual, igual) as (login, org_b):
        r = client.post(f"{API}/auth/login", json={"login": login, "senha": igual})
        assert r.status_code == 409, r.text
        assert "organiza" in r.json()["detail"]

        # Com o slug deixa de haver ambiguidade — e é este 409 que faz a tela
        # de login revelar o campo.
        r = client.post(
            f"{API}/auth/login",
            json={"login": login, "senha": igual, "org": org_b.slug},
        )
        assert r.status_code == 200, r.text
        assert r.json()["usuario"]["org_id"] == str(org_b.id)


@requer_banco
def test_senha_errada_continua_401_e_nao_revela_a_ambiguidade(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """O 409 só alcança quem já provou ser dono de alguma das contas."""
    with _duas_contas_mesmo_email(db, cenario.org, "senha-da-primeira", "senha-da-segunda") as (
        login,
        _,
    ):
        r = client.post(f"{API}/auth/login", json={"login": login, "senha": "nao-e-nenhuma-das-2"})
        assert r.status_code == 401, r.text


@requer_banco
def test_login_inexistente_continua_401(client: TestClient) -> None:
    """Regressão do Argon2 descartável: sem candidato nenhum ainda se paga um.

    É o que impede o tempo de resposta de denunciar quais logins existem.
    """
    r = client.post(
        f"{API}/auth/login",
        json={"login": f"ninguem-{uuid.uuid4().hex[:8]}@spbim.test", "senha": "qualquer-coisa-12"},
    )
    assert r.status_code == 401, r.text


# ======================================================== identidade SSO
@requer_banco
def test_identidade_ambigua_nao_derruba_o_sso(db: Session, cenario: Cenario) -> None:
    """Duas contas com o mesmo e-mail davam `MultipleResultsFound` — um 500.

    Agora a ambiguidade devolve `None` e o callback responde 403 "identidade sem
    usuário correspondente", que é o que ela é: o provedor autenticou alguém e a
    plataforma não sabe quem.
    """
    with _duas_contas_mesmo_email(db, cenario.org, "senha-da-primeira", "senha-da-segunda") as (
        login,
        _,
    ):
        assert _um_por_identidade(db, Usuario.login, login) is None
        # E o caso de um só continua resolvendo.
        achado = _um_por_identidade(db, Usuario.login, cenario.admin.login)
        assert achado is not None and achado.id == cenario.admin.id
