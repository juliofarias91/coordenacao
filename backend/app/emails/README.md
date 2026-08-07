# Modelos de e-mail — SPBIM Coordenação

Os arquivos desta pasta são o CORPO dos e-mails que a plataforma manda. Quem os
lê é o servidor, no envio (`app/services/email.py`); o assunto e o remetente saem
de lá, não daqui.

**Não se cola nada em painel nenhum.** Editar o arquivo e reiniciar a API basta.
Isto é a diferença central em relação à referência de onde eles vieram — ver
"De onde vieram", no fim.

## O que existe

| Arquivo | Quando sai | Variáveis |
|---|---|---|
| `acesso/convite.html` | alguém convida uma pessoa para um projeto (`POST /convites-de-equipe`) | `to_email` `project_name` `cargo` `invited_by` `link` `validade` |
| `acesso/redefinir-senha.html` | pedido de "esqueci minha senha", ou um admin gerando link de primeiro acesso | `to_email` `to_name` `link` `validade` |
| `acesso/trocar-email.html` | ⚠ **nada envia este ainda** — ver abaixo | `to_email` `novo_email` `link` `validade` |

`acesso/` é o nome que a plataforma já usa para esta família (`NotifTipo.ACESSO`,
e a seção "Acesso" do `CLAUDE.md`): e-mail que carrega um LINK DE AÇÃO sobre a
conta de alguém. O dia em que existir e-mail de AVISO — "sua senha foi alterada",
que não pede nada e só conta o que aconteceu —, ele nasce numa pasta irmã, porque
as duas famílias têm regras diferentes: aviso não tem botão, não expira, e não
pode ser confundido com um pedido.

## ⚠ `trocar-email.html` não tem quem o mande

O arquivo existe; o FLUXO não. Hoje não há rota de troca de e-mail, não há tipo
de token para ela (`services/acesso.py` conhece `convite` e `redefinicao`, e mais
nada) e não há tela de confirmação. Para ele sair do papel faltam:

1. um terceiro tipo em `acesso.TIPOS` com validade própria;
2. `POST /usuarios/eu/email` (guarda o pedido, não troca nada ainda) e
   `POST /auth/email/confirmar` (consome o token e troca);
3. a tela pública que recebe o link;
4. `enviar_troca_de_email` em `services/email.py`.

E uma decisão de segurança que não dá para deixar para depois: **o e-mail de
confirmação vai para o endereço NOVO, então ele sozinho não protege ninguém.**
Quem tomasse uma sessão aberta trocaria o endereço e confirmaria no próprio
e-mail, em silêncio, e o dono da conta só descobriria ao não conseguir mais
entrar. O que fecha isso é um AVISO para o endereço ANTIGO, disparado no mesmo
ato — é o `security/email-changed.html` da referência, e é por isso que lá ele é
um arquivo separado. Quem for implementar a troca implementa os dois.

## As variáveis

São `{{campo}}`, trocados por `str.replace` em `email.py::_modelo`. Não há motor
de template: os arquivos são texto com buracos, sem condicional nem laço.

⚠ **Campo que o servidor não mandar sobrevive literal no corpo do e-mail.** Não
há erro, não há log — o destinatário é que lê `{{validade}}`. Ao acrescentar um
buraco no HTML, acrescente o par no `dict` da função de envio correspondente.

## ⚠ Eles são DADOS DO PACOTE

`[tool.setuptools.package-data]`, no `backend/pyproject.toml`, e a lista precisa
alcançar as subpastas:

```toml
[tool.setuptools.package-data]
app = ["emails/*.html", "emails/*/*.html"]
```

Sem isso o `pip install` do `Dockerfile` leva só os `.py` e o envio morre com
`FileNotFoundError` **apenas em produção** — em desenvolvimento a aplicação roda
do código-fonte, onde os arquivos existem. **Pasta nova aqui, confira lá.**

## O visual

Fundo quase preto com glows do accent, wordmark e um botão de contorno. É a
mesma superfície da tela de entrada (`.auth`, na seção AUTENTICAÇÃO do
`app.css`): escura SEMPRE, sem seguir tema, porque e-mail não tem como saber o
tema de quem o abre.

Cada arquivo repete o esqueleto inteiro, e isso é de propósito — é o que a
referência faz, e é o que sobrevive a cliente de e-mail. Um `base.html` com
buracos economizaria as vinte linhas de estilo, mas trocaria "abrir o arquivo e
ver o e-mail" por "abrir dois e montar de cabeça", num formato onde a única
depuração possível é olhar.

O preço é conhecido: mexeu no esqueleto, mexeu nos três. **Já houve deriva** —
até 07/08/2026 o convite e a redefinição tinham gradientes diferentes
(`rgba(110,140,242,.20)` contra `rgba(37,71,176,.18)`), sem que ninguém tivesse
decidido isso. Foram unificados no tom mais claro, que é o que se enxerga sobre
`#08080b`.

Duas coisas que não são estética:

- **Não há símbolo gráfico**, só o wordmark. Enquanto a SPBIM não tiver logotipo,
  aqui não se inventa um — a mesma decisão do `Shell.tsx` e da tela de login. (A
  referência tem um tetraedro; ele é a identidade DELES.)
- **O link vai também em TEXTO**, abaixo do botão. Cliente de e-mail corporativo
  bloqueia botão com frequência, e sem essa linha o e-mail vira um beco.

## De onde vieram

Da plataforma VDCity, `email-templates/supabase/` — os arquivos `invite-user`,
`reset-password` e `change-email`.

**A diferença que muda tudo:** lá os templates são do **Supabase Auth**. Colam-se
no painel dele, e as variáveis são as do Go (`{{ .ConfirmationURL }}`), montadas
pelo Supabase a partir dos fluxos dele. Aqui a identidade é própria (`usuario` +
Argon2 + JWT + `token_acesso`) e o Supabase é só Postgres gerenciado — então o
link é NOSSO, montado por `email.py::link` a partir do `APP_BASE_URL`, e o
arquivo é lido do disco em vez de morar num painel. Ver `docs/EMAIL.md`.

O que mais mudou, e por quê:

- **O accent é o da SPBIM** (`#6e8cf2`), não o `#3b82f6` de lá.
- **O convite é para um PROJETO, com um papel nele** — lá se convida para a
  plataforma. Um convite que não diga para qual projeto obriga quem recebe a
  descobrir depois de entrar.
- **Sem `{{company}}`.** No VDCity é a empresa da pessoa; aqui `empresa` é o
  fornecedor AUDITADO, e escrevê-la num convite diria a coisa errada.
- **A validade é dita em toda mensagem.** Lá o reset diz "expira em pouco tempo";
  aqui diz quanto, porque quem abre o e-mail no dia seguinte precisa saber se o
  link morreu ou se o sistema quebrou.
