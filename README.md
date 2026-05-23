# Heizen

Multi-tenant SRE platform — deployment plane. Onboarding, deploying, and managing infrastructure on AWS via Docker (AWS CodeBuild) + Pulumi.

## Stack

- Runtime: Bun
- Monorepo: Turborepo
- Backend: NestJS
- Frontend: Next.js 15 (App Router)
- Database: PostgreSQL + Prisma
- Cache + Queue: Redis + BullMQ
- LLM: Vercel AI SDK + Anthropic Claude
- Auth: Better Auth + GitHub OAuth
- Deployment engine: Pulumi Automation API
- Docker builds: AWS CodeBuild

## Structure

```
heizen/
├── apps/
│   ├── api/        NestJS backend (REST + SSE + WebSocket + BullMQ workers)
│   └── web/        Next.js 15 frontend
├── packages/
│   ├── db/         Prisma schema + generated client
│   ├── shared/     Shared types and constants
│   └── infra-core/ Template engine + CodeBuild + Pulumi Automation
```

## Local setup

```bash
bun install
cp apps/api/.env.example apps/api/.env       # fill in secrets
cp apps/web/.env.example apps/web/.env
bun run db:generate
bun run db:push                              # creates tables in DATABASE_URL
bun run dev                                  # starts api + web
```

You need a Postgres and Redis instance reachable via `DATABASE_URL` / `REDIS_URL`.
A convenience `docker-compose.dev.yml` is included.

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Build phases

This repo is built in three phases:

1. **Foundation** — monorepo, `packages/db`, `packages/shared`, `packages/infra-core`.
2. **API** — `apps/api` NestJS app with all controllers, BullMQ workers, SSE, WebSocket.
3. **Web** — `apps/web` Next.js 15 app with full UI.

## What this is NOT

Not a monitoring or incident platform. No log polling, no maintenance pipeline. This is the deployment plane only.
