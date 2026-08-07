"""Contratos do convite de equipe (migration 0018)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import PapelUsuario
from app.schemas.comum import ESCRITA, Identificado


class ConviteEquipeCreate(BaseModel):
    """O formulário de convite. Dois fluxos, um contrato.

    `email` NULO é o link aberto — não é campo esquecido, é a escolha entre os
    dois fluxos. Ver `services/convite_equipe.py`.

    NÃO HÁ CAMPO DE EMPRESA nem de páginas visíveis, e os dois por decisão:
    empresa aqui é o fornecedor auditado (um convite não pode criar projetista),
    e páginas visíveis valem na organização inteira (quem coordena um projeto não
    mexe no que alguém enxerga nos outros).
    """

    model_config = ESCRITA

    email: EmailStr | None = Field(
        default=None,
        description="Trava o convite neste endereço. Omita para gerar link aberto.",
    )
    papel: PapelUsuario = Field(description="Papel NO PROJETO (leitor/auditor/coordenador)")
    equipe: str | None = Field(default=None, max_length=120)
    acesso_expira_em: datetime | None = Field(
        default=None,
        description=(
            "Até quando a pessoa terá acesso. Nulo = sem prazo. "
            "NÃO é a validade do link, que é sempre de 3 dias."
        ),
    )


class ConviteEquipeOut(Identificado):
    """O convite como quem convidou o vê. **Nunca traz o token.**

    O valor em claro existe uma vez, em `ConviteCriadoOut`. Relistá-lo aqui faria
    a tela de membros ser uma lista de credenciais vivas — que é exatamente o que
    o hash na coluna existe para impedir.
    """

    org_id: uuid.UUID
    projeto_id: uuid.UUID
    email: str | None
    papel: PapelUsuario
    equipe: str | None
    expira_em: datetime
    acesso_expira_em: datetime | None
    aceito_em: datetime | None
    aceito_por: uuid.UUID | None


class ConviteEquipeCriadoOut(BaseModel):
    """A resposta de quem CRIA. O token aparece aqui, uma vez.

    `caminho` vem montado do servidor para o cliente não ter de saber a forma da
    URL — e para que mudá-la seja uma linha, não uma caça pelo front. Já foi
    usado uma vez: em 07/08/2026 ele apontava para `/convite/<token>` e passou a
    apontar para a TELA DE CADASTRO, a pedido. A troca custou esta linha.
    """

    convite: ConviteEquipeOut
    token: str
    caminho: str = Field(
        description="Caminho da tela pública, ex.: /cadastro?convite=<token>"
    )


class ConvitePreviaOut(BaseModel):
    """O `invite_preview` da origem: o que a tela PÚBLICA mostra antes do aceite.

    Existe pela mesma razão que `GET /auth/senha/{token}`: descobrir que o
    convite venceu depois de criar uma conta é o pior momento possível para
    descobrir.

    O QUE ELE REVELA, e o limite: nome do projeto, organização, papel oferecido
    e — se o convite for travado — o e-mail. Quem tem o token já poderia entrar
    no projeto; dizer para qual projeto ele serve não entrega nada a mais. O que
    NÃO sai daqui é qualquer coisa sobre quem já é membro.
    """

    projeto_nome: str
    projeto_codigo: str
    organizacao: str
    papel: PapelUsuario
    equipe: str | None
    # Preenchido só no convite travado. É o que a tela de cadastro usa para
    # pré-preencher E TRAVAR o campo, como faz o `Login.jsx` da origem.
    email: str | None
    expira_em: datetime
    acesso_expira_em: datetime | None
    # Se quem está autenticado agora JÁ é membro. A tela usa para dizer "você já
    # está neste projeto" em vez de repetir o aceite.
    ja_e_membro: bool = False
