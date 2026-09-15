#!/usr/bin/env bash
# Adds the kai MCP server to Claude Code for this project.
# Reads ANTHROPIC_API_KEY and KAI_SESSION_TOKEN from apps/mcp/.env

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found" >&2
  exit 1
fi

# Source the .env file to get variables
set -a
source "$ENV_FILE"
set +a

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY not set in $ENV_FILE" >&2
  exit 1
fi

if [ -z "${KAI_SESSION_TOKEN:-}" ]; then
  echo "Error: KAI_SESSION_TOKEN not set in $ENV_FILE" >&2
  exit 1
fi

claude mcp add kai \
  -s project \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e KAI_SESSION_TOKEN="$KAI_SESSION_TOKEN" \
  -e NODE_ENV=development \
  -e KAI_KNOWLEDGE_DIR="$REPO_ROOT/.kai-knowledge" \
  -- node "$REPO_ROOT/apps/mcp/dist/index.js"

echo "Done! Kai MCP server added to Claude Code."
