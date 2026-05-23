FROM oven/bun:1 AS base

WORKDIR /app
COPY . .
RUN bun install

# Pre-install Pulumi dependencies for generated infra projects
RUN mkdir -p /pulumi-deps && \
    cp apps/api/pulumi-base-package.json /pulumi-deps/package.json && \
    cd /pulumi-deps && bun install --production

ENV PULUMI_BASE_DEPS_DIR=/pulumi-deps

WORKDIR /app/apps/api
CMD ["bun", "run", "dev"]
