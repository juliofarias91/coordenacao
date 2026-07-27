# Imagem do frontend: build estático servido por nginx, que também faz o
# proxy de /api para a API — assim o navegador fala com uma origem só e não
# há CORS nem cookie de terceiro em produção.

FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

# A imagem oficial do nginx processa /etc/nginx/templates/*.template com
# envsubst na subida e escreve o resultado em /etc/nginx/conf.d/. É o que
# permite trocar o endereço da API sem reconstruir a imagem.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Só esta variável é substituída. Sem o filtro, o envsubst também comeria
# `$host`, `$remote_addr` e as demais variáveis do próprio nginx.
ENV NGINX_ENVSUBST_FILTER="API_UPSTREAM" \
    API_UPSTREAM="http://api:8000"

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1
