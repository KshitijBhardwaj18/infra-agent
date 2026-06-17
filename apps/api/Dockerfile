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

RUN find . -name 'tsconfig.tsbuildinfo' -delete
RUN bunx turbo run build --filter=@heizen/db
RUN bunx turbo run db:generate --filter=@heizen/db
RUN bunx turbo run build --filter=@heizen/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl git curl tar bash ca-certificates

RUN curl -fsSL https://get.pulumi.com | sh && \
    ln -s /root/.pulumi/bin/pulumi /usr/local/bin/pulumi

RUN pulumi version

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

COPY apps/api/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
