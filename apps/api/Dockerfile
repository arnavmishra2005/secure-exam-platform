FROM node:22-bookworm-slim AS build
WORKDIR /workspace
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci
RUN npm run typecheck && npm run api:build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /workspace
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends docker.io openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
