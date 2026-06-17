FROM oven/bun:1.3.5 AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=https://api.sre-agent.opengig.work
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile || bun install

COPY . .

RUN mkdir -p apps/web/public
RUN find . -name 'tsconfig.tsbuildinfo' -delete
RUN bunx turbo run build --filter=@heizen/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/node_modules ./node_modules

RUN cd /tmp && npm init -y && npm install ws bufferutil utf-8-validate socket.io-client engine.io-client @socket.io/component-emitter socket.io-parser && cp -r node_modules/* /app/node_modules/

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
