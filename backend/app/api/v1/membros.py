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
from app.models import Empresa, Projeto, ProjetoMembro, Usuario
from app.models.enums import paginas_ocultas
from app.schemas.membro import MembroCreate, MembroOut, MembroUpdate
from app.services import lixeira
from app.services.escopo import conflito, exigir, exigir_projeto, ja_existe

router = APIRouter(tags=["membros"])


DERIVADOS = {
    "usuario_nome",
    "usuario_login",
    "usuario_papel_org",
    "empresa_nome",
    "usuario_status",
    "projeto_codigo",
    "projeto_nome",
    "usuario_paginas_ocultas",
}


def _saida(
    membro: ProjetoMembro,
    usuario: Usuario | None,
    *,
    empresa_nome: str | None = None,
    projeto_codigo: str | None = None,
    projeto_nome: str | None = None,
) -> MembroOut:
    """Monta a resposta com os campos derivados do usuário e do projeto.

    Tudo resolvido AQUI porque a tela lista pessoas, não ids — e resolver no
    servidor evita que o cliente cruze três listas (usuário, empresa, projeto)
    ou faça uma consulta por linha para escrever um nome.
    """
    return MembroOut(
        **{
            **MembroOut.model_validate(membro).model_dump(exclude=DERIVADOS),
            "usuario_nome": usuario.nome if usuario else None,
            "usuario_login": usuario.login if usuario else None,
            "usuario_papel_org": usuario.papel if usuario else None,
            # Da CONTA, não do vínculo — ver o campo em `schemas/membro.py`.
            "usuario_paginas_ocultas": paginas_ocultas(usuario.permissoes) if usuario else [],
            "usuario_status": usuario.status if usuario else None,
            "empresa_nome": empresa_nome,
            "projeto_codigo": projeto_codigo,
            "projeto_nome": projeto_nome,
        }
    )


def _consulta():
    """A consulta base: membro + pessoa + empresa + projeto, num JOIN só.

    `outerjoin` na empresa porque nem todo usuário tem uma — quem é da própria
    SPBIM pode não estar vinculado a empresa nenhuma, e um `join` os sumiria da
    lista em silêncio.
    """
    return (
        select(
            ProjetoMembro,
            Usuario,
            Empresa.nome,
            Projeto.codigo,
            Projeto.nome,
        )
        .join(Usuario, Usuario.id == ProjetoMembro.usuario_id)
        .join(Projeto, Projeto.id == ProjetoMembro.projeto_id)
        .outerjoin(Empresa, Empresa.id == Usuario.empresa_id)
    )


@router.get("/membros", response_model=list[MembroOut])
def listar_todos(
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[MembroOut]:
    """TODOS os vínculos da organização, de todos os projetos.

    É o que a tela "Gerenciar membros" consome: a barra dela lista os projetos
    com a contagem de cada um, e o corpo mostra ou todos ou os de um projeto. Com
    só a rota por projeto, montar aquela barra custaria uma requisição por
    projeto — e a contagem de "Todos os membros" seria uma soma feita no cliente
    sobre N respostas.

    UMA PESSOA EM DOIS PROJETOS SÃO DUAS LINHAS, e é o certo: o papel e a equipe
    são POR PROJETO, então "Leonardo, coordenador, INOVAÇÃO" e "Leonardo, leitor,
    COMERCIAL" são fatos diferentes sobre a mesma pessoa. Colapsá-los obrigaria a
    escolher qual papel mostrar.

    Sem paginação: são vínculos de uma organização, na ordem das pessoas. Quando
    não couber, entra cursor aqui — a rota já é a única que a tela usa.
    """
    linhas = db.execute(_consulta().order_by(Usuario.nome, Usuario.login, Projeto.codigo)).all()
    return [
        _saida(m, u, empresa_nome=emp, projeto_codigo=pcod, projeto_nome=pnome)
        for m, u, emp, pcod, pnome in linhas
    ]


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
        _consulta()
        .where(ProjetoMembro.projeto_id == projeto_id)
        # Por EQUIPE primeiro: a barra desta tela agrupa por equipe, e ordenar no
        # servidor poupa a tela de reordenar o que já veio pronto.
        .order_by(ProjetoMembro.equipe.nulls_last(), Usuario.nome, Usuario.login)
    ).all()
    return [
        _saida(m, u, empresa_nome=emp, projeto_codigo=pcod, projeto_nome=pnome)
        for m, u, emp, pcod, pnome in linhas
    ]


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
        equipe=payload.equipe,
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
