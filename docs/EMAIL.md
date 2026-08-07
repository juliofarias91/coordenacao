# E-mail — configurar o SMTP (07/08/2026)

A plataforma manda dois e-mails: **convite para um projeto** e **redefinição de
senha**. Os dois saem do SERVIDOR, por SMTP, de um lugar só:
`backend/app/services/email.py`.

## Por que não é "o e-mail do Supabase"

A pergunta vai voltar, então fica registrada. O sistema de e-mail do Supabase é
do **Supabase Auth**: ele envia confirmar-cadastro, convite, magic link e
redefinir-senha, disparados pelos fluxos deles sobre `auth.users`, com variáveis
deles (`{{ .ConfirmationURL }}`).

Esta plataforma tem identidade própria — tabela `usuario` com Argon2, JWT
próprio, `token_acesso` para redefinição — e usa o Supabase como **Postgres
gerenciado e storage** (ver `docs/SUPABASE.md`, "Por que a autorização não vai
para o Supabase"). Consequência: **o Supabase não teria como mandar um link com o
NOSSO token**, porque o fluxo não é dele.

E mesmo adotando Supabase Auth seria preciso um SMTP: o remetente embutido deles
é limitado a poucos e-mails por hora, e a documentação deles diz para não usá-lo
em produção. A tela de Auth existe justamente para plugar um SMTP seu.

## Por que sai do servidor, e não do navegador

Por um dia (07/08/2026) o convite saiu do NAVEGADOR, por EmailJS, e só a
redefinição vinha do servidor. Havia razão para os dois lados:

| | Antes | Agora |
|---|---|---|
| Convite | navegador (EmailJS) | **servidor (SMTP)** |
| Redefinição de senha | servidor | **servidor (SMTP)** |

A redefinição **nunca** pôde sair do navegador: `POST /auth/senha/esqueci` é
público e anônimo, e o link é a credencial da conta. Se a rota devolvesse o token
para o front despachar, bastaria pedir a redefinição do e-mail de um coordenador
e ler a resposta para tomar a conta dele.

Com SMTP, o convite passou a seguir a mesma regra sem custo — o token já nasce no
servidor. O que se ganhou: **uma** configuração em vez de duas, a chave pública
fora do bundle, a dependência `@emailjs/browser` removida, e um lugar só para
olhar quando um e-mail não chegar.

## Passo a passo

### 1. Escolher um provedor de SMTP

**A SPBIM JÁ TEM O SEU** (resolvido em 07/08/2026): um SMTP em
`smtp1.xmailer.com.br`, porta **465**, com a conta de serviço
`no-reply@spbim.com.br`. Autenticação e remetente conferidos.

⚠ **CONTA DE SERVIÇO, NÃO A CAIXA DE UMA PESSOA.** A primeira tentativa usou o
e-mail de um colaborador — o que a VDCity usa — e foi recusada com
`435 Unable to authenticate at present`. Mesmo que tivesse funcionado, seria a
escolha errada: a plataforma passaria a guardar uma credencial capaz de **ler a
correspondência** de alguém, e a troca de senha dessa pessoa derrubaria o envio.
Se um dia alguém propuser voltar a um endereço pessoal, é isto que se responde.

⚠ **O SMTP do painel do Supabase NÃO é este.** Aquele serve ao **Supabase Auth**,
que esta plataforma não usa (ver a seção acima). Preencher lá e não aqui não faz
e-mail nenhum sair — quem envia lê as variáveis do `.env`/do ambiente.

⚠ **465 exige `SMTP_SSL=true`.** Com `false` o handshake falha com uma mensagem
sobre *"wrong version number"*, que não menciona porta nenhuma e manda quem lê
procurar no lugar errado.

⚠ **A senha tem `#`, então vai entre aspas no `.env`.** Sem elas, um espaço antes
do `#` transforma o resto da linha em comentário e a senha chega truncada — com
um erro de autenticação que não explica nada. O `verificar_email` imprime o
tamanho da senha carregada; confira que bate.

Se um dia precisar de outra conta, qualquer provedor serve — o código é
genérico:

| Provedor | Nota |
|---|---|
| **Resend** | plano gratuito com domínio próprio; SMTP em `smtp.resend.com:587` |
| **Brevo** | gratuito com limite diário; `smtp-relay.brevo.com:587` |
| **Zoho Mail** | se já houver caixa no domínio; `smtp.zoho.com:465` (SSL) |
| **Google Workspace** | `smtp.gmail.com:587`, com **senha de app** — a senha da conta não funciona |

### 2. Verificar o domínio do remetente

⚠ **É a etapa que mais derruba o envio.** Quase todo provedor recusa mensagem
cujo `From` não seja de domínio verificado na conta — ou entrega direto no spam.
Verifique `spbim.com.br` (ou o domínio que for usar) no painel do provedor, com
os registros SPF/DKIM que ele indicar, antes de testar.

**Na conta da SPBIM isto está conferido:** o servidor aceita como remetente tanto
`no-reply@spbim.com.br` quanto `noreply@spbim.com.br` (o painel do Supabase usa a
segunda grafia, sem hífen). O `.env` usa a **primeira, igual ao usuário que
autentica** — remetente igual a quem autenticou nunca depende de um alias
configurado no provedor.

Isso foi testado indo até o `MAIL FROM` e abortando com `RSET` antes do `DATA`:
o servidor diz se aceita o remetente **sem que nada seja entregue**. Vale lembrar
para a próxima vez que a pergunta aparecer — não é preciso mandar e-mail de
verdade para descobrir se o `From` passa.

⚠ Aceitar o remetente **não é** ter SPF/DKIM publicados. Se a mensagem chegar no
spam, é isso que falta no DNS de `spbim.com.br`.

### 3. Preencher o `.env` da raiz

```ini
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=<a chave/senha do provedor>
SMTP_REMETENTE=no-reply@spbim.com.br
SMTP_REMETENTE_NOME=SPBIM Coordenação
SMTP_SSL=false

APP_BASE_URL=http://localhost:5173
```

- **587 → `SMTP_SSL=false`** (STARTTLS, o normal). **465 → `SMTP_SSL=true`**.
- `SMTP_USER` vazio = envio sem autenticação (só faz sentido em relay interno).
- ⚠ **`APP_BASE_URL` em produção é o domínio real.** Ele monta o link do e-mail,
  e não sai do cabeçalho `Host` de propósito — `Host` é controlado por quem faz a
  requisição, e usá-lo deixaria um atacante escolher para que domínio a vítima
  seria levada.

**Só o `.env` da raiz.** O frontend não manda mais e-mail nenhum; não há
variável de e-mail em `frontend/.env`.

### 4. Conferir

```
cd backend
.venv/Scripts/python.exe -m scripts.verificar_email                     # lê o .env
.venv/Scripts/python.exe -m scripts.verificar_email --conectar          # autentica
.venv/Scripts/python.exe -m scripts.verificar_email --enviar voce@x.com # envia
```

São três degraus, e cada um prova uma coisa diferente — porque as três causas de
"o e-mail não chegou" falham em momentos distintos:

| Modo | Prova | Não prova |
|---|---|---|
| padrão | os campos estão preenchidos e coerentes (587 com SSL ligado é o engano mais comum) | nada sobre o provedor — não há rede |
| `--conectar` | a **credencial vale**: resolve o host, cifra e autentica | que a mensagem seja aceita |
| `--enviar` | o provedor **aceitou** a mensagem — é o único que cobre a verificação de domínio | que tenha sido entregue: confira o spam |

O script sai com código 1 em qualquer problema, então serve em cron ou no CI de
um ambiente novo.

⚠ **Chegou no spam?** Falta SPF/DKIM no DNS do domínio do remetente. Aceito pelo
provedor e entregue na caixa são coisas diferentes, e essa é a etapa 2.

## Os modelos

Vivem em **`backend/app/emails/`** e são lidos pelo servidor no envio:

| Arquivo | Quando |
|---|---|
| `acesso/convite.html` | convite para um projeto |
| `acesso/redefinir-senha.html` | link de definição de senha |
| `acesso/trocar-email.html` | ⚠ nada envia este ainda — o fluxo não existe |

**O README daquela pasta é a fonte sobre eles** — variáveis de cada um, o que
mudou em relação aos originais da VDCity, e as quatro peças que faltam para a
troca de e-mail sair do papel. Aqui fica só o que é de configuração.

Os `{{campo}}` são trocados por `str.replace` — não há motor de template, porque
os arquivos são texto com buracos, sem condicional nem laço.

⚠ **Eles são DADOS DO PACOTE** (`[tool.setuptools.package-data]`, no
`pyproject.toml`). Sem aquela seção o `pip install` do Dockerfile levaria só os
`.py` e o envio morreria com `FileNotFoundError` **apenas em produção** — no
desenvolvimento a aplicação roda do código-fonte, onde os arquivos existem.
A lista precisa alcançar as SUBPASTAS: `emails/*.html` sozinho casa só com a
raiz, e os modelos vivem em `emails/acesso/`.

## Quando não há SMTP configurado

Nada quebra, e é deliberado:

- **Convite** — criado normalmente; a resposta traz `email_enviado: false` e a
  gaveta diz "copie o link abaixo e mande você mesmo". O link já está na tela.
- **Redefinição** — o token é criado e os **admins são avisados pelo sino**
  (`NotifTipo.ACESSO`), que é o comportamento que a plataforma teve desde a
  migration 0010. O admin gera o link em Usuários & acessos.

## Detalhe de implementação que vale saber

O envio é **síncrono**, dentro da requisição, com `TIMEOUT = 12s`. Estourar o
prazo é tratado como falha — e falhar já tem caminho. Assíncrono (via
`BackgroundTasks`) daria resposta mais rápida, mas a tela deixaria de poder dizer
se o e-mail saiu, que é a informação de que quem convidou precisa.
