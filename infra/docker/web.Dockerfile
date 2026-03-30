# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable pnpm

# Install dependencies (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json  packages/types/
COPY packages/ui/package.json     packages/ui/
COPY packages/sync/package.json   packages/sync/
COPY apps/web/package.json        apps/web/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
ARG VITE_API_URL=http://localhost
ARG VITE_ELECTRIC_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ELECTRIC_URL=$VITE_ELECTRIC_URL

RUN pnpm --filter @projecta/types build && \
    pnpm --filter @projecta/ui build && \
    cd apps/web && npx vite build

# Runtime — nginx
FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
