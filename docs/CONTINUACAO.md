# Onde paramos — 28/07/2026

Estado da plataforma no fim do dia, o que está no ar, e o que vem a seguir.
Escrito para retomar amanhã sem reconstruir o contexto.

---

## O que mudou hoje

A plataforma saiu de "roda na máquina do dev contra Postgres local" para
**publicada, com banco gerenciado e um deploy funcionando**.

| | Antes | Agora |
|---|---|---|
| Banco | Postgres local (docker) | **Supabase** (PostgreSQL 17.6, us-west-2) |
| Deploy | nenhum | **Easypanel**, `hub/spbim-coordenacao` |
| Repositório | local, sem remote | `github.com/juliofarias91/coordenacao` |
| Auditer | app separado, deployado | **aposentado** — vive dentro da plataforma |
| Cliente | campo de texto em `projeto` | **entidade** (migration 0003) |
| Porta de entrada | `/painel` | **`/`** — home com pastas por cliente |

---

## O ambiente

**Local.** A máquina não tem Docker, psql nem Node global para o backend. O
Python 3.12 foi instalado hoje e a venv vive em `backend/.venv`.

```powershell
.\dev.ps1            # API :8000 + Vite :5173 com hot-reload — o de todo dia
.\dev.ps1 -Unico     # só :8000, servindo o build, igual à produção
.\dev.ps1 -Parar     # encerra as duas
```

Comandos do backend precisam do interpretador da venv pelo caminho absoluto
(`backend\.venv\Scripts\python.exe`) — o `Set-Location` nem sempre persiste
entre chamadas no PowerShell, e caminho relativo já falhou.

**Produção.** `hub/spbim-coordenacao` no Easypanel (187.77.48.26:3000), porta
**8000**, construído do `Dockerfile` da raiz. As variáveis estão no nível do
projeto `hub`. O Easypanel as passa como `--build-arg`, então **as senhas
aparecem no log de build** — vale rotacionar a senha do banco quando o
ambiente estabilizar.

**Supabase** (`pilyrmvxytuwoiwjxgdv`): o schema está na revisão **0003** e o
seed já rodou (org SPBIM, projeto CPQ11, cliente Microsoft).

---

## Três armadilhas que já custaram tempo hoje

**O host `db.<ref>.supabase.co` não serve.** Só publica registro AAAA, e o
IPv4 dedicado é add-on pago: de rede sem IPv6 o DNS resolve e o TCP nunca
fecha. O sintoma é um timeout na 5432 que parece firewall. Migration e
autenticação vão pelo **pooler em modo sessão** (`5432`, usuário
`postgres.<ref>`); a API vai pelo modo transação (`6543`).

**O dono das tabelas é `spbim_owner`, não `postgres`.** O banco foi preparado
por fora com um papel dedicado. O `postgres` era membro mas com
`inherit=false`, então tinha zero privilégios — o erro aparecia como
`permission denied for table organizacao` na conexão que deveria ser a mais
poderosa. Resolvido com `GRANT spbim_owner TO postgres WITH INHERIT TRUE, SET
TRUE` (aditivo: não trocou senha nem dono).

**O endpoint S3 é `<ref>.storage.supabase.co`**, com `.storage.` no meio — não
`<ref>.supabase.co`. Credenciais validadas contra o Storage real hoje.

---

## O que está pronto e verificado

```
backend    219 passed, 13 skipped   (suíte completa contra o Supabase, ~40min)
           os 13 skips são de storage; test_cadastro corrigido depois, 29/29
frontend   tsc + eslint limpos, build ok, bundle inicial 306 kB
```

- **Supabase**: banco, RLS validado pelos três testes de isolamento, papel de
  aplicação, `scripts/supabase_bootstrap.py` para repetir em outro ambiente.
- **Cliente como entidade**: migration 0003 com conversão dos textos, API
  completa, `GET /clientes/pastas` para a home, 8 testes.
- **Home** (`/`): KPIs e projetos em pastas por cliente, modos pastas/lista.
- **Shell**: usuário e Administração na topbar, Sair também no rodapé da
  sidebar, busca global (Ctrl+K), grupos da sidebar arrastáveis.
- **Auditer aposentado**: o motor vive em `frontend/src/lib/auditer/`.

---

## O que vem a seguir

A lista pedida, com o custo real de cada item. **Só tela** significa que o
backend já existe.

### Só tela — o backend já está pronto

1. **Administração separada** — usuários, clientes e visão geral. Clientes tem
   API desde hoje; usuários desde a Fase 1. *(sugerido como próximo)*
2. **Log de atividade** — a trilha de auditoria existe e tem API
   (`/trilha`); falta a tela.
3. **Notificações** — existe API e o sino na topbar; falta a central.
4. **Perfil separado, em sections** — hoje é um painel no menu da conta.
5. **Home em sections** — a home atual é uma tela só; o VDCity divide em
   seções navegáveis (`?s=`).
6. **Política de privacidade** — página estática, rota pública.

### Precisa de backend novo

7. **Lixeira** — soft delete de verdade: `deleted_at` nas tabelas, filtro em
   toda query **e nas policies de RLS**. Hoje `DELETE` é definitivo. É a mais
   invasiva da lista: toca todas as entidades.
8. **Apontamento de erros do sistema** — tabela própria de bug report. Não
   confundir com `Apontamento`, que já existe e é de auditoria de modelo.
9. **Personalização de navbar (pins)** — precisa persistir a escolha por
   usuário; hoje só a ordem da sidebar persiste, em `localStorage`.

### Decidido, mas ainda não implementado

10. **Rotas por projeto** (`/projetos/:id/...`) — aprovado. Mexe em todas as
    telas, no breadcrumb e no `ProjetoContext`. Vale fazer antes de multiplicar
    telas novas, para não refazê-las depois.
11. **Login/cadastro** — decidido: **só por convite do admin**. Cadastro aberto
    contradiz "SSO autentica, não provisiona" (`docs/SUPABASE.md`). O que falta
    é a tela de convite + definição de senha.

---

## Pendências operacionais

- **Storage**: as chaves S3 estão no Easypanel e foram validadas, mas o bucket
  `spbim-auditoria` ainda não existe — a aplicação o cria no primeiro upload.
  **Conferir no painel se ele nasce privado.**
- **Redis**: não existe no Easypanel. Sem ele a auditoria automática não
  enfileira — o upload é aceito e a análise fica pendente.
- **Migration no deploy**: o `Dockerfile` sobe o uvicorn direto, sem rodar
  `alembic upgrade head`. Hoje o banco está em dia porque a 0003 foi aplicada
  da máquina local; **na próxima migration, rodar antes de implantar**.
- **Senhas no log de build** do Easypanel (ver acima).

---

## Onde as coisas estão

| Assunto | Arquivo |
|---|---|
| Como o VDCity é aproveitado | `K:\SPBIM TECH\PLATAFORMAS\Plataforma vdcity\PLATAFORMA\vdcity` |
| Migração e armadilhas do Supabase | `docs/SUPABASE.md` |
| Deploy no Easypanel | `docs/EASYPANEL.md` |
| Runbook de produção | `docs/OPERACAO.md` |
| Linguagem visual (as cinco regras) | `ui-kit-export/README.md` e `CLAUDE.md` |
| Bootstrap de um Supabase novo | `backend/scripts/supabase_bootstrap.py` |
| Criar usuário / recuperar acesso | `backend/scripts/criar_usuario.py` |

**Sobre o VDCity:** não é copiar arquivo. Lá é JSX + Tailwind + Supabase direto
no navegador; aqui é TypeScript, classes semânticas sem Tailwind, e todo dado
passa pela API. Traz-se a estrutura e o comportamento, reescrevendo. Cuidado
com `pages/Projeto.jsx` (288 KB num arquivo só) e `AgendaSection.jsx` (121 KB):
são o que o `DESIGN_SYSTEM.md` de lá chama de dívida — pegue a ideia, não a
implementação.
