"""SP-106 · A organização.

A administração geral: quem é o tenant, quantos projetos, clientes, usuários e
empresas ele tem. Até aqui a organização só nascia pelo `scripts/seed.py` e não
tinha como ser vista nem renomeada pela plataforma.

Não existe `GET /organizacoes` nem `POST /organizacoes` de propósito. Listar
organizações é o que o isolamento multi-tenant existe para impedir, e criar
uma é operação de provisionamento — sai do `seed`, não de uma sessão que já
está autenticada dentro de outro tenant.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models import Cliente, Empresa, Organizacao, Projeto, Usuario
from app.schemas.organizacao import OrganizacaoOut, OrganizacaoUpdate, ResumoOrganizacao
from app.services.escopo import conflito, exigir

router = APIRouter(prefix="/organizacao", tags=["organizacao"])


def _atual(db: Session, user: CurrentUser) -> Organizacao:
    """A organização do token.

    Busca pelo `org_id` do token, não por parâmetro de rota: a organização
    que a sessão pode ver é uma só, e aceitar um id na URL seria convidar a
    tentativa de ler outra.
    """
    return exigir(db, Organizacao, user.org_id, "organização")


@router.get("", response_model=ResumoOrganizacao)
def obter(
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ResumoOrganizacao:
    org = _atual(db, user)

    def contar(modelo: type) -> int:
        return int(db.execute(select(func.count()).select_from(modelo)).scalar_one())

    ativos = int(
        db.execute(
            select(func.count()).select_from(Usuario).where(Usuario.status == "ativo")
        ).scalar_one()
    )

    return ResumoOrganizacao(
        organizacao=OrganizacaoOut.model_validate(org),
        projetos=contar(Projeto),
        clientes=contar(Cliente),
        usuarios=contar(Usuario),
        usuarios_ativos=ativos,
        empresas=contar(Empresa),
    )


@router.patch("", response_model=OrganizacaoOut)
def atualizar(
    payload: OrganizacaoUpdate,
    db: Session = Depends(get_tenant_db),
    # `admin_total` E NÃO `admin_cadastro` (05/08/2026): trocar o nome da
    # organização é mexer na PLATAFORMA, não cadastrar dentro dela. É a única
    # coisa hoje que o `Admin` não faz e o `Super admin` faz — ver `PERMISSOES`.
    user: CurrentUser = Depends(requer_permissao("admin_total")),
) -> OrganizacaoOut:
    org = _atual(db, user)
    dados = payload.model_dump(exclude_unset=True)
    novo_slug = dados.get("slug")

    for campo, valor in dados.items():
        setattr(org, campo, valor)

    # O slug é único no BANCO INTEIRO, não por tenant: é ele que resolve a
    # organização no login, antes de existir token.
    #
    # Por que o banco decide isto, e não um SELECT antes: a sessão roda com
    # row-level security, e a única organização que ela enxerga é a própria.
    # Uma consulta de unicidade daqui nunca acharia o slug do vizinho e
    # aprovaria sempre — a colisão só apareceria no UPDATE, como 500. Deixar a
    # constraint falar também fecha a corrida entre dois admins renomeando ao
    # mesmo tempo, que checagem nenhuma resolve.
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        raise conflito(f"já existe organização com o slug {novo_slug}") from e

    return OrganizacaoOut.model_validate(org)
