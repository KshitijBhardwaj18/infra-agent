# ──────────────────────────────────────────────────────────────────────────────
# Single-image Dockerfile for the whole Heizen monorepo.
#
# Build once → run as N containers (api / web / admin), each container
# overrides CMD in docker-compose to start its respective process.
#
# Layout in the final image:
#   /app/apps/api                   compiled Nest server + entrypoint.sh
#   /app/web-runtime/apps/web       Next.js standalone (web)
#   /app/admin-runtime/apps/admin   Next.js standalone (admin)
#   /app/node_modules               shared runtime deps for api + prisma
#   /app/packages                   shared workspace packages
# ──────────────────────────────────────────────────────────────────────────────

# ─── Build stage ──────────────────────────────────────────────────────────────
FROM oven/bun:1.3.5 AS builder
WORKDIR /app

# These get baked into Next.js client bundles at build time. Override at
# `docker build --build-arg ...` for real prod domains.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_ADMIN_URL=http://localhost:3002
ARG NEXT_PUBLIC_USER_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_USER_APP_URL=$NEXT_PUBLIC_USER_APP_URL

# Copy lockfile + every workspace package.json so Turbo can plan the graph.
# Doing this BEFORE the source copy keeps `bun install` cacheable across
# rebuilds when only source files change.
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/admin/package.json ./apps/admin/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/infra-core/package.json ./packages/infra-core/

RUN bun install --frozen-lockfile || bun install

# Now the source
COPY . .
RUN find . -name 'tsconfig.tsbuildinfo' -delete

# Turbo builds in dependency order: db generate → infra-core/shared → apps.
# Splitting into separate RUNs lets each step be cached individually.
RUN bunx turbo run db:generate --filter=@heizen/db
RUN bunx turbo run build --filter=@heizen/api
RUN bunx turbo run build --filter=@heizen/web
RUN bunx turbo run build --filter=@heizen/admin

# ── Socket.io standalone-tracing workaround ─────────────────────────────────
# Next.js's standalone output tracing misses transitive optional deps of
# socket.io-client. Without this, useWebSocket throws "Cannot find module
# 'ws'" (or 'bufferutil' / 'utf-8-validate') at runtime. The fix is to
# install those into a fresh node_modules and graft them into each
# standalone bundle's node_modules. Applied to BOTH web and admin
# because both import socket.io-client (env/deploy SSE streams).
# Using bun here because oven/bun image doesn't ship npm; bun produces a
# standard Node-compatible node_modules layout.
RUN mkdir -p /tmp/socketio-deps && cd /tmp/socketio-deps && \
    echo '{"name":"socketio-deps","version":"0.0.0","private":true}' > package.json && \
    bun add --no-save \
      ws bufferutil utf-8-validate \
      socket.io-client engine.io-client \
      @socket.io/component-emitter socket.io-parser && \
    mkdir -p /app/apps/web/.next/standalone/node_modules && \
    mkdir -p /app/apps/admin/.next/standalone/node_modules && \
    cp -r node_modules/. /app/apps/web/.next/standalone/node_modules/ && \
    cp -r node_modules/. /app/apps/admin/.next/standalone/node_modules/

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime deps for the API:
#   openssl    - prisma client
#   git, curl  - GitHub clones during indexing
#   tar, bash  - pulumi installer + entrypoint script
#   ca-certs   - HTTPS to GitHub / AWS
RUN apk add --no-cache openssl git curl tar bash ca-certificates unzip

# Pulumi CLI for the api worker
RUN curl -fsSL https://get.pulumi.com | sh && \
    ln -s /root/.pulumi/bin/pulumi /usr/local/bin/pulumi
RUN pulumi version

# Bun runtime (api uses it for some scripts; entrypoint exec's `node` though)
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

# ── API + shared layout ────────────────────────────────────────────────────
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/package.json ./

# ── Web standalone bundle (self-contained Next.js server) ───────────────────
# Standalone layout from Next.js in a monorepo:
#   <bundle>/apps/web/server.js            ← actual entry
#   <bundle>/apps/web/.next/static         ← MUST be copied separately
#   <bundle>/apps/web/public               ← copied if it exists (see note below)
#   <bundle>/node_modules                  ← traced deps + socket.io patch
#
# `public/` is optional in Next.js. Neither web nor admin currently has one
# in this repo. Pre-creating empty target dirs lets us add public/ later
# without editing the Dockerfile.
COPY --from=builder /app/apps/web/.next/standalone ./web-runtime
COPY --from=builder /app/apps/web/.next/static     ./web-runtime/apps/web/.next/static
RUN mkdir -p ./web-runtime/apps/web/public

# ── Admin standalone bundle (same pattern) ──────────────────────────────────
COPY --from=builder /app/apps/admin/.next/standalone ./admin-runtime
COPY --from=builder /app/apps/admin/.next/static     ./admin-runtime/apps/admin/.next/static
RUN mkdir -p ./admin-runtime/apps/admin/public

# API's entrypoint runs prisma db push + bootstraps /pulumi-deps + execs node
COPY apps/api/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# No CMD — docker-compose specifies per-service:
#   api:   ["/entrypoint.sh"]
#   web:   ["node", "web-runtime/apps/web/server.js"]
#   admin: ["node", "admin-runtime/apps/admin/server.js"]
