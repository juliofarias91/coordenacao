"""Busca de entidades já dentro do tenant.

A sessão vem de `get_tenant_db`, então o row-level security garante que um
`db.get()` só encontre linha da organização do token. Um id de outra
organização simplesmente não existe daqui — e vira 404, não 403: dizer
"proibido" já entregaria que o recurso existe em algum lugar.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.db.base import Base
from app.models import Projeto, ProjetoMembro
from app.models.enums import PapelUsuario

# Quem enxerga TODO projeto da organização, vinculado ou não. É a permissão que
# já define "administra o cadastro" — quem cria projeto e vincula gente precisa
# ver o que ainda não tem ninguém dentro.
VE_TODO_PROJETO = "admin_cadastro"


def exigir[M: Base](db: Session, modelo: type[M], item_id: uuid.UUID, rotulo: str) -> M:
    obj = db.get(modelo, item_id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{rotulo} não encontrado"
        )
    return obj


def exigir_projeto(db: Session, projeto_id: uuid.UUID) -> Projeto:
    """O projeto, sem perguntar QUEM está pedindo.

    Continua existindo para os chamadores que não têm usuário: o portal do
    cliente, autenticado por token, e o worker. Rota de gente autenticada usa
    `exigir_projeto_do_usuario`.
    """
    return exigir(db, Projeto, projeto_id, "projeto")


def _vinculo_valendo():
    """A condição de vínculo VIVO: existe e não venceu.

    ⚠ É AQUI QUE O PRAZO DO CONVITE VIRA REVOGAÇÃO DE VERDADE (migration 0018).
    A especificação de origem chama isto de "a regra que dá sentido a tudo": sem
    a checagem de `expira_em` DENTRO da autorização, os três prazos do convite
    são três colunas bonitas que não impedem nada — quem entrou por um convite
    com prazo continuaria entrando depois de ele vencer.

    Nulo = sem prazo, que é como todo vínculo anterior à 0018 ficou. A migration
    não revogou o acesso de ninguém.
    """
    return or_(ProjetoMembro.expira_em.is_(None), ProjetoMembro.expira_em > func.now())


def e_membro(db: Session, projeto_id: uuid.UUID, usuario_id: uuid.UUID) -> bool:
    """Participa do projeto E o vínculo não venceu."""
    return (
        db.execute(
            select(ProjetoMembro.id).where(
                ProjetoMembro.projeto_id == projeto_id,
                ProjetoMembro.usuario_id == usuario_id,
                _vinculo_valendo(),
            )
        ).first()
        is not None
    )


def e_coordenador(db: Session, projeto_id: uuid.UUID, usuario_id: uuid.UUID) -> bool:
    """Coordena ESTE projeto, pelo vínculo — não pela permissão de organização."""
    return (
        db.execute(
            select(ProjetoMembro.id).where(
                ProjetoMembro.projeto_id == projeto_id,
                ProjetoMembro.usuario_id == usuario_id,
                ProjetoMembro.papel == PapelUsuario.COORDENADOR,
                _vinculo_valendo(),
            )
        ).first()
        is not None
    )


def exigir_coordenacao_do_projeto(
    db: Session, projeto_id: uuid.UUID, user: CurrentUser
) -> Projeto:
    """Quem pode montar a EQUIPE deste projeto: convidar, trocar papel, remover.

    ⚠ AQUI `projeto_membro` CONCEDE PODER PELA PRIMEIRA VEZ (07/08/2026, a
    pedido), e isso REVERTE em parte a decisão da migration 0004. Não é
    acidente: `test_participacao_nao_e_permissao` existia justamente para falhar
    quando alguém ligasse as duas coisas, e foi ele que trouxe a conversa. O
    teste foi reescrito para trancar a fronteira NOVA, que é bem mais estreita
    que "coordenador pode tudo".

    O QUE ESTE PODER ALCANÇA, e só: o vínculo de OUTRAS pessoas com ESTE projeto
    — papel no projeto, equipe, e estar ou não nele. Nada mais.

    O QUE ELE NÃO ALCANÇA, e cada item é uma linha que não existe aqui:

    - **Outro projeto.** A checagem é por `projeto_id`; coordenar o CPQ11 não
      diz nada sobre o DANTE 2.
    - **Permissão de organização.** `usuario.permissoes` continua saindo só de
      `/usuarios`, com `admin_cadastro`. Um coordenador não promove ninguém a
      administrador do tenant.
    - **Páginas visíveis.** Elas moram em `usuario.permissoes` e valem em TODOS
      os projetos — um coordenador do CPQ11 apagando telas de alguém no DANTE 2
      seria exatamente o vazamento de alcance que a 0004 evitava. Ficaram de
      fora do convite inteiro, a pedido (07/08/2026).
    - **Criar conta.** Convidar dá vínculo; conta nasce em `/auth/cadastro`.
    - **O próprio vínculo.** `_exigir_que_nao_seja_voce`, em `api/v1/membros.py`,
      continua valendo — inclusive para quem coordena.

    404 e não 403 pelo mesmo motivo do resto do módulo, com um degrau a mais:
    quem não é membro nem sabe que o projeto existe, e quem é membro mas não
    coordena leva 403 — para esse, o projeto não é segredo, a ação é que não é
    dele.
    """
    projeto = exigir_projeto_do_usuario(db, projeto_id, user)
    if user.pode(VE_TODO_PROJETO) or e_coordenador(db, projeto_id, user.id):
        return projeto
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="só quem coordena este projeto pode montar a equipe dele",
    )


def exigir_projeto_do_usuario(
    db: Session, projeto_id: uuid.UUID, user: CurrentUser
) -> Projeto:
    """O projeto, se esta pessoa participa dele (06/08/2026, a pedido).

    ⚠ ISTO MUDA O QUE `projeto_membro` SIGNIFICA, e a mudança é deliberada. A
    migration 0004 registrou que a tabela "registra participação e NÃO autoriza",
    e até aqui era literal: qualquer conta com `ver_painel` via TODOS os projetos
    da organização. Foi assim que uma conta recém-criada pela tela de cadastro
    entrou e encontrou o CPQ11 na home sem ninguém a ter vinculado.

    O QUE NÃO MUDOU é a direção contrária, e é ela que o
    `test_participacao_nao_e_permissao` tranca: ser membro — mesmo como
    coordenador NO projeto — continua não concedendo permissão nenhuma. Vínculo
    agora LIMITA o alcance; ele nunca amplia. As duas regras convivem porque
    respondem a perguntas diferentes: "o que posso fazer?" (permissão) e "sobre
    quais projetos?" (vínculo).

    404 E NÃO 403, como o resto deste módulo: dizer "proibido" confirmaria que o
    projeto existe, e o id está na URL de quem tentar adivinhar.
    """
    projeto = exigir_projeto(db, projeto_id)
    if user.pode(VE_TODO_PROJETO) or e_membro(db, projeto_id, user.id):
        return projeto
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="projeto não encontrado"
    )


def projetos_visiveis(stmt, user: CurrentUser):
    """Restringe uma consulta de `Projeto` ao que esta pessoa participa.

    Recebe e devolve a consulta em vez de executá-la: quem chama já monta
    paginação e ordenação por cima, e um helper que executasse obrigaria a
    desmontar isso.
    """
    if user.pode(VE_TODO_PROJETO):
        return stmt
    return stmt.where(
        Projeto.id.in_(
            select(ProjetoMembro.projeto_id).where(
                ProjetoMembro.usuario_id == user.id,
                # O MESMO prazo de `e_membro` — as duas respondem à mesma
                # pergunta em formatos diferentes (uma consulta, uma condição), e
                # divergirem faria a home listar um projeto que o detalhe recusa.
                _vinculo_valendo(),
            )
        )
    )


def conflito(mensagem: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=mensagem)


def ja_existe(db: Session, stmt) -> bool:
    """True se a consulta de unicidade encontrar alguma linha."""
    return db.execute(select(stmt.exists())).scalar() or False
