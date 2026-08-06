"""Autorização por papel e por permissão fina (plano técnico, seção 5)."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.models.enums import PERMISSOES_POR_PAPEL, PapelUsuario
from tests.conftest import API, Cenario, requer_banco

pytestmark = requer_banco


def test_cliente_nunca_toca_a_api_interna(client: TestClient, cenario: Cenario) -> None:
    """O papel `cliente` só existe para o portal — nem com token válido entra."""
    headers = cenario.headers(papel=PapelUsuario.CLIENTE, permissoes=[])
    for rota in ("/projetos", "/empresas", "/usuarios", "/criterios", "/disciplinas"):
        r = client.get(f"{API}{rota}", headers=headers)
        assert r.status_code == 403, rota
        assert "portal" in r.json()["detail"]


def test_leitura_exige_ver_painel(client: TestClient, cenario: Cenario) -> None:
    headers = cenario.headers(papel=PapelUsuario.LEITOR, permissoes=["ver_relatorios"])
    r = client.get(f"{API}/projetos", headers=headers)
    assert r.status_code == 403
    assert "ver_painel" in r.json()["detail"]


def test_lista_vazia_de_permissoes_usa_o_padrao_do_papel(
    client: TestClient, cenario: Cenario
) -> None:
    """Comportamento declarado no cadastro: sem lista própria, valem as
    permissões padrão do papel — não "nenhuma permissão"."""
    headers = cenario.headers(papel=PapelUsuario.LEITOR, permissoes=[])
    assert client.get(f"{API}/projetos", headers=headers).status_code == 200


def test_escrita_de_cadastro_exige_admin_cadastro(
    client: TestClient, cenario: Cenario
) -> None:
    """Auditor lê o painel mas não mexe no cadastro."""
    headers = cenario.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel", "executar"])

    assert client.get(f"{API}/projetos", headers=headers).status_code == 200

    r = client.post(f"{API}/projetos", json={"codigo": "NOPE", "nome": "x"}, headers=headers)
    assert r.status_code == 403
    assert "admin_cadastro" in r.json()["detail"]


def test_biblioteca_exige_editar_biblioteca(client: TestClient, cenario: Cenario) -> None:
    """Quem administra cadastro não edita critério por tabela — são permissões
    distintas, como no protótipo."""
    headers = cenario.headers(
        papel=PapelUsuario.COORDENADOR, permissoes=["ver_painel", "admin_cadastro"]
    )
    r = client.post(
        f"{API}/criterios",
        json={
            "projeto_id": str(cenario.projeto.id),
            "codigo": "X",
            "nome_pt": "a",
            "nome_en": "b",
            "nivel": "modelo",
            "automacao": "manual",
        },
        headers=headers,
    )
    assert r.status_code == 403
    assert "editar_biblioteca" in r.json()["detail"]


def test_listagem_de_usuarios_e_restrita(client: TestClient, cenario: Cenario) -> None:
    headers = cenario.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel"])
    assert client.get(f"{API}/usuarios", headers=headers).status_code == 403


def test_sem_token_e_401_e_nao_403(client: TestClient) -> None:
    assert client.get(f"{API}/projetos").status_code == 401


# ================================================ páginas ocultas por conta
# Elas moram na MESMA coluna `usuario.permissoes`, com o prefixo `oculta:` (ver
# `PREFIXO_PAGINA`, em `models/enums.py`). Os dois testes abaixo são a razão de
# isso ser seguro; sem eles, a economia de uma migration viraria um buraco.


@requer_banco
def test_pagina_oculta_nao_apaga_o_padrao_do_papel(
    autenticado: TestClient, client: TestClient
) -> None:
    """A ARMADILHA, e por que `_permissoes()` filtra ANTES do `or`.

    Em `deps.py`, `perms = payload.get("perms") or PERMISSOES_POR_PAPEL[papel]`:
    LISTA NÃO VAZIA DESLIGA O PADRÃO DO PAPEL. Uma conta que herda as permissões
    do papel e ganha UMA página oculta passa a ter uma lista de um item — e, sem
    o filtro, perderia todas as permissões reais de uma vez. Esconder uma tela
    tiraria o acesso da pessoa.

    Este teste vai pelo caminho real: cria a conta pela API, faz LOGIN e confere
    o que o token entrega. `cenario.headers()` monta o token à mão e passaria por
    cima justamente do trecho que se quer proteger.
    """
    senha = "senha-de-teste-12345"
    login = f"oculto-{uuid.uuid4().hex[:6]}@spbim.com.br"
    r = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": login,
            "nome": "Conta com página oculta",
            "papel": "auditor",
            "senha": senha,
            # SÓ a página oculta: nenhuma permissão real. É o caso perigoso.
            "permissoes": ["oculta:peb"],
        },
    )
    assert r.status_code == 201, r.text
    # A resposta já chega desmembrada: a página não polui `permissoes`.
    assert r.json()["permissoes"] == []
    assert r.json()["paginas_ocultas"] == ["peb"]

    sessao = client.post(f"{API}/auth/login", json={"login": login, "senha": senha})
    assert sessao.status_code == 200, sessao.text
    usuario = sessao.json()["usuario"]

    # O PADRÃO DO PAPEL CONTINUA VALENDO — é isto que o filtro protege.
    assert set(usuario["permissoes"]) == set(PERMISSOES_POR_PAPEL[PapelUsuario.AUDITOR])
    assert usuario["paginas_ocultas"] == ["peb"]

    # E a permissão continua funcionando de verdade contra a API.
    cabecalho = {"Authorization": f"Bearer {sessao.json()['tokens']['access_token']}"}
    assert client.get(f"{API}/projetos", headers=cabecalho).status_code == 200


@requer_banco
def test_pagina_oculta_nunca_autoriza(autenticado: TestClient, client: TestClient) -> None:
    """Uma entrada `oculta:` não satisfaz `requer_permissao` nenhum.

    Ela é filtrada no funil (`_permissoes`) e nunca entra no token, então não há
    string que um `requer_permissao` possa casar. O teste tenta o pior caso:
    esconder a tela de cadastro não pode virar permissão de cadastro.
    """
    senha = "senha-de-teste-12345"
    login = f"oculto2-{uuid.uuid4().hex[:6]}@spbim.com.br"
    r = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": login,
            "nome": "Leitor com telas ocultas",
            "papel": "leitor",
            "senha": senha,
            "permissoes": ["ver_painel", "oculta:membros", "oculta:criterios"],
        },
    )
    assert r.status_code == 201, r.text

    sessao = client.post(f"{API}/auth/login", json={"login": login, "senha": senha})
    cabecalho = {"Authorization": f"Bearer {sessao.json()['tokens']['access_token']}"}

    # Lê o painel (tem `ver_painel`) e NÃO mexe no cadastro — as duas telas
    # escondidas não viraram poder nenhum, nem para mais nem para menos.
    assert client.get(f"{API}/projetos", headers=cabecalho).status_code == 200
    negado = client.post(f"{API}/projetos", json={"codigo": "X", "nome": "x"}, headers=cabecalho)
    assert negado.status_code == 403
    assert "admin_cadastro" in negado.json()["detail"]


def test_admin_e_super_admin_nao_tem_o_mesmo_conjunto() -> None:
    """`admin_total` é o que separa os dois papéis — e antes NÃO havia separação.

    `PERMISSOES_POR_PAPEL[ADMIN]` e `[COORDENADOR]` eram tuplas idênticas de sete
    itens, e as seis telas do painel administrativo exigiam a mesma
    `admin_cadastro`: "Admin" e "Super admin" seriam dois rótulos para a mesma
    coisa. Este teste existe para que voltar a igualá-los seja uma decisão.

    Não precisa de banco: é sobre a tabela de papéis.
    """
    super_admin = set(PERMISSOES_POR_PAPEL[PapelUsuario.ADMIN])
    admin = set(PERMISSOES_POR_PAPEL[PapelUsuario.COORDENADOR])

    assert admin < super_admin, "o Admin deixou de ser um subconjunto PRÓPRIO do Super admin"
    assert super_admin - admin == {"admin_total"}
    # O Admin continua entrando no painel: é a outra metade da promessa.
    assert "admin_cadastro" in admin


@requer_banco
def test_so_o_super_admin_muda_a_organizacao(client: TestClient, cenario: Cenario) -> None:
    """A tela que a permissão nova guarda, exercitada pelos dois lados.

    É a ÚNICA do painel com `admin_total`; as outras cinco seguem em
    `admin_cadastro`. Se um dia outra entrar no clube, é este teste que diz
    quantas eram.
    """
    admin = cenario.headers(papel=PapelUsuario.COORDENADOR, permissoes=["admin_cadastro"])
    negado = client.patch(f"{API}/organizacao", json={"nome": "Renomeada"}, headers=admin)
    assert negado.status_code == 403
    assert "admin_total" in negado.json()["detail"]

    # E o cadastro comum continua aberto para ele — é o que o papel promete.
    assert client.get(f"{API}/usuarios", headers=admin).status_code == 200

    super_admin = cenario.headers(
        papel=PapelUsuario.ADMIN, permissoes=["admin_cadastro", "admin_total"]
    )
    ok = client.patch(f"{API}/organizacao", json={"nome": "Renomeada"}, headers=super_admin)
    assert ok.status_code == 200, ok.text


@requer_banco
def test_ninguem_edita_a_propria_conta(autenticado: TestClient, cenario: Cenario) -> None:
    """⚠ NEM TENDO `admin_cadastro` — é o que a permissão NÃO alcança.

    Esta rota edita papel, empresa, situação e permissões: o que decide o que a
    pessoa pode fazer. Errar em si mesmo é o único erro que ninguém desfaz
    sozinho — um super admin que se rebaixa fica esperando outro trazê-lo de
    volta, e numa organização com um admin só não há outro.

    Substituiu duas guardas PARCIAIS que não tinham teste nenhum: "não desativar
    a si mesmo" e "não trocar o próprio papel". Agora é total.
    """
    eu = cenario.admin.id

    for corpo in (
        {"papel": "leitor"},
        {"status": "inativo"},
        {"empresa_id": None},
        {"permissoes": ["ver_painel"]},
    ):
        r = autenticado.patch(f"{API}/usuarios/{eu}", json=corpo)
        assert r.status_code == 409, f"{corpo} passou: {r.text}"
        assert "própria conta" in r.json()["detail"]

    # As telas visíveis pelo mesmo motivo: quem esconde as próprias some com o
    # caminho de volta — a gaveta que as religa está numa delas.
    negado = autenticado.put(f"{API}/usuarios/{eu}/paginas", json={"paginas": ["modelos"]})
    assert negado.status_code == 409, negado.text

    # E A SENHA CONTINUA ABERTA: é o caminho de `Configurações › Segurança`, e
    # trancá-lo deixaria alguém sem como trocar a própria senha.
    trocada = autenticado.put(f"{API}/usuarios/{eu}/senha", json={"senha": "outra-senha-longa-12"})
    assert trocada.status_code == 204, trocada.text


@requer_banco
def test_ninguem_mexe_no_proprio_vinculo(autenticado: TestClient, cenario: Cenario) -> None:
    """A irmã da guarda de conta, do lado do projeto — alterar E remover.

    Trocar o próprio papel no projeto ou sair dele é mexer no que decide o que se
    pode fazer ali, e quem sai precisa de outra pessoa para voltar.
    """
    r = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": str(cenario.admin.id), "papel": "coordenador"},
    )
    assert r.status_code == 201, r.text
    meu = r.json()["id"]

    alterar = autenticado.patch(f"{API}/membros/{meu}", json={"papel": "leitor"})
    assert alterar.status_code == 409, alterar.text
    assert "próprio vínculo" in alterar.json()["detail"]

    sair = autenticado.delete(f"{API}/membros/{meu}")
    assert sair.status_code == 409, sair.text

    # O de OUTRA pessoa continua editável — é o que o `admin_cadastro` é para.
    outra = autenticado.post(
        f"{API}/usuarios",
        json={"login": f"vinculo-{uuid.uuid4().hex[:6]}@spbim.com.br", "papel": "auditor"},
    )
    assert outra.status_code == 201, outra.text
    dela = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": outra.json()["id"], "papel": "auditor"},
    )
    assert dela.status_code == 201, dela.text
    ok = autenticado.patch(f"{API}/membros/{dela.json()['id']}", json={"papel": "leitor"})
    assert ok.status_code == 200, ok.text


@requer_banco
def test_ninguem_renomeia_outra_pessoa(autenticado: TestClient) -> None:
    """O nome é de quem o usa — quem administra mexe em papel, empresa e situação.

    A gaveta desabilita o campo, e este teste é a razão de a guarda existir TAMBÉM
    no servidor: input desabilitado não impede nada de quem chama a rota direto.

    NA CRIAÇÃO continua valendo — ali ainda não há pessoa a quem o nome pertença.
    """
    r = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": f"nome-{uuid.uuid4().hex[:6]}@spbim.com.br",
            "nome": "Nome de Batismo",
            "papel": "auditor",
        },
    )
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    assert r.json()["nome"] == "Nome de Batismo"

    negado = autenticado.patch(f"{API}/usuarios/{uid}", json={"nome": "Renomeado à revelia"})
    assert negado.status_code == 409, negado.text
    assert "Perfil" in negado.json()["detail"]

    # O resto do cadastro dessa pessoa continua editável — é o ponto do papel.
    ok = autenticado.patch(f"{API}/usuarios/{uid}", json={"papel": "leitor", "status": "inativo"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["nome"] == "Nome de Batismo"

    # E mandar o MESMO nome não é alteração: a tela recarrega a lista e reenvia o
    # que leu, e um no-op não pode virar 409 na cara de quem só trocou o papel.
    assert (
        autenticado.patch(
            f"{API}/usuarios/{uid}", json={"nome": "Nome de Batismo", "papel": "auditor"}
        ).status_code
        == 200
    )


@requer_banco
def test_definir_paginas_preserva_as_permissoes(autenticado: TestClient) -> None:
    """`PUT /usuarios/{id}/paginas` troca SÓ as telas.

    É a rota que a gaveta de membro de PROJETO chama. Ela existe justamente para
    o cliente não precisar reenviar as permissões — e é isto que o teste protege:
    se um dia ela passar a sobrescrever a coluna inteira, quem mexer num
    interruptor na tela de membros apagará as permissões da pessoa sem saber.
    """
    r = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": f"paginas-{uuid.uuid4().hex[:6]}@spbim.com.br",
            "papel": "leitor",
            "senha": "senha-de-teste-12345",
            "permissoes": ["ver_painel", "ver_relatorios"],
        },
    )
    assert r.status_code == 201, r.text
    uid = r.json()["id"]

    r = autenticado.put(f"{API}/usuarios/{uid}/paginas", json={"paginas": ["peb", "modelos"]})
    assert r.status_code == 200, r.text
    assert r.json()["paginas_ocultas"] == ["modelos", "peb"]
    # AS PERMISSÕES CONTINUAM LÁ — é o motivo de a rota existir.
    assert set(r.json()["permissoes"]) == {"ver_painel", "ver_relatorios"}

    # E religar tudo não leva as permissões junto.
    r = autenticado.put(f"{API}/usuarios/{uid}/paginas", json={"paginas": []})
    assert r.json()["paginas_ocultas"] == []
    assert set(r.json()["permissoes"]) == {"ver_painel", "ver_relatorios"}


@requer_banco
def test_membro_de_projeto_traz_as_paginas_da_conta(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """A gaveta de membro precisa delas para desenhar os interruptores.

    Vêm da CONTA — é o que faz o aviso daquela gaveta ser obrigatório: mexer ali
    vale em todos os projetos. E vêm SEM as permissões: quem lista membros tem
    `ver_painel`, e mandar a lista de permissões de cada pessoa para aquela tela
    alargaria o que ela enxerga.
    """
    r = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": f"membro-pag-{uuid.uuid4().hex[:6]}@spbim.com.br",
            "papel": "auditor",
            "senha": "senha-de-teste-12345",
            "permissoes": ["ver_painel", "oculta:criterios"],
        },
    )
    assert r.status_code == 201, r.text
    uid = r.json()["id"]

    r = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": uid, "papel": "auditor"},
    )
    assert r.status_code == 201, r.text

    lista = autenticado.get(f"{API}/projetos/{cenario.projeto.id}/membros").json()
    linha = next(m for m in lista if m["usuario_id"] == uid)
    assert linha["usuario_paginas_ocultas"] == ["criterios"]
    # A lista de membros NÃO carrega permissões de ninguém.
    assert "permissoes" not in linha and "usuario_permissoes" not in linha


@requer_banco
def test_pagina_desconhecida_e_recusada(autenticado: TestClient, cenario: Cenario) -> None:
    """Rota que não existe não entra no banco.

    Guardada, ela seria invisível na gaveta — que desenha só as telas que conhece
    — e ficaria lá para sempre, sem caminho pela interface para desligá-la.
    """
    r = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": f"xpto-{uuid.uuid4().hex[:6]}@spbim.com.br",
            "papel": "leitor",
            "senha": "senha-de-teste-12345",
            "permissoes": ["oculta:tela-que-nao-existe"],
        },
    )
    assert r.status_code == 422, r.text
    assert "página desconhecida" in r.text
