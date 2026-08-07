"""As áreas passam a ser do PROJETO.

Até aqui a área existia em dois lugares e em nenhum deles era definida: um
`text[]` por disciplina (`disciplina.areas`, desde a 0001) e uma lista CHAPADA no
front (`AREAS_SUGERIDAS`, em `configuracao/Disciplinas.tsx`) com os oito setores
do CPQ11. Quem cadastrava a estrutura de outro projeto marcava COLO1..5 porque
era o que a tela oferecia, ou digitava o setor certo em cada disciplina — e a
matriz modelo × área é montada varrendo esses arrays, então 'TORRE A' numa
disciplina e 'TORRE-A' noutra viravam DUAS colunas para o mesmo setor, sem nada
na tela explicando por quê.

A definição sobe para o projeto: a área nasce uma vez, em
`Configurações do projeto › Áreas`, e a disciplina MARCA quais audita. É a mesma
divisão que já existe entre `standard` e a nomenclatura que cada disciplina
aponta.

`text[]` NO PROJETO, e não tabela própria. É o precedente de `disciplina.areas`,
e a razão é a mesma: a área não tem atributo nenhum além do nome — não tem
responsável, não tem prazo, não tem cor (a cor é da macrodisciplina). Uma tabela
daria id, e id exigiria migrar `disciplina.areas` e `auditoria.area`, que hoje
guardam o NOME, para chave estrangeira — trabalho grande para guardar a mesma
string com outro invólucro. Quando a área ganhar dado próprio, ela vira entidade,
e a migration que fizer isso terá os nomes reais para migrar.

O QUE ISSO NÃO MUDA: `auditoria.area` continua sendo o nome, `disciplina.areas`
continua sendo o array que a matriz varre, e a nomenclatura de arquivo não olha
para nenhum dos dois. O que muda é de onde sai o vocabulário.

⚠ O BACKFILL É A PARTE QUE NÃO PODE FALTAR. A coluna nasce vazia, e o projeto
com a lista vazia é um projeto onde a disciplina não tem o que marcar: as áreas
que a coordenação já declarou sumiriam do formulário na primeira edição, e a
matriz iria junto. Por isso ela nasce com a UNIÃO do que as disciplinas já
declararam — o que estava disperso é exatamente a lista que se queria ter.

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sem RLS nem GRANT novos: a coluna entra numa tabela que já tem os dois.
    op.add_column(
        "projeto",
        sa.Column(
            "areas",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )

    # A UNIÃO DO QUE JÁ EXISTE, ordenada — a lista da tela sai daqui e ordem
    # estável é o que a torna conferível. `DISTINCT` porque o mesmo setor
    # aparece em quase toda disciplina; `unnest` porque o dado de origem é
    # array. Projeto sem disciplina não é tocado e fica com o `'{}'` do default.
    op.execute(
        """
        UPDATE projeto p
           SET areas = origem.areas
          FROM (
                SELECT d.projeto_id, array_agg(DISTINCT a ORDER BY a) AS areas
                  FROM disciplina d, unnest(d.areas) AS a
                 WHERE a <> ''
              GROUP BY d.projeto_id
               ) AS origem
         WHERE origem.projeto_id = p.id
        """
    )


def downgrade() -> None:
    # A volta não perde nada: as áreas continuam em `disciplina.areas`, que é de
    # onde esta coluna veio e o que a matriz sempre leu.
    op.drop_column("projeto", "areas")
