FROM oven/bun:1 AS base

WORKDIR /app

# Pre-install Pulumi dependencies for generated infra projects
WORKDIR /pulumi-base
COPY pulumi-base-package.json ./package.json
RUN bun install --production

WORKDIR /app

ENV PULUMI_BASE_DEPS_DIR=/pulumi-base

# Application build stage — extend as needed for production deploys
COPY . .
RUN bun install

WORKDIR /app/apps/api
CMD ["bun", "run", "dev"]
