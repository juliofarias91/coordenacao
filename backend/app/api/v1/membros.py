"""Membros de um projeto — quem participa dele, e com que papel nele.

Até a migration 0004 não havia vínculo entre usuário e projeto: o usuário
pertencia à organização e, opcionalmente, a uma empresa. Isso respondia "quem
tem conta" mas não "quem está no CPQ11", que é a pergunta de quem coordena.

**Estas rotas NÃO autorizam nada.** Registrar alguém aqui não lhe dá acesso, e
não estar aqui não tira. Quem decide continua sendo o `requer_permissao` de
cada rota, sobre as permissões de organização do token. É deliberado — ver a
docstring de `ProjetoMembro`. O que existe aqui é a lista de quem trabalha no
projeto e o papel combinado com cada um.

Ler exige `ver_painel`; mexer exige `admin_cadastro`, como o resto do cadastro.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models import ProjetoMembro, Usuario
from app.schemas.membro import MembroCreate, MembroOut, MembroUpdate
from app.services import lixeira
from app.services.escopo import conflito, exigir, exigir_projeto, ja_existe

router = APIRouter(tags=["membros"])


def _saida(membro: ProjetoMembro, usuario: Usuario | None) -> MembroOut:
    """Monta a resposta com os campos derivados do usuário.

    O usuário chega junto porque a tela lista pessoas, não ids — e resolvê-lo
    aqui evita que o cliente cruze duas listas, ou faça uma consulta por linha.
    """
    return MembroOut(
        **{
            **MembroOut.model_validate(membro).model_dump(
                exclude={"usuario_nome", "usuario_login", "usuario_papel_org"}
            ),
            "usuario_nome": usuario.nome if usuario else None,
            "usuario_login": usuario.login if usuario else None,
            "usuario_papel_org": usuario.papel if usuario else None,
        }
    )


@router.get("/projetos/{projeto_id}/membros", response_model=list[MembroOut])
def listar(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[MembroOut]:
    exigir_projeto(db, projeto_id)
    # JOIN e não uma consulta por membro: a lista é pequena, mas N+1 numa tela
    # que abre a cada troca de projeto se acumula sem que ninguém perceba.
    linhas = db.execute(
        select(ProjetoMembro, Usuario)
        .join(Usuario, Usuario.id == ProjetoMembro.usuario_id)
        .where(ProjetoMembro.projeto_id == projeto_id)
        .order_by(Usuario.nome, Usuario.login)
    ).all()
    return [_saida(m, u) for m, u in linhas]


@router.post(
    "/projetos/{projeto_id}/membros",
    response_model=MembroOut,
    status_code=status.HTTP_201_CREATED,
)
def adicionar(
    projeto_id: uuid.UUID,
    payload: MembroCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> MembroOut:
    exigir_projeto(db, projeto_id)
    # `exigir` passa pelo RLS: um usuário de outra organização simplesmente não
    # existe daqui e vira 404, não 403 — dizer "proibido" já entregaria que o
    # id corresponde a alguém em algum lugar.
    usuario = exigir(db, Usuario, payload.usuario_id, "usuário")

    duplicado = select(ProjetoMembro).where(
        ProjetoMembro.projeto_id == projeto_id,
        ProjetoMembro.usuario_id == payload.usuario_id,
    )
    if ja_existe(db, duplicado):
        raise conflito("esta pessoa já é membro do projeto")

    membro = ProjetoMembro(
        org_id=user.org_id,
        projeto_id=projeto_id,
        usuario_id=payload.usuario_id,
        papel=payload.papel,
        funcao=payload.funcao,
    )
    db.add(membro)
    db.flush()
    return _saida(membro, usuario)


@router.patch("/membros/{membro_id}", response_model=MembroOut)
def atualizar(
    membro_id: uuid.UUID,
    payload: MembroUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> MembroOut:
    membro = exigir(db, ProjetoMembro, membro_id, "membro")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(membro, campo, valor)
    db.flush()
    return _saida(membro, db.get(Usuario, membro.usuario_id))


@router.delete("/membros/{membro_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    membro_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    """Tira a pessoa do projeto. NÃO apaga a conta dela nem o que ela auditou.

    O histórico vive nas auditorias assinadas e na trilha, que têm vida própria
    — sair de um projeto não pode reescrever o que já foi decidido nele.
    """
    lixeira.remover(db, exigir(db, ProjetoMembro, membro_id, "membro"))
    db.flush()
