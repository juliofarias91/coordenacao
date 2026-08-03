"""A lixeira — remoção reversível (migration 0006).

Um lugar só decide o que é "remover", "restaurar" e "apagar de vez", e as rotas
chamam daqui. Espalhar `obj.deleted_at = now()` por oito endpoints daria oito
lugares para alguém esquecer de um.

O FILTRO NÃO ESTÁ AQUI, e é de propósito: quem esconde as linhas removidas é a
POLICY DE RLS de cada tabela. Nenhuma das 72 rotas precisa lembrar de filtrar —
filtro espalhado por 72 rotas é esquecido numa delas, e o registro apagado
reaparece exatamente onde ninguém esperava.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import set_ver_removidos
from app.models import (
    Apontamento,
    Cliente,
    Contato,
    Criterio,
    Evidencia,
    Projeto,
    ProjetoMembro,
    ReporteErro,
    Standard,
)

# O vocabulário da lixeira: o que a URL diz ↔ a tabela.
#
# A chave é o que aparece na API (`/lixeira/cliente/<id>/restaurar`), e é o
# nome da entidade no singular — não o da classe. Aceitar só estas chaves é o
# que impede alguém de restaurar uma tabela que não tem `deleted_at`.
REMOVIVEIS: dict[str, type[Base]] = {
    # O projeto ENCABEÇA a lista porque é o de maior consequência: ele é o pai
    # de disciplina, modelo, auditoria e não-conformidade (migration 0011).
    "projeto": Projeto,
    "cliente": Cliente,
    "criterio": Criterio,
    "standard": Standard,
    "apontamento": Apontamento,
    "membro": ProjetoMembro,
    "reporte": ReporteErro,
    "contato": Contato,
    "evidencia": Evidencia,
}

# Como cada entidade se apresenta na lista. A lixeira mostra "o quê", não os
# campos — quem restaura precisa reconhecer o item, não auditá-lo.
_ROTULO = {
    "projeto": lambda o: f"{o.codigo} · {o.nome}",
    "cliente": lambda o: o.nome,
    "criterio": lambda o: f"{o.codigo} · {o.nome_pt}",
    "standard": lambda o: f"{o.nome} ({o.tipo})",
    "apontamento": lambda o: o.titulo,
    "membro": lambda o: str(o.usuario_id),
    "reporte": lambda o: o.titulo,
    "contato": lambda o: o.nome or o.email or "—",
    "evidencia": lambda o: o.legenda or o.arquivo_url,
}


def rotulo(tipo: str, obj: object) -> str:
    try:
        return str(_ROTULO[tipo](obj))
    except Exception:  # noqa: BLE001 - rótulo é conveniência, não contrato
        return "—"


def remover(db: Session, obj: Base) -> None:
    """Marca como removido. NÃO apaga — é o que torna a lixeira possível.

    O `set_ver_removidos` em volta do flush NÃO É ZELO: sem ele o próprio
    UPDATE é recusado com "new row violates row-level security policy".

    O motivo custou uma tarde. O Postgres aplica a `USING` da policy de SELECT
    também à LINHA NOVA de um UPDATE — ele não deixa você atualizar uma linha
    para a invisibilidade. Como a nossa policy de SELECT esconde o que tem
    `deleted_at` preenchido, gravar `deleted_at` produz exatamente uma linha
    invisível, e o banco recusa. Separar a policy `FOR ALL` em uma por comando
    (migration 0007) não resolve: quem rejeita é a de SELECT, não a de UPDATE.

    A saída é ligar a visão da lixeira só ao redor deste flush: durante ele a
    linha nova é visível, a gravação passa, e a sessão volta a esconder o
    removido antes de qualquer outra consulta da requisição.

    Idempotente: remover duas vezes não move a data para a frente, senão o
    "removido há 3 dias" da tela mentiria depois de um clique repetido.
    """
    if getattr(obj, "deleted_at", None) is not None:
        return
    obj.deleted_at = datetime.now(UTC)  # type: ignore[attr-defined]
    set_ver_removidos(db, True)
    try:
        db.flush()
    finally:
        set_ver_removidos(db, False)


def restaurar(obj: Base) -> None:
    """Traz de volta. Não precisa do cuidado de `remover`: a linha nova tem
    `deleted_at` nulo, e é visível para a policy de SELECT em qualquer sessão."""
    obj.deleted_at = None  # type: ignore[attr-defined]


def listar_removidos(db: Session, tipo: str | None = None) -> list[tuple[str, Base]]:
    """Tudo o que está na lixeira, mais recente primeiro.

    EXIGE uma sessão com o GUC da lixeira ligado (`get_lixeira_db`); numa
    sessão comum a policy esconde exatamente as linhas que se quer aqui, e o
    resultado seria uma lista sempre vazia.
    """
    achados: list[tuple[str, Base]] = []
    for chave, modelo in REMOVIVEIS.items():
        if tipo and chave != tipo:
            continue
        linhas = db.execute(
            select(modelo).where(modelo.deleted_at.is_not(None))  # type: ignore[attr-defined]
        ).scalars()
        achados.extend((chave, linha) for linha in linhas)
    achados.sort(key=lambda par: par[1].deleted_at, reverse=True)  # type: ignore[attr-defined]
    return achados


def exigir_removivel(db: Session, tipo: str, item_id: uuid.UUID) -> Base | None:
    modelo = REMOVIVEIS.get(tipo)
    if modelo is None:
        return None
    return db.get(modelo, item_id)
