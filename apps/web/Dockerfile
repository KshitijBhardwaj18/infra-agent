FROM oven/bun:1.3.5 AS builder
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/infra-core/package.json ./packages/infra-core/
COPY packages/shared/package.json ./packages/shared/

RUN (bun install --frozen-lockfile || bun install; test -d node_modules/.bun)

COPY . .

RUN mkdir -p apps/web/public
RUN find . -name 'tsconfig.tsbuildinfo' -delete
RUN bunx turbo run build --filter=@heizen/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/packages ./packages

EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "apps/web"]
