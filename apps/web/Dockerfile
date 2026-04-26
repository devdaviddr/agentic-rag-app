# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Deps (full workspace install, used by builder + migrate) ----
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/rag/package.json packages/rag/package.json
COPY packages/agent/package.json packages/agent/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile=false

# ---- Migrate (one-shot, runs Drizzle migrations against $DATABASE_URL) ----
# Copy the entire deps tree (root + per-package node_modules with pnpm
# symlinks) before overlaying source.
FROM base AS migrate
WORKDIR /repo
COPY --from=deps /repo ./
COPY . .
WORKDIR /repo/packages/db
CMD ["pnpm", "exec", "tsx", "src/migrate.ts"]

# ---- Builder ----
FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo ./
COPY . .
RUN pnpm --filter @app/web... build

# ---- Runtime (Next.js standalone) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
