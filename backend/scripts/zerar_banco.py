"""Esvazia o banco e deixa as contas indicadas de pé, para recomeçar do zero.

QUANDO ISTO SE USA: quando se quer montar um projeto do começo, à mão, pela
interface — sem o CPQ11 importado nem sobras de execução de teste no caminho.

**É DESTRUTIVO E NÃO TEM VOLTA.** Não passa pela lixeira: `deleted_at` esconde,
e aqui o ponto é apagar. Por isso a simulação é o padrão e `--aplicar` é
explícito.

O QUE SOBREVIVE, e por quê:

- **As contas indicadas** — é o pedido. `--manter` aceita mais de uma.
- **A organização delas.** `usuario.org_id` é obrigatório: apagar a organização
  levaria o usuário junto, e aí não sobraria conta para entrar. Contas em
  organizações diferentes preservam as duas.
- **Nada mais.** Projetos, modelos, auditorias, empresas, critérios, clientes,
  as outras organizações e os outros usuários saem.

A ORDEM DAS TABELAS É A DAS CHAVES ESTRANGEIRAS — filho antes do pai. É a mesma
de `tests/conftest.py::_TABELAS_LIMPEZA`, e pela mesma razão: fora de ordem, o
Postgres recusa com `IntegrityError` no meio, deixando o banco pela metade.

Uso:

    python -m scripts.zerar_banco --manter fulano@x.com --manter beltrano@x.com
    python -m scripts.zerar_banco --manter fulano@x.com --aplicar
"""

from __future__ import annotations

import sys

from sqlalchemy import delete, func, select

from app.db.session import AuthSessionLocal
from app.models import (
    Apontamento,
    Auditoria,
    ChecklistItem,
    Cliente,
    ComentarioFornecedor,
    Contato,
    ConviteCliente,
    Criterio,
    Disciplina,
    Empresa,
    Evidencia,
    Modelo,
    NaoConformidade,
    NomenclaturaPadrao,
    Notificacao,
    Ocorrencia,
    Penalidade,
    Projeto,
    ProjetoMembro,
    ReporteErro,
    ResultadoCheck,
    Standard,
    TokenAcesso,
    TrilhaAuditoria,
    Usuario,
    VersaoModelo,
)

# Filho antes do pai. `Usuario`, `Empresa`, `Projeto`, `Cliente` e
# `Organizacao` ficam de fora desta lista: são tratados à parte, porque deles
# depende o que sobrevive.
EM_ORDEM = (
    ComentarioFornecedor,
    NaoConformidade,
    Ocorrencia,
    Evidencia,
    ResultadoCheck,
    Auditoria,
    VersaoModelo,
    Modelo,
    ChecklistItem,
    Criterio,
    Disciplina,
    NomenclaturaPadrao,
    Standard,
    Contato,
    Apontamento,
    ConviteCliente,
    ProjetoMembro,
    ReporteErro,
    # Referenciam usuário — precisam sair antes dele.
    TokenAcesso,
    TrilhaAuditoria,
    Notificacao,
    Penalidade,
)


def main() -> None:
    logins = [
        sys.argv[i + 1].strip().lower()
        for i, a in enumerate(sys.argv)
        if a == "--manter" and i + 1 < len(sys.argv)
    ]
    if not logins:
        raise SystemExit(
            "diga quais contas ficam:\n"
            "  python -m scripts.zerar_banco --manter <login> [--manter <login>]\n"
            "  python -m scripts.zerar_banco --manter <login> --aplicar"
        )
    aplicar = "--aplicar" in sys.argv

    db = AuthSessionLocal()
    guardados = db.execute(select(Usuario).where(Usuario.login.in_(logins))).scalars().all()
    achados = {u.login for u in guardados}
    if faltando := [x for x in logins if x not in achados]:
        contas = [u.login for u in db.execute(select(Usuario)).scalars()]
        raise SystemExit(f"nao achei {faltando}. Contas: {contas}")

    ids = {u.id for u in guardados}
    orgs = {u.org_id for u in guardados}
    print("\nFICAM:")
    for u in guardados:
        print(f"  {u.nome or '(sem nome)'} <{u.login}>")
    print(f"  e {len(orgs)} organizacao(oes): {sorted(str(o) for o in orgs)}\n")

    print("SAI:")
    total = 0
    for T in EM_ORDEM:
        n = db.execute(select(func.count()).select_from(T)).scalar() or 0
        if n:
            print(f"  {T.__tablename__:24} {n:>6}")
        total += n
        if aplicar:
            db.execute(delete(T))

    # Os que precisam de filtro, na ordem em que as chaves estrangeiras permitem.
    outros_usuarios = db.execute(
        select(func.count()).select_from(Usuario).where(Usuario.id.notin_(ids))
    ).scalar() or 0
    print(f"  {'usuario (outros)':24} {outros_usuarios:>6}")
    total += outros_usuarios
    if aplicar:
        db.execute(delete(Usuario).where(Usuario.id.notin_(ids)))

    for T in (Empresa, Projeto, Cliente):
        n = db.execute(select(func.count()).select_from(T)).scalar() or 0
        if n:
            print(f"  {T.__tablename__:24} {n:>6}")
        total += n
        if aplicar:
            db.execute(delete(T))

    # As organizações das contas guardadas NÃO saem — ver o cabeçalho.
    from app.models import Organizacao

    outras_orgs = db.execute(
        select(func.count()).select_from(Organizacao).where(Organizacao.id.notin_(orgs))
    ).scalar() or 0
    print(f"  {'organizacao (outras)':24} {outras_orgs:>6}")
    total += outras_orgs
    if aplicar:
        db.execute(delete(Organizacao).where(Organizacao.id.notin_(orgs)))
        db.commit()

    print(f"\n  {'TOTAL':24} {total:>6} linhas")
    print(f"\n{'APAGADO.' if aplicar else 'SIMULACAO — nada foi apagado. Use --aplicar.'}\n")


if __name__ == "__main__":
    main()
