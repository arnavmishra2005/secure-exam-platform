FROM node:20-alpine AS build
WORKDIR /workspace
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/admin-web ./apps/admin-web
RUN npm install
RUN npm run admin:build

FROM node:20-alpine
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/admin-web/.next ./apps/admin-web/.next
COPY --from=build /workspace/apps/admin-web/public ./apps/admin-web/public
COPY --from=build /workspace/apps/admin-web/package.json ./apps/admin-web/package.json
COPY --from=build /workspace/apps/admin-web/next.config.js ./apps/admin-web/next.config.js
WORKDIR /workspace/apps/admin-web
EXPOSE 3001
CMD ["npx", "next", "start", "-p", "3001"]
