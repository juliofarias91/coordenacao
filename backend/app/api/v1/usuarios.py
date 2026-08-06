"""SP-103 · Usuários e permissões.

CA: papéis e permissões finas persistidos; papel `cliente` isolado; status
ativo/inativo respeitado no login.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.core.security import hash_password
from app.models import Empresa, Usuario
from app.models.enums import (
    PERMISSOES,
    PERMISSOES_POR_PAPEL,
    PREFIXO_PAGINA,
    PapelUsuario,
)
from app.schemas.auth import ConviteCriadoOut
from app.schemas.usuario import (
    PaginasUpdate,
    PermissaoOut,
    SenhaUpdate,
    UsuarioCreate,
    UsuarioOut,
    UsuarioUpdate,
)
from app.services import acesso
from app.services.escopo import conflito, exigir, ja_existe

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/permissoes", response_model=list[PermissaoOut])
def catalogo_de_permissoes(
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[PermissaoOut]:
    """Catálogo para a tela de cadastro montar os checkboxes sem hardcode."""
    return [
        PermissaoOut(
            codigo=p,
            papeis_padrao=[papel for papel, perms in PERMISSOES_POR_PAPEL.items() if p in perms],
        )
        for p in PERMISSOES
    ]


@router.get("", response_model=Page[UsuarioOut])
def listar(
    papel: PapelUsuario | None = Query(default=None),
    empresa_id: uuid.UUID | None = Query(default=None),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> Page[UsuarioOut]:
    stmt = select(Usuario)
    if papel is not None:
        stmt = stmt.where(Usuario.papel == papel)
    if empresa_id is not None:
        stmt = stmt.where(Usuario.empresa_id == empresa_id)
    stmt = aplicar_cursor(stmt, Usuario, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, UsuarioOut.model_validate)


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: UsuarioCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> UsuarioOut:
    login = str(payload.login).strip().lower()
    if ja_existe(db, select(Usuario).where(Usuario.login == login)):
        raise conflito(f"já existe usuário {login} nesta organização")

    if payload.empresa_id is not None:
        exigir(db, Empresa, payload.empresa_id, "empresa")

    usuario = Usuario(
        org_id=user.org_id,
        login=login,
        nome=payload.nome,
        # Sem senha = usuário só-SSO. `senha_hash` nulo nunca autentica por senha.
        senha_hash=hash_password(payload.senha) if payload.senha else None,
        papel=payload.papel,
        empresa_id=payload.empresa_id,
        permissoes=payload.permissoes,
        idioma=payload.idioma,
        status=payload.status,
    )
    db.add(usuario)
    db.flush()
    return UsuarioOut.model_validate(usuario)


@router.get("/{usuario_id}", response_model=UsuarioOut)
def obter(
    usuario_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> UsuarioOut:
    return UsuarioOut.model_validate(exigir(db, Usuario, usuario_id, "usuário"))


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def atualizar(
    usuario_id: uuid.UUID,
    payload: UsuarioUpdate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> UsuarioOut:
    usuario = exigir(db, Usuario, usuario_id, "usuário")
    dados = payload.model_dump(exclude_unset=True)

    # Um admin desativando ou rebaixando a si mesmo tranca o cadastro da
    # organização — é um erro caro de desfazer e barato de impedir.
    if usuario.id == user.id:
        if dados.get("status") == "inativo":
            raise conflito("não é possível desativar o próprio usuário")
        if "papel" in dados and dados["papel"] != usuario.papel:
            raise conflito("não é possível alterar o próprio papel")

    # O NOME É DE QUEM O USA (05/08/2026, a pedido). Quem administra define papel,
    # empresa e situação — mas como a pessoa se chama é dela, e ela troca em
    # `Configurações › Perfil`. A tela já desabilita o campo; a guarda está AQUI
    # porque desabilitar um input não impede nada: quem chamar a rota direto
    # continuaria renomeando terceiros.
    #
    # NA CRIAÇÃO CONTINUA VALENDO — ali ainda não há pessoa a quem o nome
    # pertença, e uma conta sem nome é uma linha que ninguém identifica na lista.
    elif "nome" in dados and dados["nome"] != usuario.nome:
        raise conflito("o nome é da própria pessoa: ela o altera em Configurações › Perfil")

    if dados.get("empresa_id") is not None:
        exigir(db, Empresa, dados["empresa_id"], "empresa")

    for campo, valor in dados.items():
        setattr(usuario, campo, valor)
    db.flush()
    return UsuarioOut.model_validate(usuario)


@router.put("/{usuario_id}/paginas", response_model=UsuarioOut)
def definir_paginas(
    usuario_id: uuid.UUID,
    payload: PaginasUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> UsuarioOut:
    """Troca SÓ as telas escondidas desta conta, preservando as permissões.

    ROTA PRÓPRIA, e não `PATCH /usuarios/{id}` com a lista inteira, por uma razão
    de segurança concreta: as duas coisas dividem a coluna `permissoes`, então
    quem quisesse mudar só as telas teria de reenviar as permissões REAIS junto —
    e para isso teria de recebê-las antes. Quem chama daqui é a gaveta de membro
    de PROJETO, que lista pessoas com `ver_painel`; mandar a lista de permissões
    de todo mundo para aquela tela seria alargar o que ela vê para resolver um
    problema de escrita.

    Aqui o cliente manda só as telas. As permissões nunca saem do servidor, e a
    fusão acontece neste corpo — que é o único lugar que precisa conhecer as duas
    metades. Continua exigindo `admin_cadastro`, a mesma barra do `PATCH`.
    """
    usuario = exigir(db, Usuario, usuario_id, "usuário")
    reais = [p for p in usuario.permissoes if not p.startswith(PREFIXO_PAGINA)]
    usuario.permissoes = reais + [f"{PREFIXO_PAGINA}{r}" for r in payload.paginas]
    db.flush()
    return UsuarioOut.model_validate(usuario)


@router.put("/{usuario_id}/senha", status_code=status.HTTP_204_NO_CONTENT)
def definir_senha(
    usuario_id: uuid.UUID,
    payload: SenhaUpdate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Define ou troca a senha.

    Quem administra cadastros troca a de qualquer um; os demais só a própria
    — daí a checagem ficar aqui e não numa guarda de rota.

    ESTA ROTA CONTINUA EXISTINDO, mas o caminho recomendado para dar acesso a
    outra pessoa é `POST /usuarios/{id}/convite`: ali o admin não fica sabendo a
    senha de ninguém. Aqui ele fica — e é por isso que trocar a senha DE OUTRO
    corta as sessões dele: se a razão da troca foi conta comprometida, deixar a
    sessão anterior de pé não resolve nada.
    """
    if usuario_id != user.id and not user.pode("admin_cadastro"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="sem permissão para trocar esta senha"
        )
    usuario = exigir(db, Usuario, usuario_id, "usuário")
    usuario.senha_hash = hash_password(payload.senha)
    if usuario_id != user.id:
        usuario.sessoes_validas_apos = datetime.now(UTC)
    db.flush()


@router.post(
    "/{usuario_id}/convite",
    response_model=ConviteCriadoOut,
    status_code=status.HTTP_201_CREATED,
)
def gerar_convite(
    usuario_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ConviteCriadoOut:
    """Gera o link de definição de senha. **O token só aparece nesta resposta.**

    É o que o admin manda para a pessoa — por e-mail, WhatsApp, o que houver.
    Copiar o link é o mesmo gesto do convite do portal, e por ora é a entrega:
    a plataforma não tem SMTP, e a decisão foi entregar assim agora e ligar o
    e-mail quando houver servidor.

    O QUE ISSO RESOLVE que digitar uma senha no formulário não resolvia: o admin
    não conhece a senha de ninguém, ela não trafega em mensagem, e o primeiro
    acesso passa a existir.

    O `tipo` sai de quem a conta é, não de um parâmetro: usuário que nunca teve
    senha está sendo CONVIDADO (e o convite dura uma semana, porque onboarding
    espera a pessoa achar tempo); usuário que já tinha está REDEFININDO (duas
    horas, porque é resposta a um pedido de agora).
    """
    usuario = exigir(db, Usuario, usuario_id, "usuário")
    tipo = acesso.REDEFINICAO if usuario.senha_hash else acesso.CONVITE
    linha, token = acesso.criar(db, usuario=usuario, tipo=tipo, criado_por=user.id)
    return ConviteCriadoOut(
        token=token,
        # Caminho e não URL: a origem é a do navegador de quem copia, e o
        # servidor não tem como saber por qual domínio a plataforma é acessada.
        # É o mesmo raciocínio do `urlDoPortal` em `components/Convidar.tsx`.
        caminho=f"/definir-senha/{token}",
        tipo=tipo,
        expira_em=linha.expira_em,
        usuario_id=usuario.id,
    )
