# syntax=docker/dockerfile:1

# Build the workspace and both deployable artifacts.
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.7.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec tsc --build --force \
    && pnpm --filter @workspace/api-server typecheck \
    && pnpm --filter @workspace/clinic-portal typecheck \
    && pnpm --filter @workspace/api-server build \
    && pnpm --filter @workspace/clinic-portal build

# Install only production dependencies needed by the API and its workspace deps.
FROM node:20-bookworm-slim AS production-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.7.0 --activate
COPY . .
RUN pnpm install --prod --filter @workspace/api-server... --frozen-lockfile

# One portable container serves the API and the compiled portal on the same origin.
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    PORTAL_DIST_DIR=/app/public
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=production-deps --chown=node:node /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=build --chown=node:node /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build --chown=node:node /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=build --chown=node:node /app/artifacts/clinic-portal/dist/public ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
