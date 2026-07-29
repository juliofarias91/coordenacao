"""SP-406 · Trilha de auditoria automática.

CA: toda alteração de entidade de negócio registra quem, quando e o diff.

Isto vive num listener do SQLAlchemy, e não espalhado pelos handlers, por um
motivo prático: um registro de trilha que depende de alguém lembrar de
chamá-lo é um registro que vai faltar exatamente no dia em que importa.

O que **não** é registrado, de propósito:

- `trilha_auditoria` (recursão) e `notificacao` (ruído — são efeito, não ato).
- Campos de senha e token, mesmo no diff. A trilha não pode virar um lugar
  onde credencial vaza.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.core.contexto import autor
from app.models import TrilhaAuditoria

# Efeito, não ato: registrar isto encheria a trilha sem contar nada.
NAO_RASTREADAS = {"trilha_auditoria", "notificacao"}

# Nunca entram no diff, em nenhuma circunstância.
CAMPOS_SENSIVEIS = {"senha_hash", "token", "oidc_sub", "aps_client_secret"}

# Colunas que mudam em toda escrita e não dizem nada sobre a intenção.
CAMPOS_RUIDO = {"updated_at", "created_at"}


def _serializar(valor: Any) -> Any:
    """JSONB não guarda UUID, date nem Decimal — converte para texto."""
    if valor is None or isinstance(valor, bool | int | float | str):
        return valor
    if isinstance(valor, list | tuple):
        return [_serializar(v) for v in valor]
    if isinstance(valor, dict):
        return {str(k): _serializar(v) for k, v in valor.items()}
    return str(valor)


def _diff(obj: Any) -> dict[str, Any]:
    """Só o que mudou, no formato `{campo: {de, para}}`."""
    mudancas: dict[str, Any] = {}
    estado = inspect(obj)
    for atributo in estado.attrs:
        nome = atributo.key
        if nome in CAMPOS_SENSIVEIS:
            continue
        if nome in CAMPOS_RUIDO:
            continue
        historico = atributo.history
        if not historico.has_changes():
            continue
        antes = historico.deleted[0] if historico.deleted else None
        depois = historico.added[0] if historico.added else None
        if antes == depois:
            continue
        mudancas[nome] = {"de": _serializar(antes), "para": _serializar(depois)}
    return mudancas


def _snapshot(obj: Any) -> dict[str, Any]:
    """Estado inteiro, usado em criação e remoção."""
    dados: dict[str, Any] = {}
    for coluna in inspect(type(obj)).columns:
        nome = coluna.key
        if nome in CAMPOS_SENSIVEIS or nome in CAMPOS_RUIDO:
            continue
        dados[nome] = _serializar(getattr(obj, nome, None))
    return dados


def _acao_da_lixeira(mudancas: dict[str, Any]) -> str | None:
    """Traduz o UPDATE de `deleted_at` no ato que ele realmente é.

    A LIXEIRA (migration 0006) FEZ A TRILHA PARAR DE DIZER "REMOVEU". Antes dela
    apagar era um DELETE, o objeto caía em `session.deleted` e o listener
    registrava `removeu`. Com remoção reversível o que acontece é um UPDATE de
    uma coluna — o objeto vai para `session.dirty` — e a trilha passou a
    registrar `alterou` com um diff de `deleted_at`. Quem filtrasse o log por
    `acao=removeu` (e a tela de Log tem esse filtro) não via mais nada, e as
    remoções sumiam da leitura exatamente do registro que existe para
    reconstruir decisões depois.

    Só conta como remoção quando `deleted_at` VAI de nulo a preenchido, e como
    restauração no caminho inverso. Um UPDATE que por acaso toque em
    `deleted_at` sem cruzar o nulo continua sendo uma alteração.
    """
    alteracao = mudancas.get("deleted_at")
    if not isinstance(alteracao, dict):
        return None
    antes, depois = alteracao.get("de"), alteracao.get("para")
    if antes is None and depois is not None:
        return "removeu"
    if antes is not None and depois is None:
        return "restaurou"
    return None


def _garantir_id(obj: Any) -> None:
    """Atribui a chave primária antes do INSERT.

    `default=uuid.uuid4` só é avaliado durante o flush, e a trilha é montada
    *antes* dele — sem isto, toda criação entraria sem dizer o que foi criado.
    Atribuir explicitamente resolve, e o valor é o mesmo que iria para o banco.
    """
    if getattr(obj, "id", None) is None and hasattr(obj, "id"):
        obj.id = uuid.uuid4()


def _registrar(session: Session, obj: Any, acao: str, diff: dict[str, Any]) -> None:
    tabela = getattr(obj, "__tablename__", None)
    if tabela is None or tabela in NAO_RASTREADAS:
        return

    # Remover a organização não é um ato *dentro* dela: o registro apontaria
    # para a linha que está desaparecendo e a própria exclusão travaria na
    # chave estrangeira.
    if tabela == "organizacao" and acao == "removeu":
        return

    org_id = getattr(obj, "org_id", None)
    if org_id is None:
        # `organizacao` não tem org_id: ela própria é o tenant.
        org_id = getattr(obj, "id", None) if tabela == "organizacao" else None
    if org_id is None:
        return

    session.add(
        TrilhaAuditoria(
            org_id=org_id,
            usuario_id=autor(),
            entidade=tabela,
            entidade_id=getattr(obj, "id", None),
            acao=acao,
            diff=diff or None,
        )
    )


@event.listens_for(Session, "before_flush")
def _antes_do_flush(session: Session, _contexto, _instancias) -> None:
    """Registra criações, alterações e remoções antes de irem ao banco.

    `before_flush` e não `after_flush`: aqui o histórico dos atributos ainda
    está disponível, e ainda dá para acrescentar as linhas de trilha ao mesmo
    flush — a trilha e o fato que ela descreve entram na mesma transação, ou
    nenhum dos dois entra.
    """
    if not session.new and not session.dirty and not session.deleted:
        return

    novos = [o for o in session.new if not isinstance(o, TrilhaAuditoria)]
    alterados = [o for o in session.dirty if not isinstance(o, TrilhaAuditoria)]
    removidos = [o for o in session.deleted if not isinstance(o, TrilhaAuditoria)]

    for obj in novos:
        _garantir_id(obj)
        _registrar(session, obj, "criou", _snapshot(obj))

    for obj in alterados:
        if not session.is_modified(obj, include_collections=False):
            continue
        mudancas = _diff(obj)
        if not mudancas:
            continue
        # Remoção reversível chega aqui como UPDATE, e é registrada pelo que
        # ela é. O snapshot vai junto porque, na remoção, "o que foi apagado"
        # é a informação que se procura no log — o mesmo motivo pelo qual o
        # DELETE definitivo, logo abaixo, também guarda o estado inteiro.
        da_lixeira = _acao_da_lixeira(mudancas)
        if da_lixeira:
            _registrar(session, obj, da_lixeira, _snapshot(obj))
        else:
            _registrar(session, obj, "alterou", mudancas)

    for obj in removidos:
        _registrar(session, obj, "removeu", _snapshot(obj))
