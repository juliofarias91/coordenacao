# Piloto assistido — roteiro

SP-502 e SP-503. O objetivo do piloto não é "usar o sistema": é **provar a tese**
de que a auditoria pode ser a única fonte de dado, e descobrir onde ela não é.

O critério de sucesso é medível: ao final, a coordenação consegue emitir o
controle e o relatório de um round **sem abrir nenhuma planilha**.

---

## Antes de começar

- [ ] Ambiente de produção no ar e restauração de backup testada (`docs/OPERACAO.md`)
- [ ] Projeto escolhido — de preferência um sucessor do CPQ11, com PEB parecido
- [ ] PEB do contrato em mãos: é dele que sai a biblioteca de critérios
- [ ] Uma pessoa da coordenação SPBIM com tempo reservado (não dá para ser "nas horas vagas")
- [ ] Ao menos dois fornecedores dispostos a receber o retorno pela plataforma

**Decisões que precisam estar tomadas** (seção 9 do plano técnico):

| Decisão | Por que trava o piloto |
|---|---|
| **nº 2 — identidade** | sem SSO, cada usuário precisa de senha criada à mão |
| **nº 3 — orçamento APS** | sem credencial, entregas em `.rvt` não têm automação; só IFC |
| **nº 4 — revisor obrigatório** | muda quem pode publicar round |
| **nº 5 — ACC Issues** | hoje a sincronização é só de saída |

O piloto **roda sem a nº 3**: a auditoria 4D em IFC é in-house e não custa
token. Só perde a extração de propriedades de arquivos Revit.

---

## Semana 1 — cadastro

O cadastro inteiro vem de um arquivo, não da tela. Copie
`backend/scripts/dados/cpq11.yaml`, troque o que for do projeto novo e importe:

```bash
docker compose -f docker-compose.prod.yml exec api \
  python -m scripts.onboarding scripts/dados/<projeto>.yaml --dry-run
```

O `--dry-run` mostra o que faria e não grava nada. Confira o resumo, tire o
`--dry-run` e rode de novo.

O importador é **idempotente**: edite o YAML e reimporte quantas vezes for
preciso. É por isso que ele é a fonte da configuração do projeto — não a tela.

Ao montar a biblioteca de critérios, o que decide se a automação vai valer a
pena é o campo `automacao`:

- `auto` → roda sozinho. Todo critério que confere **presença de parâmetro**
  cabe aqui: basta preencher `parametro_esperado`, sem código novo.
- `design_automation` → exige abrir o Revit. Fora do piloto.
- `manual` → julgamento humano.

Quanto mais critérios em `auto`, maior o ganho. Comece pelos parâmetros 4D:
são os de maior volume manual hoje.

**Ao final da semana 1:** projeto, empresas, disciplinas, critérios e
checklists no ar; a coordenação consegue navegar e reconhecer o próprio projeto.

---

## Semana 2 — primeira entrega, auditoria manual

Peça uma entrega real a um fornecedor. Suba na tela do modelo (ou pelo ACC, se
a integração estiver configurada) e **audite à mão**, sem automação.

Isso é de propósito: a auditoria manual é o controle. Sem ela não há com o que
comparar o resultado automático na semana 3.

O que observar:

- Os checklists que aparecem batem com o que a disciplina deveria exigir?
- Falta algum critério que a coordenação usa e não está na biblioteca?
- O relatório em PDF serve para mandar ao fornecedor **como está**, ou precisa
  de algo que ele não traz?

Registre cada falta como ajuste (seção "Coleta de ajustes").

**Ao final da semana 2:** um round publicado, um PDF emitido, um controle em
XLSX exportado.

---

## Semana 3 — automação

Rode a automação **sobre a mesma versão** já auditada à mão:

```
Tela do modelo → Auditoria automática
```

Compare item a item:

| Situação | O que significa |
|---|---|
| Automático concorda com o manual | o critério está pronto para rodar sozinho |
| Automático reprova, humano aprovou | o critério está severo demais, ou o modelo tem um problema que passou batido |
| Automático aprova, humano reprovou | o verificador não olha o que a pessoa olha — volte para `manual` |
| Automático deu N/A | falta `parametro_esperado`, ou o modelo não tem esse tipo de elemento |

**Essa comparação é o dado mais valioso do piloto inteiro.** Anote cada
divergência com o código do critério e o motivo.

Teste também o validador de nomenclatura com nomes reais que já chegaram
errados no passado — inclusive as entregas de Navisworks, que vêm sem sufixo de
software.

**Ao final da semana 3:** uma tabela de divergências entre manual e automático,
e a biblioteca ajustada em cima dela.

---

## Semana 4 — fornecedor e cliente

Convide um fornecedor de verdade: ele responde a uma NC pela plataforma, em vez
de por e-mail.

Gere um convite de cliente (**Configuração → Convidar cliente**) e abra o link
antes de mandar. Confira, campo a campo, que só sai o que foi liberado — em
obra com vários fornecedores, o nome do projetista costuma ser o dado sensível,
e ele vem desligado por padrão.

**Ao final da semana 4:** um fornecedor respondeu uma NC; o cliente abriu o
portal e disse se aquilo responde à pergunta dele.

---

## Coleta de ajustes (SP-503)

Registre cada ajuste como um apontamento na própria plataforma, no projeto do
piloto — dogfooding, e fica tudo num lugar só.

Classifique por **impedimento**, e não por "urgência" (todo mundo acha o seu
urgente):

| Classe | Significado | Quando resolver |
|---|---|---|
| **Trava** | impede o uso; obriga a voltar para a planilha | antes de expandir |
| **Atrito** | dá para trabalhar, mas custa tempo toda vez | primeiras semanas depois |
| **Desejo** | melhoraria, ninguém para por causa disso | backlog |

Perguntas para fechar o piloto, com a coordenação:

1. Você emitiu o controle e o relatório **sem abrir planilha**? Se não, o que faltou?
2. Quanto tempo levou o round comparado ao processo antigo?
3. Dos critérios automatizados, em quantos você confiou sem conferir à mão?
4. O que você continuou fazendo fora da plataforma — e por quê?

E com o fornecedor:

1. Ficou claro **o que** corrigir e **onde** (os IDs de elemento ajudaram)?
2. Responder pela plataforma foi melhor ou pior que e-mail?
3. O que chegou e você não entendeu?

A pergunta 4 da coordenação é a mais importante do piloto. O que continua fora
da plataforma é o próximo backlog.

---

## Sinais de que o piloto está indo bem

- A planilha de controle parou de ser atualizada — e ninguém sentiu falta
- O fornecedor pergunta pelo link do relatório em vez de pedir por e-mail
- A coordenação abre o painel antes da reunião, não durante
- Um critério automatizado pegou algo que passaria batido

## Sinais de que precisa parar e ajustar

- Alguém mantém uma planilha "de apoio" em paralelo → falta algo na plataforma
- Round publicado com muitos N/A → a biblioteca não bate com o contrato
- Automático sempre reprovado e reclassificado à mão → o verificador está errado
- Ninguém olha as notificações → o endereçamento por papel está errado
