"""Cria (ou redefine a senha de) um usuário da plataforma.

    $env:USUARIO_LOGIN='alguem@spbim.com.br'
    $env:USUARIO_SENHA='...'
    python -m scripts.criar_usuario --nome "Nome Completo" --papel admin

Existe porque o primeiro acesso é um problema de galinha e ovo: criar usuário
pela API exige um token com `admin_cadastro`, e para ter o token é preciso
entrar. O `scripts/seed.py` resolve isso só para o admin inicial de uma
organização nova — este resolve para qualquer usuário, a qualquer momento, e
é também como se recupera o acesso quando a senha do admin se perdeu.

Idempotente: se o login já existir na organização, **redefine a senha** em vez
de falhar. Papel e nome só são alterados quando informados explicitamente.

A senha vem do ambiente, nunca de argumento de linha de comando: argumento
fica no histórico do shell e na lista de processos da máquina.

Conecta pelo `DATABASE_URL` (dono das tabelas), porque o row-level security
depende de um tenant já escolhido — e aqui ainda estamos descobrindo qual é.
"""

from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AuthSessionLocal
from app.models import Organizacao, Usuario
from app.models.enums import PERMISSOES_POR_PAPEL, PapelUsuario


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria ou redefine um usuário.")
    parser.add_argument("--nome", default=None, help="nome exibido na interface")
    parser.add_argument(
        "--papel",
        default=None,
        choices=[p.value for p in PapelUsuario],
        help="papel na plataforma (padrão: admin, quando o usuário é novo)",
    )
    parser.add_argument(
        "--org",
        default="spbim",
        help="slug da organização (padrão: spbim)",
    )
    args = parser.parse_args()

    login = os.environ.get("USUARIO_LOGIN", "").strip()
    senha = os.environ.get("USUARIO_SENHA", "")
    if not login or not senha:
        print(
            "Defina USUARIO_LOGIN e USUARIO_SENHA no ambiente.\n"
            "  PowerShell:\n"
            "    $env:USUARIO_LOGIN='alguem@spbim.com.br'\n"
            "    $env:USUARIO_SENHA='...'\n"
            "    python -m scripts.criar_usuario --nome 'Nome'",
            file=sys.stderr,
        )
        return 1

    with AuthSessionLocal() as db:
        org = db.execute(
            select(Organizacao).where(Organizacao.slug == args.org)
        ).scalar_one_or_none()
        if org is None:
            existentes = db.execute(select(Organizacao.slug)).scalars().all()
            print(
                f"organização '{args.org}' não existe. "
                f"Disponíveis: {', '.join(existentes) or '(nenhuma)'}",
                file=sys.stderr,
            )
            return 1

        usuario = db.execute(
            select(Usuario).where(Usuario.org_id == org.id, Usuario.login == login)
        ).scalar_one_or_none()

        if usuario is None:
            papel = PapelUsuario(args.papel) if args.papel else PapelUsuario.ADMIN
            usuario = Usuario(
                org_id=org.id,
                login=login,
                nome=args.nome or login.split("@")[0],
                senha_hash=hash_password(senha),
                papel=papel,
                status="ativo",
                idioma="pt",
                # Vazio de propósito: sem lista própria, valem as permissões do
                # papel (PERMISSOES_POR_PAPEL). Gravar a lista aqui congelaria
                # hoje o que o papel concede, e uma permissão nova criada depois
                # não chegaria a este usuário.
                permissoes=[],
            )
            db.add(usuario)
            acao = "criado"
        else:
            usuario.senha_hash = hash_password(senha)
            if args.nome:
                usuario.nome = args.nome
            if args.papel:
                usuario.papel = PapelUsuario(args.papel)
            acao = "já existia — senha redefinida"

        db.commit()
        db.refresh(usuario)

        concedidas = usuario.permissoes or list(PERMISSOES_POR_PAPEL[usuario.papel])
        print(f"\n  {acao}: {usuario.login}")
        print(f"  organização .. {org.nome} ({org.slug})")
        print(f"  papel ........ {usuario.papel.value}")
        print(f"  permissões ... {', '.join(concedidas) or '(nenhuma)'}")
        print(f"  id ........... {usuario.id}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
