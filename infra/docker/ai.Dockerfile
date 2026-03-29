# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY apps/ai/package.json         apps/ai/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ai/ apps/ai/
RUN pnpm --filter @projecta/ai build

# Runtime
FROM node:22-alpine

WORKDIR /app
RUN corepack enable pnpm

COPY --from=builder /app/apps/ai/dist     ./dist
COPY --from=builder /app/apps/ai/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/index.js"]
