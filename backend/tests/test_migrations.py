"""O que toda migration precisa respeitar, verificado no código-fonte delas.

POR QUE ESTE ARQUIVO EXISTE. O papel da aplicação (`APP_DB_USER`) é criado pelo
PROVISIONAMENTO, nunca por uma migration: ele não é dono de nada e existe para
ficar sujeito ao RLS. Consequência: há bancos legítimos onde ele ainda não
existe — o `alembic upgrade head` que o CI roda a partir da imagem é um, e um
`docker compose up` num Postgres recém-criado é outro. Por isso todo `GRANT`
fica atrás de uma consulta a `pg_roles`.

Cinco migrations acertaram isso (0001, 0003, 0004, 0005, 0010) e a 0012 não —
apesar de o comentário dela dizer "é o mesmo que a 0001 faz para as demais". O
sintoma não foi um teste vermelho: foi o job "A imagem sobe e responde"
morrendo com `role "spbim_app" does not exist`, com o schema inteiro aplicado e
a migração parando na décima segunda. A divergência estava no repositório desde
30/07 e nada aqui a via.

Não precisa de banco: lê os arquivos e olha a árvore sintática.

A ÁRVORE E NÃO UMA REGEX porque quatro migrations trazem a palavra num
comentário ("Sem RLS nem GRANT novos: a coluna entra numa tabela que já tem os
dois"), e comentário não é código — o `ast` os descarta de graça.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

# backend/tests/test_migrations.py -> tests -> backend
VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

# O nome da variável faz parte do padrão que se está trancando. Uma guarda
# escrita com outro nome reprova aqui de propósito: o que se quer é que as
# dezesseis migrations se pareçam umas com as outras, e não que cada uma
# invente a sua maneira de perguntar a mesma coisa ao `pg_roles`.
GUARDA = "role_exists"

ARQUIVOS = sorted(p for p in VERSOES.glob("[0-9]*.py"))


def _e_execute(no: ast.Call) -> bool:
    """`op.execute(...)` — e não qualquer chamada que carregue a palavra."""
    return isinstance(no.func, ast.Attribute) and no.func.attr == "execute"


def _emite_grant(no: ast.Call) -> bool:
    """Algum argumento é um SQL de GRANT.

    `ast.walk` sobre o argumento e não `isinstance(arg, ast.Constant)` porque a
    forma usada é sempre f-string (`f"GRANT ... TO {app_user}"`), que na árvore
    é um `JoinedStr` com o texto em pedaços.
    """
    return any(
        isinstance(pedaco, ast.Constant)
        and isinstance(pedaco.value, str)
        and "GRANT " in pedaco.value.upper()
        for arg in no.args
        for pedaco in ast.walk(arg)
    )


def _grants_sem_guarda(fonte: str) -> list[int]:
    """As linhas dos GRANTs que rodam sem ninguém ter perguntado ao `pg_roles`.

    A proteção é HERDADA para baixo: o `if role_exists:` pode envolver um `for`
    com vários GRANTs dentro, que é a forma da 0012. O `else` não herda nada —
    ele é justamente o ramo em que o papel não existe.
    """
    achados: list[int] = []

    def protege(teste: ast.expr) -> bool:
        return any(isinstance(n, ast.Name) and n.id == GUARDA for n in ast.walk(teste))

    def desce(no: ast.AST, protegido: bool) -> None:
        if isinstance(no, ast.If):
            for filho in no.body:
                desce(filho, protegido or protege(no.test))
            for filho in no.orelse:
                desce(filho, protegido)
            return
        if isinstance(no, ast.Call) and _e_execute(no) and _emite_grant(no) and not protegido:
            achados.append(no.lineno)
        for filho in ast.iter_child_nodes(no):
            desce(filho, protegido)

    desce(ast.parse(fonte), False)
    return achados


def test_ha_migrations_para_conferir() -> None:
    """Se o glob parar de achar arquivo, os testes abaixo passam sem ver nada."""
    assert ARQUIVOS, f"nenhuma migration encontrada em {VERSOES}"


@pytest.mark.parametrize("arquivo", ARQUIVOS, ids=lambda p: p.stem)
def test_grant_so_roda_com_o_papel_confirmado(arquivo: Path) -> None:
    """Nenhum `GRANT` fora da guarda de `pg_roles`.

    O padrão, copiável de qualquer uma das cinco que já o seguem::

        app_user = settings.app_db_user
        if op.get_context().as_sql:
            role_exists = True  # geração offline (--sql): emite sem consultar
        else:
            role_exists = bool(
                op.get_bind()
                .execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"),
                         {"r": app_user})
                .scalar()
            )
        if role_exists:
            op.execute(f"GRANT ... TO {app_user}")

    O `as_sql` faz parte do padrão e não é detalhe: em geração offline
    (`alembic upgrade --sql`) não há conexão a que perguntar, e sem ele o script
    sairia sem os GRANTs — silenciosamente, que é o pior jeito de um privilégio
    faltar.
    """
    linhas = _grants_sem_guarda(arquivo.read_text(encoding="utf-8"))
    assert not linhas, (
        f"{arquivo.name} emite GRANT sem a guarda `{GUARDA}` "
        f"(linha{'s' if len(linhas) > 1 else ''} {', '.join(map(str, linhas))}).\n"
        "O papel da aplicação vem do provisionamento, não da migration: há banco "
        "legítimo sem ele, e o GRANT direto derruba o `upgrade head` inteiro. "
        "Copie o padrão de 0010_token_de_acesso_e_corte_de_sessao.py."
    )
