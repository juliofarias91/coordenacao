"""Fase 5 · guardas de produção e importador de projeto (SP-501/502)."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

import pytest
import yaml
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import Settings, verificar_producao
from app.models import (
    ChecklistItem,
    Contato,
    Criterio,
    Disciplina,
    Empresa,
    Modelo,
    NomenclaturaPadrao,
    Organizacao,
    Projeto,
    Standard,
    TrilhaAuditoria,
    Usuario,
)
from scripts.onboarding import Relatorio, importar
from tests.conftest import requer_banco


# ==========================================================================
# SP-501 · a aplicação recusa segredo de desenvolvimento em produção
# ==========================================================================
def _config(**kw: Any) -> Settings:
    base: dict[str, Any] = {
        "app_env": "prod",
        "app_debug": False,
        "jwt_secret": "u" * 60,
        "postgres_password": "senha-forte-de-producao",
        "app_db_password": "outra-senha-forte",
        "s3_access_key": "chave-real",
        "s3_secret_key": "segredo-real",
        "cors_origins": "https://auditoria.spbim.com.br",
        # Zeradas de propósito: sem isto, o `.env` da raiz vaza para dentro do
        # teste. Uma DATABASE_URL preenchida lá desliga a cobrança de
        # POSTGRES_PASSWORD e o teste passa a depender da máquina em que roda.
        "database_url": "",
        "app_database_url": "",
    }
    return Settings(**{**base, **kw})


def test_configuracao_de_producao_completa_passa() -> None:
    assert _config().problemas_de_producao() == []
    verificar_producao(_config())


def test_jwt_padrao_impede_a_aplicacao_de_subir() -> None:
    """O pior dos casos: com o segredo padrão qualquer um forja um token de
    admin. Falhar no start é barulhento e barato."""
    cfg = _config(jwt_secret="troque-este-valor-em-producao")
    assert any("JWT_SECRET" in p for p in cfg.problemas_de_producao())
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        verificar_producao(cfg)


def test_jwt_curto_tambem_reprova() -> None:
    assert any("JWT_SECRET" in p for p in _config(jwt_secret="curto").problemas_de_producao())


@pytest.mark.parametrize(
    ("campo", "valor", "trecho"),
    [
        ("postgres_password", "spbim", "POSTGRES_PASSWORD"),
        ("app_db_password", "spbim_app", "APP_DB_PASSWORD"),
        ("s3_access_key", "minioadmin", "S3"),
        ("s3_secret_key", "minioadmin", "S3"),
        ("app_debug", True, "APP_DEBUG"),
        ("cors_origins", "*", "CORS"),
    ],
)
def test_cada_segredo_de_desenvolvimento_e_apontado(campo, valor, trecho) -> None:
    problemas = _config(**{campo: valor}).problemas_de_producao()
    assert any(trecho in p for p in problemas), problemas


@pytest.mark.parametrize("campo", ["database_url", "app_database_url"])
def test_senha_de_dev_embutida_na_url_e_apontada(campo: str) -> None:
    """Num banco gerenciado a senha vive dentro da URL, e as variáveis avulsas
    deixam de ser lidas — é como o Supabase é configurado. A guarda tem que
    olhar onde a senha realmente está."""
    url = "postgresql+psycopg://spbim_app.ref:spbim_app@aws-1-us-west-2.pooler.supabase.com:6543/postgres"
    cfg = _config(**{campo: url})
    assert any(campo.upper() in p for p in cfg.problemas_de_producao())
    with pytest.raises(RuntimeError, match=campo.upper()):
        verificar_producao(cfg)


@pytest.mark.parametrize("campo", ["database_url", "app_database_url"])
def test_url_gerenciada_com_senha_real_passa(campo: str) -> None:
    url = "postgresql+psycopg://postgres.ref:Xk7-senha-real@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
    assert _config(**{campo: url}).problemas_de_producao() == []


def test_fora_de_producao_nao_reclama() -> None:
    """Em dev os padrões são justamente o que faz o projeto rodar sem
    configuração nenhuma."""
    verificar_producao(Settings(app_env="dev", jwt_secret="troque-este-valor-em-producao"))


def test_docs_desligada_em_producao() -> None:
    assert _config().is_prod is True
    assert Settings(app_env="dev").is_prod is False


# ==========================================================================
# SP-502 · importador de projeto
# ==========================================================================
DEFINICAO_MINIMA = {
    "organizacao": {"nome": "Org Teste", "slug": "PLACEHOLDER"},
    "projeto": {"codigo": "TST01", "nome": "Projeto de teste", "cliente": "Cliente X"},
    "nomenclatura": [
        {"k": "PROJETO", "vals": ["TST01"]},
        {"k": "MACRO", "vals": ["A", "C", "M", "S"]},
        {"k": "SW", "vals": ["R22"], "opcional": True},
    ],
    "standards": [
        {"nome": "Dicionário IFC", "tipo": "vocabulario", "conteudo": {"termos": ["BEAM"]}},
    ],
    "empresas": [
        {"nome": "Construtora A", "tipo": "propria", "papeis": ["trade"]},
        {
            "nome": "Modeladora B",
            "papeis": ["bim"],
            "contratada_por": "Construtora A",
            "contatos": [{"nome": "Fulano", "email": "fulano@b.com"}],
        },
    ],
    "criterios": [
        {
            "codigo": "MODEL_NAME",
            "pt": "Nome do modelo",
            "en": "Model name",
            "nivel": "modelo",
            "automacao": "auto",
        },
        {
            "codigo": "PARAM_4D",
            "pt": "Parâmetros 4D",
            "en": "4D parameters",
            "nivel": "elemento",
            "automacao": "auto",
            "parametro_esperado": "4D_AREA",
        },
        {
            "codigo": "CATEGORIA",
            "pt": "Categoria IFC",
            "en": "IFC category",
            "nivel": "elemento",
            "automacao": "auto",
            "standard": "Dicionário IFC",
        },
    ],
    "checklists": {"geral": ["MODEL_NAME", "PARAM_4D"], "ifc": ["MODEL_NAME", "CATEGORIA"]},
    "disciplinas": [
        {
            "macro": "C",
            "disc": "STRC",
            "sub": "STEEL",
            "projetista": "Modeladora B",
            "checklists": ["geral", "ifc"],
            "areas": ["ADMIN", "COLO1"],
        }
    ],
    "modelos": [
        {
            "codigo": "TST01-C-STRC-STEEL-ADMIN-R22",
            "disciplina": "STRC-STEEL",
            "instaladora": "Construtora A",
            "modeladora": "Modeladora B",
        }
    ],
    "usuarios": [
        {
            "login": "coord@teste.com",
            "nome": "Coord",
            "papel": "coordenador",
            "empresa": "Construtora A",
        }
    ],
}


def _limpar_org(db: Session, org_id: uuid.UUID) -> None:
    for modelo in (
        TrilhaAuditoria, ChecklistItem, Criterio, Modelo, Disciplina,
        NomenclaturaPadrao, Standard, Contato, Usuario, Empresa, Projeto,
    ):
        db.execute(delete(modelo).where(modelo.org_id == org_id))
    db.execute(delete(Organizacao).where(Organizacao.id == org_id))
    db.commit()


@pytest.fixture
def definicao() -> dict:
    import copy

    d = copy.deepcopy(DEFINICAO_MINIMA)
    d["organizacao"]["slug"] = f"teste-{uuid.uuid4().hex[:8]}"
    return d


@pytest.fixture
def importado(db: Session, definicao: dict):
    rel = Relatorio()
    projeto = importar(db, definicao, rel)
    db.commit()
    org_id = projeto.org_id
    try:
        yield projeto, rel
    finally:
        _limpar_org(db, org_id)


@requer_banco
def test_importa_o_projeto_inteiro(importado, db: Session) -> None:
    projeto, rel = importado

    assert projeto.codigo == "TST01"
    assert rel.criados["critério"] == 3
    assert rel.criados["disciplina"] == 1
    assert rel.criados["modelo"] == 1

    # A disciplina amarra projetista, checklists e áreas — é o elo do cadastro.
    disc = db.execute(
        select(Disciplina).where(Disciplina.projeto_id == projeto.id)
    ).scalar_one()
    assert disc.codigo == "STRC-STEEL"
    assert [c.value for c in disc.checklists] == ["geral", "ifc"]
    assert disc.areas == ["ADMIN", "COLO1"]
    assert disc.projetista_id is not None

    # AS ÁREAS SOBEM PARA O PROJETO (migration 0019). O YAML as declara na
    # disciplina que as audita — que é como a coordenação pensa —, e a definição
    # passou a morar no projeto. Sem esta subida, um projeto importado nasceria
    # com disciplinas apontando para áreas que ele não define.
    assert projeto.areas == ["ADMIN", "COLO1"]


@requer_banco
def test_criterio_canonico_entra_em_dois_checklists(importado, db: Session) -> None:
    """MODEL_NAME aparece no Geral e no IFC, e é um registro só."""
    projeto, _ = importado
    model_name = db.execute(
        select(Criterio).where(
            Criterio.projeto_id == projeto.id, Criterio.codigo == "MODEL_NAME"
        )
    ).scalar_one()

    usos = db.execute(
        select(ChecklistItem).where(ChecklistItem.criterio_id == model_name.id)
    ).scalars().all()
    assert len(usos) == 2
    assert {u.checklist.value for u in usos} == {"geral", "ifc"}


@requer_banco
def test_subcontratacao_e_amarrada(importado, db: Session) -> None:
    projeto, _ = importado
    b = db.execute(
        select(Empresa).where(Empresa.org_id == projeto.org_id, Empresa.nome == "Modeladora B")
    ).scalar_one()
    a = db.execute(
        select(Empresa).where(Empresa.org_id == projeto.org_id, Empresa.nome == "Construtora A")
    ).scalar_one()
    assert b.contratada_por == a.id


@requer_banco
def test_reimportar_nao_duplica(importado, db: Session, definicao: dict) -> None:
    """A propriedade que permite tratar o YAML como fonte da configuração:
    editar e reimportar quantas vezes for preciso."""
    projeto, _ = importado

    def contar(modelo) -> int:
        return len(
            db.execute(select(modelo).where(modelo.org_id == projeto.org_id)).scalars().all()
        )

    antes = {m.__name__: contar(m) for m in (Criterio, Empresa, Disciplina, Modelo, ChecklistItem)}

    rel2 = Relatorio()
    importar(db, definicao, rel2)
    db.commit()

    depois = {m.__name__: contar(m) for m in (Criterio, Empresa, Disciplina, Modelo, ChecklistItem)}
    assert antes == depois
    assert rel2.criados == {}, f"a segunda importação criou coisas: {rel2.criados}"


@requer_banco
def test_reimportar_aplica_o_que_mudou(importado, db: Session, definicao: dict) -> None:
    projeto, _ = importado

    definicao["projeto"]["cliente"] = "Cliente Y"
    definicao["criterios"][0]["pt"] = "Nome do arquivo do modelo"

    importar(db, definicao, Relatorio())
    db.commit()
    db.refresh(projeto)

    # O YAML traz o cliente como texto; o importador resolve para a entidade
    # criada na 0003 — mudar o nome no arquivo passa a apontar para outro
    # cliente, não a reescrever o registro do anterior.
    assert projeto.cliente is not None
    assert projeto.cliente.nome == "Cliente Y"
    crit = db.execute(
        select(Criterio).where(
            Criterio.projeto_id == projeto.id, Criterio.codigo == "MODEL_NAME"
        )
    ).scalar_one()
    assert crit.nome_pt == "Nome do arquivo do modelo"


@requer_banco
def test_tirar_criterio_do_checklist_o_remove(
    importado, db: Session, definicao: dict
) -> None:
    """O YAML é a composição inteira do checklist, não um acréscimo."""
    projeto, _ = importado
    definicao["checklists"]["geral"] = ["MODEL_NAME"]

    importar(db, definicao, Relatorio())
    db.commit()

    itens = db.execute(
        select(ChecklistItem).where(
            ChecklistItem.projeto_id == projeto.id,
            ChecklistItem.checklist == "geral",
        )
    ).scalars().all()
    assert len(itens) == 1


@requer_banco
def test_mudar_nomenclatura_arquiva_a_anterior(
    importado, db: Session, definicao: dict
) -> None:
    projeto, _ = importado
    definicao["nomenclatura"].append({"k": "EXTRA", "vals": []})

    importar(db, definicao, Relatorio())
    db.commit()

    padroes = db.execute(
        select(NomenclaturaPadrao).where(NomenclaturaPadrao.projeto_id == projeto.id)
    ).scalars().all()
    assert len(padroes) == 2
    assert sum(1 for p in padroes if p.vigente) == 1


@requer_banco
def test_referencia_faltando_vira_aviso_e_nao_erro(db: Session, definicao: dict) -> None:
    """Um YAML meio preenchido tem de importar o que dá e dizer o que faltou —
    parar no primeiro problema faria o onboarding travar por um typo."""
    definicao["disciplinas"][0]["projetista"] = "Empresa Que Nao Existe"
    definicao["checklists"]["geral"].append("CRITERIO_INEXISTENTE")

    rel = Relatorio()
    projeto = importar(db, definicao, rel)
    db.commit()
    try:
        assert any("Empresa Que Nao Existe" in a for a in rel.avisos)
        assert any("CRITERIO_INEXISTENTE" in a for a in rel.avisos)
        assert rel.criados["disciplina"] == 1, "a disciplina entrou, sem projetista"
    finally:
        _limpar_org(db, projeto.org_id)


@requer_banco
def test_usuario_sem_senha_e_criado_com_aviso(importado, db: Session) -> None:
    """Senha nunca vai no YAML: o arquivo vive no repositório do projeto."""
    projeto, rel = importado
    usuario = db.execute(
        select(Usuario).where(
            Usuario.org_id == projeto.org_id, Usuario.login == "coord@teste.com"
        )
    ).scalar_one()
    assert usuario.senha_hash is None
    assert any("sem senha" in a for a in rel.avisos)


# ==========================================================================
# O YAML do CPQ11 é o modelo de onboarding — precisa continuar válido
# ==========================================================================
def test_definicao_do_cpq11_e_coerente() -> None:
    caminho = Path(__file__).resolve().parents[1] / "scripts" / "dados" / "cpq11.yaml"
    definicao = yaml.safe_load(caminho.read_text(encoding="utf-8"))

    codigos = {c["codigo"].upper() for c in definicao["criterios"]}
    empresas = {e["nome"] for e in definicao["empresas"]}
    standards = {s["nome"] for s in definicao["standards"]}

    for nome, itens in definicao["checklists"].items():
        faltando = [c for c in itens if str(c).upper() not in codigos]
        assert not faltando, f"checklist {nome} referencia critério inexistente: {faltando}"

    disciplinas = set()
    for d in definicao["disciplinas"]:
        disciplinas.add(f"{d['disc'].upper()}-{d['sub'].upper()}")
        assert d["projetista"] in empresas, f"disciplina com empresa inexistente: {d}"
        for c in d["checklists"]:
            assert str(c) in definicao["checklists"], f"disciplina cita checklist inexistente: {c}"

    for m in definicao["modelos"]:
        assert m["disciplina"] in disciplinas, f"modelo com disciplina inexistente: {m}"
        assert m["instaladora"] in empresas
        assert m["modeladora"] in empresas

    for c in definicao["criterios"]:
        if "standard" in c:
            assert c["standard"] in standards, f"critério cita standard inexistente: {c}"

    for u in definicao["usuarios"]:
        assert u["empresa"] in empresas
        assert "senha" not in u, "senha não pode entrar no YAML"

    # A subcontratação do CPQ11 (T2B contratada pela Ideia Drywall) tem de
    # apontar para uma empresa que existe no mesmo arquivo.
    for e in definicao["empresas"]:
        if e.get("contratada_por"):
            assert e["contratada_por"] in empresas


def test_cpq11_tem_criterios_automatizaveis() -> None:
    """Se nenhum critério for `auto`, a Fase 3 não tem o que rodar no piloto."""
    caminho = Path(__file__).resolve().parents[1] / "scripts" / "dados" / "cpq11.yaml"
    definicao = yaml.safe_load(caminho.read_text(encoding="utf-8"))

    automaticos = [c for c in definicao["criterios"] if c.get("automacao") == "auto"]
    assert len(automaticos) >= 10

    com_parametro = [c for c in automaticos if c.get("parametro_esperado")]
    assert len(com_parametro) >= 4, "a auditoria 4D precisa dos parâmetros esperados"
