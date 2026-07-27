# syntax=docker/dockerfile:1

# ---- Etapa 1: build ----
# Compila o app React/Vite. Precisa das devDependencies porque o postinstall
# (scripts/copy-dict.mjs) usa dictionary-pt / dictionary-en para gerar os
# dicionários em public/dictionaries.
FROM node:20-alpine AS build
WORKDIR /app

# Copia os manifestos + a pasta scripts primeiro para aproveitar o cache de
# camada do Docker: enquanto esses arquivos não mudam, o npm ci não roda de novo.
# O scripts/ precisa vir ANTES do npm ci porque o postinstall
# (node scripts/copy-dict.mjs) roda durante o próprio npm ci.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

# Agora o resto do código e o build de produção (saída em /app/dist).
COPY . .
RUN npm run build

# ---- Etapa 2: serve ----
# Imagem final enxuta: só nginx servindo os estáticos. Nada de Node aqui.
FROM nginx:alpine AS serve

# Config com fallback de SPA, MIME de .wasm e gzip dos dicionários.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Estáticos compilados.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
# A imagem base do nginx já sobe com `nginx -g 'daemon off;'`.
