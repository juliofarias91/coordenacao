"""SP-301 · validador de nomenclatura — nível 0, sem banco e sem modelo."""

from __future__ import annotations

import pytest

from app.services.automacao import nomenclatura as motor

# PROJETO-MACRO-DISC-SUB-SETOR-SW, com o sufixo de software opcional porque
# ferramentas como o Navisworks entregam sem ele (especificação, seção 2.1).
PADRAO = [
    {"k": "PROJETO", "vals": ["CPQ11"]},
    {"k": "MACRO", "vals": ["A", "C", "M", "S"]},
    {"k": "DISC", "vals": []},
    {"k": "SUB", "vals": []},
    {"k": "SETOR", "vals": []},
    {"k": "SW", "vals": ["R22", "R24", "RX3"], "opcional": True},
]


def test_nome_conforme() -> None:
    v = motor.validar("CPQ11-C-STRC-CONCR-ADMIN-R22", PADRAO)
    assert v.ok, v.mensagem
    assert [s.valor for s in v.segmentos] == ["CPQ11", "C", "STRC", "CONCR", "ADMIN", "R22"]


def test_extensao_e_descartada() -> None:
    """O `.ifc` não faz parte do padrão."""
    assert motor.validar("CPQ11-C-STRC-CONCR-ADMIN-R22.ifc", PADRAO).ok
    assert motor.validar("CPQ11-C-STRC-CONCR-ADMIN-R22.RVT", PADRAO).ok


def test_sufixo_de_software_pode_faltar() -> None:
    """Navisworks entrega sem o sufixo — e isso não é divergência."""
    v = motor.validar("CPQ11-C-STRC-CONCR-A12", PADRAO)
    assert v.ok, v.mensagem


def test_segmento_ausente_reprova_quando_obrigatorio() -> None:
    v = motor.validar("CPQ11-C-STRC", PADRAO)
    assert not v.ok
    faltando = {s.k for s in v.divergencias}
    assert "SUB" in faltando and "SETOR" in faltando
    assert "SW" not in faltando, "SW é opcional"


def test_valor_fora_da_lista_reprova_e_diz_o_que_aceita() -> None:
    v = motor.validar("CPQ11-X-STRC-CONCR-ADMIN-R22", PADRAO)
    assert not v.ok
    macro = next(s for s in v.segmentos if s.k == "MACRO")
    assert not macro.ok
    assert "A, C, M, S" in (macro.motivo or "")


def test_projeto_errado_reprova() -> None:
    v = motor.validar("CPQ12-C-STRC-CONCR-ADMIN-R22", PADRAO)
    assert not v.ok
    assert v.segmentos[0].k == "PROJETO" and not v.segmentos[0].ok


def test_segmento_a_mais_reprova() -> None:
    """Sem isso, 'ARQUIVO-COPIA' passaria por conforme."""
    v = motor.validar("CPQ11-C-STRC-CONCR-ADMIN-R22-COPIA", PADRAO)
    assert not v.ok
    assert any(s.k.startswith("EXTRA") for s in v.divergencias)


def test_a_mensagem_aponta_o_segmento() -> None:
    """Dizer só 'nome inválido' obrigaria o fornecedor a adivinhar."""
    v = motor.validar("CPQ11-X-STRC-CONCR-ADMIN-R22", PADRAO)
    assert "MACRO" in v.mensagem


@pytest.mark.parametrize("nome", ["", "   ", "-", "---"])
def test_nomes_degenerados_nao_quebram(nome: str) -> None:
    assert not motor.validar(nome, PADRAO).ok


def test_exemplo_do_padrao() -> None:
    assert motor.exemplo_do_padrao(PADRAO) == "CPQ11-A-DISC-SUB-SETOR-R22"


def test_padrao_vazio_aceita_qualquer_coisa_sem_segmento() -> None:
    """Padrão sem segmentos: só um nome vazio casa. Evita aprovar tudo por
    engano quando o projeto ainda não configurou nada."""
    assert not motor.validar("QUALQUER-COISA", []).ok
