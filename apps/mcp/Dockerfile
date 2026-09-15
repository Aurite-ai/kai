# Kai MCP Server Docker Image
#
# Multi-stage build for minimal runtime image.
# Uses the pre-bundled CJS file for smallest footprint.
#
# Build: docker build -t kai/mcp .
# Run:   docker run -i -e ANTHROPIC_API_KEY kai/mcp

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /build

# Copy monorepo package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy source code (templates are now inside apps/mcp/)
COPY tsconfig.base.json ./
COPY apps/mcp/ apps/mcp/

# Bundle the MCP server (includes copying templates to dist/)
RUN pnpm --filter @aurite-ai/kai bundle

# =============================================================================
# Stage 2: Runtime
# =============================================================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy bundled file and templates
COPY --from=builder /build/apps/mcp/dist/kai-mcp.cjs ./kai-mcp.cjs
COPY --from=builder /build/apps/mcp/dist/templates ./templates

# Create non-root user for security
RUN addgroup -g 1001 -S kai && \
    adduser -u 1001 -S kai -G kai && \
    chown -R kai:kai /app

# Create .kai directory for knowledge base (can be mounted as volume)
RUN mkdir -p /home/kai/.kai/knowledge && \
    chown -R kai:kai /home/kai

USER kai

# Environment
ENV NODE_ENV=production
ENV KAI_KNOWLEDGE_DIR=/home/kai/.kai/knowledge
ENV KAI_TEMPLATES_DIR=/app/templates

# Labels
LABEL org.opencontainers.image.title="Kai MCP Server"
LABEL org.opencontainers.image.description="Context management tools for coding copilots"
LABEL org.opencontainers.image.source="https://github.com/Aurite-ai/kai"
LABEL org.opencontainers.image.licenses="MIT"

# MCP uses stdio transport - the container reads/writes JSON-RPC over stdin/stdout
# Run with: docker run -i kai/mcp
ENTRYPOINT ["node", "kai-mcp.cjs"]
