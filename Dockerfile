# syntax=docker/dockerfile:1

# ---------------------------------------------------------
# Stage 1: Build Frontend UI & Node Server Bundles
# ---------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build prerequisites
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests and install all dependencies (including devDependencies)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and configuration files
COPY . .

# Build Vite client distribution and Node server bundle
RUN npm run build:ui && npm run build:server

# ---------------------------------------------------------
# Stage 2: Production Multi-Arch Runtime Image (amd64 / arm64)
# ---------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Configure runtime environment variables
ENV NODE_ENV=production \
    PORT=4100 \
    HOST=0.0.0.0 \
    UV_PYTHON=3.12 \
    UV_LINK_MODE=copy \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    PATH="/root/.local/bin:/usr/local/bin:${PATH}"

# Install git (required for worktrees), ca-certificates, and curl (for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install official Astral uv and uvx binaries (multi-arch for linux/amd64 and linux/arm64)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Pre-install Python 3.12 and pre-warm Vectorize Hindsight package cache
# This ensures `uvx hindsight-embed` and `hindsight-embed` run immediately with zero network delay
RUN uv python install 3.12 && \
    uv tool install hindsight-embed && \
    uvx hindsight-embed --help > /dev/null

# Install production-only Node dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy pre-compiled bundles from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Expose Smith ADE web cockpit / REST API (4100) and Hindsight daemon (8888)
EXPOSE 4100 8888

# Periodic container health check against the live REST health endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4100/api/v1/health || exit 1

# Launch the Smith Orchestrator Server & Embedded Hindsight Daemon
CMD ["node", "dist-server/index.cjs"]
