# Trabalhar em duas (ou mais) pessoas neste repositório

Escrito para quem está chegando ao projeto e para quem vai receber alguém nele.
Não pressupõe experiência com git — as três primeiras seções bastam para
começar a trabalhar hoje.

---

## Em uma frase

**Cada pessoa tem uma cópia própria do código na própria máquina**, e as cópias
se encontram num repositório central. Ninguém edita a pasta do outro, e ninguém
edita direto o que está publicado.

---

## Sim, cada um precisa da sua cópia local

A pergunta aparece sempre que a equipe já compartilha uma pasta de rede (aqui,
o `K:`). A resposta é **sim, cada pessoa clona o repositório para o disco da
própria máquina** — `C:\dev\coordenacao`, por exemplo. Três motivos, e nenhum é
preferência:

1. **A pasta de trabalho do git é de uma pessoa só.** Ela guarda em qual ramo
   você está e o que você alterou mas ainda não gravou. Duas pessoas na mesma
   pasta significam duas pessoas com um estado só: quem troca de ramo troca o
   ramo do outro no meio da digitação dele, e as alterações de um viram
   alterações do outro sem que nada avise.
2. **Rede é lenta onde dói mais.** `node_modules` tem dezenas de milhares de
   arquivos pequenos, e o `--reload` do backend fica relendo a árvore. O que
   demora um segundo no disco local demora meio minuto na rede.
3. **O ambiente virtual do Python guarda caminhos absolutos.** O
   `backend/.venv` da sua máquina não funciona na máquina do outro, mesmo pela
   mesma letra de unidade. Por isso ele está no `.gitignore` — cada um cria o
   seu com `npm run setup`.

**O que continua fazendo sentido na rede:** os arquivos de referência que não
são código — as planilhas de auditoria, os PDFs de espec, os modelos. Eles não
estão no git e não devem estar.

### E se a rede for fechada, sem GitHub?

Git não precisa de internet: **uma pasta na rede serve de repositório central.**
Cria-se uma vez, e é a mesma coisa que o GitHub é, sem a página web.

```powershell
# uma vez, por quem já tem o código:
git clone --bare "K:\SPBIM TECH\PLATAFORMAS\Plataforma de auditoria" "K:\SPBIM TECH\git\coordenacao.git"

# em cada máquina:
git clone "K:\SPBIM TECH\git\coordenacao.git" C:\dev\coordenacao
```

O `--bare` é o que faz dela um repositório de TROCA e não de trabalho: ela não
tem arquivos abertos, só o histórico. Não edite nada lá dentro.

Dá para ter os dois ao mesmo tempo — a rede para o dia a dia, o GitHub como
cópia de segurança fora do prédio:

```powershell
git remote add rede "K:\SPBIM TECH\git\coordenacao.git"
git push rede main          # e `git push origin main` continua indo ao GitHub
```

**O que se perde sem o GitHub:** o *pull request* (a revisão antes de entrar) e
o CI (os testes automáticos). Os dois são justamente a rede de segurança da
seção seguinte — então, tendo internet em alguma máquina, vale manter o GitHub
como central e a pasta de rede como espelho.

---

## Uma conta do GitHub para os dois

É o arranjo daqui: as duas pessoas empurram pela mesma conta
(`inovacao@spbim.com`). Funciona, e não há nada a instalar por causa disso — mas
tem três consequências, e a primeira tem conserto de graça.

### A conta é uma; o AUTOR de cada commit não precisa ser

São coisas diferentes. A **conta** é a credencial que empurra para o GitHub. O
**autor** é o nome e o e-mail gravados dentro de cada commit — é o que o
`git blame` responde quando alguém pergunta, seis meses depois, quem escreveu
aquela linha e por quê. Com os dois iguais, essa pergunta deixa de ter resposta,
e neste repositório ela é a que mais se faz.

**Em cada máquina, uma vez, dentro da pasta do projeto:**

```powershell
git config user.name "Julio Farias"
git config user.email "julio@spbim.com"
```

Sem `--global`: assim vale só neste repositório, e cada máquina tem a sua. Os
commits passam a dizer quem os escreveu mesmo saindo pela conta compartilhada.
No GitHub eles aparecem com um avatar genérico quando o e-mail não pertence a
nenhuma conta de lá — o histórico é o que importa, e ele fica certo.

### O pull request continua valendo, com um ajuste

Com uma conta só, **não marque "Require approvals"** na proteção do `main`:
o GitHub não deixa a mesma conta aprovar o próprio pull request, e vocês ficariam
sem conseguir fazer merge de nada. Marque **apenas** *Require a pull request
before merging* e *Require status checks to pass* (os do CI).

O que se ganha assim: o `main` continua protegido de push direto, e o CI continua
sendo o juiz — ele roda a suíte inteira num banco descartável antes de qualquer
coisa entrar. O que se perde: a revisão vira um combinado entre vocês ("dá uma
olhada antes de eu apertar o merge"), porque o GitHub não tem como exigi-la.

### O que fica em aberto

- **Senha e 2FA compartilhados.** Quando alguém sair da equipe, troque a senha e
  revogue os tokens — não há como cortar o acesso de uma pessoa só.
- **Os termos do GitHub pedem uma conta por pessoa.** Contas são gratuitas e
  colaboradores em repositório privado também; no dia em que quiserem separar, é
  criar a segunda conta e convidá-la — nada do que está aqui muda.

---

## Passo a passo de uma máquina nova

**1. Acesso.** Aqui as duas pessoas usam a mesma conta, então não há convite a
fazer: basta entrar com ela no git da máquina nova. **Configure a identidade** do
autor logo depois de clonar — ver a seção acima. (Se um dia forem duas contas:
`Settings › Collaborators › Add people`, e a pessoa aceita por e-mail. Sem
GitHub, ver a seção da rede fechada.)

**2. Instalar o que o projeto precisa** — uma vez por máquina:

- **Python 3.12** — não 3.13 nem 3.14. O IfcOpenShell e o psycopg distribuem
  wheels até a 3.12, e nas versões novas a instalação falha no fim, com um erro
  que não menciona versão nenhuma.
  `winget install --id Python.Python.3.12 -e --scope user`
- **Node 20 ou mais novo** — `winget install OpenJS.NodeJS.LTS`
- **Git** — `winget install Git.Git`
- **Docker Desktop**, se possível. Não é obrigatório, mas é o caminho curto
  para ter banco, fila e storage.

**3. Clonar e preparar:**

```powershell
git clone https://github.com/juliofarias91/coordenacao.git C:\dev\coordenacao
cd C:\dev\coordenacao
npm run setup
```

O `setup` confere as versões, cria o ambiente do backend, instala tudo e gera um
`.env` com um segredo próprio. Ele **não** mexe em banco — isso é o passo 4,
porque escolher onde os seus dados moram é decisão de quem senta na máquina.

**4. O banco.** Com Docker:

```powershell
docker compose up -d db redis minio
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
$env:SEED_ADMIN_SENHA = 'escolha-uma'
.\.venv\Scripts\python.exe -m scripts.seed
```

Sem Docker, instale o PostgreSQL 16 e rode uma vez:

```powershell
psql -U postgres -c "CREATE DATABASE spbim_auditoria"
psql -U postgres -d spbim_auditoria -f infra/postgres/init/01-app-role.sql
```

**5. Rodar:** `npm run dev`, e abrir <http://localhost:5173>.

---

## O combinado do dia a dia

**Ninguém commita direto no `main`.** O `main` é o que vai para produção; ele
tem de estar sempre funcionando.

```powershell
git pull                              # começa o dia trazendo o que o outro fez
git checkout -b nome-da-tarefa        # um ramo por tarefa
# … trabalha, testa …
git add -A
git commit -m "Descreve o que mudou e por quê"
git push -u origin nome-da-tarefa
```

Depois, no GitHub, **Compare & pull request**. Ali:

- o **CI roda sozinho** (`.github/workflows/ci.yml`): ele sobe um Postgres e um
  MinIO descartáveis e executa a suíte inteira. Vermelho = não entra.
- a outra pessoa lê e comenta.
- com o verde e o aceite, **Merge**. Depois, todo mundo faz `git pull` no `main`.

**Três hábitos que evitam quase todo problema:**

1. `git pull` antes de começar, sempre. A maior parte dos conflitos nasce de
   trabalhar em cima de uma versão velha.
2. **Ramos curtos.** Uma tarefa, um dia ou dois, um pull request. Um ramo que
   viveu três semanas conflita com tudo.
3. **Dividam por área.** Um no backend, outro no frontend; ou telas diferentes.
   Duas pessoas no mesmo arquivo ao mesmo tempo é o que gera conflito.

### Deixar a regra automática (recomendado)

No GitHub: `Settings › Branches › Add branch protection rule`, com `main` no
padrão, marcando **Require a pull request before merging** e **Require status
checks to pass** (escolhendo os do CI). A partir daí o próprio GitHub recusa um
push direto no `main` — a regra deixa de depender de todo mundo lembrar dela.

⚠ **Não marque "Require approvals"** enquanto a conta do GitHub for a mesma para
as duas pessoas: ninguém aprova o próprio pull request, e vocês ficariam sem
conseguir fazer merge de nada. O porquê está na seção *Uma conta do GitHub para
os dois*.

---

## Trabalhar com IA no repositório compartilhado

O Claude Code faz parte do fluxo aqui. Esta seção é sobre o que muda quando duas
pessoas e uma IA mexem no mesmo código.

### O repositório é a memória da IA

Cada sessão dela começa do zero. O que a faz continuar de onde alguém parou não
é histórico de conversa — é **o que está escrito no repositório**: o
[`CLAUDE.md`](../CLAUDE.md) (as decisões e o porquê de cada uma), o
[`CONTINUACAO.md`](CONTINUACAO.md) (onde paramos) e as mensagens de commit.

Disso sai a regra prática: **decisão que não foi escrita será desfeita.** Em
01/08/2026 a IA reverteu a organização do menu de auditoria a pedido — e só soube
que estava revertendo algo DELIBERADO, e não consertando um descuido, porque a
decisão de 29/07 estava registrada com o motivo. Sem o registro, a mesma discussão
volta a cada duas semanas.

Por isso o template de pull request pede: **quem muda uma decisão registrada
atualiza o `CLAUDE.md` no mesmo commit.** Com duas pessoas e IA, isso deixa de ser
capricho e vira o que impede o projeto de andar em círculo.

### Um assunto por pessoa, por vez

Não é sobre gosto: a IA edita rápido e toca muitos arquivos — um único commit de
01/08 mexeu em catorze. Duas sessões trabalhando na mesma área ao mesmo tempo
produzem conflitos que **nenhuma das duas pessoas escreveu**, e que nenhuma das
duas sabe resolver com segurança.

Divisões que funcionam: um no backend e outro no frontend; telas diferentes; um
em correção e outro em tela nova. A que não funciona: "eu mexo na auditoria e
você também".

### Quatro hábitos dentro do ciclo

**Ramo por tarefa, inclusive para a IA.** Com o `main` protegido, ninguém —
pessoa ou IA — empurra direto nele, e o CI vira o primeiro leitor de tudo.

**Commits por etapa, não por dia.** Peça que a IA commite a cada bloco que fecha.
Este repositório passou quatro dias com 77 arquivos modificados e seis migrations
fora do git; se algo tivesse dado errado no meio, não havia para onde voltar.
Commit pequeno é o botão de desfazer.

**Rodar os checks antes de abrir o PR** — `npm run lint`, `npm run build`,
`npm run test:api`. A IA os roda quando se pede; confirme que rodou.

**Quem lê o PR é quem NÃO rodou a IA.** Com conta compartilhada o GitHub não
consegue exigir revisão, então essa leitura é a única barreira que sobra — e é a
mais importante. Um diff de IA parece sempre bem-acabado; o que ele não garante é
que faz o que você queria.

### O que delegar, e o que continua sendo de vocês

| Delegue | Não delegue |
|---|---|
| A varredura mecânica — a mesma mudança em vinte arquivos | **Decidir o que o produto deve fazer** |
| Ler código que ninguém lembra, e explicar | **Conferir a tela no navegador** |
| Escrever o *porquê* junto do código | Julgar se o dado real bate com a planilha |
| Achar a armadilha antes de ela custar uma tarde | Aprovar o que vai para o cliente |

O segundo item da direita é literal: **não há automação de navegador nas máquinas
deste projeto.** Todo commit de 01/08 registra "não foi visto em navegador" — não
é formalidade, é o buraco real do arranjo. A conferência visual é de vocês, e é a
etapa que mais pega defeito que passou por todos os testes.

### Três armadilhas específicas de IA + repositório compartilhado

1. **Duas sessões, o mesmo arquivo.** A IA não sabe que a outra pessoa está
   editando. O git só reclama no merge — e aí alguém pede à IA para "resolver o
   conflito", que é o pior momento para ela decidir sozinha o que preservar.
   Resolva você, e diga qual lado vale.
2. **Migration criada em paralelo.** Já está na lista de armadilhas abaixo, mas
   com IA a chance aumenta: ela cria uma `0016` sem saber que existe outra `0016`
   no ramo do colega. **Avise antes.**
3. **Teste contra o banco errado.** Está trancado no código desde 01/08, e veio de
   um caso real — a IA rodou a suíte contra o Supabase do piloto. Ela roda testes
   com muito mais frequência do que uma pessoa, e é isso que torna a trava
   necessária.

### A cadência sugerida

- **Começo do dia:** `git pull`, e vocês combinam em uma frase quem pega o quê.
- **Durante:** cada um no seu ramo, pedindo commits por etapa.
- **Ao fechar a tarefa:** checks, PR pequeno, o outro lê.
- **Fim do dia:** peça à IA para atualizar o `CONTINUACAO.md` com o que ficou
  pela metade. É o que faz a manhã seguinte — e a próxima sessão de IA, e o outro
  colega — começarem sabendo do que se trata.

### Uma decisão em aberto

O `.claude/` está no `.gitignore`, então as permissões e preferências da IA são de
cada máquina. Se vocês quiserem padronizar como ela se comporta no projeto
(comandos pré-aprovados, ganchos), dá para versionar um `.claude/settings.json`
com o que é DO PROJETO e manter o `settings.local.json` fora — foi ignorado
inteiro porque o que havia nele era caminho absoluto e lista de comandos
aprovados por uma pessoa só.

---

## As armadilhas deste projeto

### 1. O banco do piloto não é lugar de rodar teste

A suíte **cria e apaga dados de verdade**, e quando uma asserção falha no meio a
limpeza é pulada. Em 28 e 29/07/2026 sobraram dez organizações de teste no banco
do piloto — ao lado do CPQ11. Com duas pessoas, soma-se a isso o teste de uma
derrubando o cenário da outra.

Desde 01/08/2026 **a suíte recusa um banco que não seja local** e diz o porquê
(`backend/tests/conftest.py`). Se precisar mesmo — conferir uma migration contra
o Postgres do Supabase antes do deploy, por exemplo —, a saída é explícita:

```powershell
$env:PYTEST_BANCO_REMOTO = '1'
```

### 2. O `.env` não vai no git, e é de propósito

Ele tem a senha do banco e o segredo que assina as sessões. Cada pessoa tem o
seu, criado pelo `npm run setup`. **Não mande o seu por WhatsApp nem por e-mail.**
O que se compartilha é o `.env.example`, que já está no repositório.

### 3. As migrations são uma FILA, não um monte

Cada arquivo em `backend/alembic/versions/` aponta para o anterior (`0015` diz
"venho depois da `0014`"). Se duas pessoas criarem uma `0016` na mesma semana, a
fila se parte em duas e alguém tem de renumerar à mão.

**Combinado: avise antes de criar migration.** Enquanto forem duas pessoas, o
mais simples é uma só mexer em banco.

### 4. Não existe `git pull` no banco de dados

Quando alguém traz uma migration nova, o banco da SUA máquina não muda sozinho.
Depois de um `git pull` que trouxe arquivo em `alembic/versions/`:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Sem isso a API sobe e quebra com "column does not exist", que não parece um erro
de atualização — e é.

### 5. O que é gerado não se versiona

`backend/static/`, `node_modules/`, `backend/.venv/` e o `dist/` estão no
`.gitignore`. Se algum deles aparecer no `git status`, alguma coisa está errada
— não force o commit.

(`frontend/public/dictionaries/` esteve nesta lista até 07/08/2026: eram os
dicionários do corretor ortográfico, gerados no `npm install`. O módulo que os
usava foi removido, e a linha saiu do `.gitignore` junto.)

---

## Onde as coisas estão

| Assunto | Arquivo |
|---|---|
| O que o sistema é, e as decisões que não se revertem | [`CLAUDE.md`](../CLAUDE.md) |
| Como rodar, e a arquitetura por fase | [`README.md`](../README.md) |
| Onde paramos, dia a dia | [`docs/CONTINUACAO.md`](CONTINUACAO.md) |
| Produção: deploy, backup, o que olhar quando quebra | [`docs/OPERACAO.md`](OPERACAO.md) |
| Banco gerenciado e as armadilhas dele | [`docs/SUPABASE.md`](SUPABASE.md) |

**Antes de mexer em qualquer coisa, leia o `CLAUDE.md`.** Ele não é um resumo:
é onde está registrado o porquê de cada decisão que parece estranha à primeira
vista — e a maior parte delas foi paga com uma tela que ficou errada.
