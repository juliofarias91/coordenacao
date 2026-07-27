"""Seed mínimo — SP-002 · CA: 1 organização, 1 projeto.

    python -m scripts.seed

Idempotente: rodar de novo não duplica nada. Vai além do mínimo em um ponto
só — cria o usuário admin, sem o qual não há como entrar na plataforma.
O restante do cadastro (empresas, disciplinas, critérios) é a Fase 1.
"""

from __future__ import annotations

import os
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AuthSessionLocal
from app.models import NomenclaturaPadrao, Organizacao, Projeto, Usuario
from app.models.enums import PapelUsuario

ORG_SLUG = "spbim"
ORG_NOME = "SPBIM"
PROJETO_CODIGO = "CPQ11"

# Segmentos de PROJETO-MACRO-DISC-SUB-SETOR-SW (especificação, seção 2.1).
# `vals` vazio = segmento livre, só precisa existir.
SEGMENTOS = [
    {"k": "PROJETO", "vals": [PROJETO_CODIGO]},
    {"k": "MACRO", "vals": ["A", "C", "M", "S"]},
    {"k": "DISC", "vals": []},
    {"k": "SUB", "vals": []},
    {"k": "SETOR", "vals": []},
    {"k": "SW", "vals": ["R22", "R24", "RX3"]},
]


def main() -> int:
    admin_login = os.environ.get("SEED_ADMIN_LOGIN", "julio@spbim.com.br")
    admin_senha = os.environ.get("SEED_ADMIN_SENHA")
    if not admin_senha:
        print(
            "Defina SEED_ADMIN_SENHA antes de rodar o seed.\n"
            "  PowerShell: $env:SEED_ADMIN_SENHA='...'; python -m scripts.seed",
            file=sys.stderr,
        )
        return 1

    with AuthSessionLocal() as db:
        org = db.execute(
            select(Organizacao).where(Organizacao.slug == ORG_SLUG)
        ).scalar_one_or_none()
        if org is None:
            org = Organizacao(nome=ORG_NOME, slug=ORG_SLUG)
            db.add(org)
            db.flush()
            print(f"organizacao criada: {org.nome} ({org.id})")
        else:
            print(f"organizacao já existia: {org.nome} ({org.id})")

        projeto = db.execute(
            select(Projeto).where(
                Projeto.org_id == org.id, Projeto.codigo == PROJETO_CODIGO
            )
        ).scalar_one_or_none()
        if projeto is None:
            projeto = Projeto(
                org_id=org.id,
                codigo=PROJETO_CODIGO,
                nome="CPQ11 — Data Center",
                cliente="Microsoft",
                coordenacao="SPBIM",
                bep_ref="A5.3.2 · Construction BEP",
                status="ativo",
            )
            db.add(projeto)
            db.flush()
            print(f"projeto criado: {projeto.codigo} ({projeto.id})")
        else:
            print(f"projeto já existia: {projeto.codigo} ({projeto.id})")

        nomenclatura = db.execute(
            select(NomenclaturaPadrao).where(NomenclaturaPadrao.projeto_id == projeto.id)
        ).scalar_one_or_none()
        if nomenclatura is None:
            db.add(
                NomenclaturaPadrao(
                    org_id=org.id, projeto_id=projeto.id, segmentos=SEGMENTOS, vigente=True
                )
            )
            print("padrão de nomenclatura criado")

        usuario = db.execute(
            select(Usuario).where(Usuario.org_id == org.id, Usuario.login == admin_login)
        ).scalar_one_or_none()
        if usuario is None:
            db.add(
                Usuario(
                    org_id=org.id,
                    login=admin_login,
                    nome="Administrador SPBIM",
                    senha_hash=hash_password(admin_senha),
                    papel=PapelUsuario.ADMIN,
                    status="ativo",
                    idioma="pt",
                )
            )
            print(f"usuário admin criado: {admin_login}")
        else:
            print(f"usuário admin já existia: {admin_login}")

        db.commit()

    print("seed concluído.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
