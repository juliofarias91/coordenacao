# E-mail — configurar o EmailJS (07/08/2026)

A plataforma manda dois e-mails: **redefinição de senha** e **convite de
equipe**. Os dois pelo EmailJS, na mesma conta que já serve a VDCity — mas por
caminhos diferentes, e a diferença é de segurança, não de gosto.

## Por que a senha sai do SERVIDOR e o convite sai do NAVEGADOR

| | Quem envia | Por quê |
|---|---|---|
| **Redefinição de senha** | backend (`services/email.py`), API REST | `POST /auth/senha/esqueci` é **público e anônimo**. O link É a credencial da conta. Se a rota devolvesse o token para o navegador despachar, bastaria pedir a redefinição do e-mail de um coordenador e ler a resposta para tomar a conta dele. |
| **Convite de equipe** | navegador (`services/email.ts`), SDK | Quem convida está autenticado, acabou de criar o token e o link está na tela ao lado dele. Não há nada a esconder de quem já tem. |

É por isso que existem duas chaves: a **pública** vai no bundle do front (para o
convite) e a **privada** fica só no `.env` do servidor (para a senha).

## Passo a passo

### 1. Ligar o uso por API na conta

**Account › Security › "Allow EmailJS API for non-browser applications"** —
precisa estar **ligado**. Sem isso a chamada do backend volta **403** e o e-mail
não sai. É a única etapa que não dá para descobrir pelo erro: o pedido continua
respondendo 202 normalmente (por desenho), e o link simplesmente não chega.

### 2. Pegar as chaves

**Account › General:**

- `Public Key` → `EMAILJS_PUBLIC_KEY` (e `VITE_EMAILJS_PUBLIC_KEY`)
- `Private Key` → `EMAILJS_PRIVATE_KEY` — **só no servidor**

**Email Services** → o `Service ID` do serviço que já existe (o mesmo da VDCity)
→ `EMAILJS_SERVICE` (e `VITE_EMAILJS_SERVICE`).

### 3. Criar o template de REDEFINIÇÃO

**Email Templates › Create New Template.** O `Template ID` vai em
`EMAILJS_TEMPLATE_SENHA`.

Variáveis que o backend manda (`enviar_redefinicao_de_senha`):

| Variável | Conteúdo |
|---|---|
| `{{to_email}}` | e-mail de quem pediu |
| `{{to_name}}` | nome, ou o e-mail se não houver |
| `{{link}}` | `https://<APP_BASE_URL>/definir-senha/<token>` |
| `{{validade}}` | `2 horas` |

⚠ **No campo "To Email" do template, ponha `{{to_email}}`.** É o erro mais comum:
com o destinatário fixo no template, todo pedido de redefinição chega para a
mesma pessoa — e o link é da conta de outra.

Corpo mínimo:

```html
<p>Olá, {{to_name}}.</p>
<p>Recebemos um pedido para redefinir a senha da sua conta na SPBIM.</p>
<p><a href="{{link}}">Criar uma senha nova</a></p>
<p>O link vale por {{validade}}. Se você não pediu isto, ignore este e-mail —
   nada muda até alguém abrir o link.</p>
```

### 4. O template de CONVITE já existe

É o da VDCity (`email-templates/emailjs/invite.html`), com as mesmas variáveis:
`to_email`, `project_name`, `link`, `company`, `cargo`, `invited_by`. O `ID` dele
vai em `VITE_EMAILJS_INVITE_TEMPLATE`.

### 5. Preencher o `.env`

```ini
# servidor — o que manda a redefinição
EMAILJS_SERVICE=service_xxxxxxx
EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
EMAILJS_PRIVATE_KEY=xxxxxxxxxxxxxxxx
EMAILJS_TEMPLATE_SENHA=template_xxxxxxx
APP_BASE_URL=http://localhost:5173

# navegador — o que manda o convite
VITE_EMAILJS_SERVICE=service_xxxxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
VITE_EMAILJS_INVITE_TEMPLATE=template_yyyyyyy
```

⚠ **`APP_BASE_URL` em produção é o domínio real** (`https://seu-dominio`). Ele é
o que monta o link do e-mail, e não sai do cabeçalho `Host` de propósito — `Host`
é controlado por quem faz a requisição, e usá-lo deixaria um atacante escolher
para que domínio a vítima seria levada.

As variáveis `VITE_*` entram no bundle: mexer nelas exige **rebuild** do front,
não só reiniciar a API.

### 6. Conferir

```
cd backend && .venv/Scripts/python.exe -c "from app.services import email; print(email.configurado())"
```

Depois, na tela `/esqueci-senha`, com um e-mail que exista. A resposta é sempre a
mesma frase — exista a conta ou não —, então a confirmação real é o e-mail
chegando.

## O que acontece quando não está configurado

Nada quebra. `POST /auth/senha/esqueci` continua criando o token e, se o envio
falhar ou não houver configuração, **notifica os admins pelo sino** — o
comportamento que a plataforma sempre teve. O e-mail é um caminho a mais, não uma
dependência nova.

## Risco conhecido, e é o preço do EmailJS no navegador

A chave **pública** vai no bundle, então quem inspecionar o front pode disparar o
template de convite para um endereço qualquer. É assim que a VDCity opera, e o
estrago é pequeno: o link só vale se o convite existir no banco, e criá-lo exige
coordenar o projeto.

A chave **privada** não tem esse problema — ela nunca sai do servidor. No dia em
que houver SMTP, o convite pode mudar de lado e `services/email.ts` sai inteiro.
