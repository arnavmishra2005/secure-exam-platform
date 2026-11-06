FROM node:22-bookworm-slim AS build
WORKDIR /workspace
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci && npm run web:build
FROM nginx:1.28-alpine
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY infra/intranet/nginx.conf /etc/nginx/conf.d/default.conf
