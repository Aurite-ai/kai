#!/usr/bin/env node
/**
 * Kai MCP Server
 *
 * Main entry point for the Kai MCP server.
 * Provides tools for AI assistants to interact with the Kai knowledge base.
 *
 * Tools:
 * - health_check: Verify MCP server connectivity
 * - kai_initialize: Set up a new Kai knowledge base
 * - kai_learn: Categorize and store knowledge files
 * - kai_prepare_context: Retrieve relevant context for a task
 * - kai_ask: Ask questions about the knowledge base
 * - kai_delete: Remove outdated files from the knowledge base
 */

// =============================================================================
// CLI ARGUMENT HANDLING
// =============================================================================

import { SERVER_NAME, SERVER_VERSION } from './config.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${SERVER_NAME} v${SERVER_VERSION}

A context management MCP server for coding copilots.

USAGE:
  kai-mcp                  Start the MCP server (stdio transport)
  kai-mcp --help           Show this help message
  kai-mcp --version        Show version information

DESCRIPTION:
  This is an MCP (Model Context Protocol) server designed to be invoked by
  MCP-compatible clients like Claude Desktop, Roo Code, or other AI coding
  assistants. It communicates via JSON-RPC over stdin/stdout.

  The server provides tools for managing a local knowledge base:
    - health_check           Verify server connectivity
    - kai_initialize      Set up a new knowledge base
    - kai_learn           Categorize and store knowledge files
    - kai_prepare_context Retrieve relevant context for a task
    - kai_ask             Ask questions about the knowledge base

CONFIGURATION:
  Set these environment variables (or use a .env file):
    ANTHROPIC_API_KEY        Required. Your Anthropic API key.
    KAI_KNOWLEDGE_DIR     Optional. Path to knowledge base directory.
                             Default: ~/.kai/knowledge
    KAI_TEMPLATES_DIR     Optional. Path to templates directory.

MCP CLIENT SETUP:
  For Claude Code, use the CLI:
    claude mcp add kai -s project -- npx @aurite-ai/kai

  For other clients, add to your MCP config:
    {
      "mcpServers": {
        "kai": {
          "command": "npx",
          "args": ["@aurite-ai/kai"]
        }
      }
    }

MORE INFO:
  https://github.com/Aurite-ai/kai
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(`${SERVER_NAME} v${SERVER_VERSION}`);
  process.exit(0);
}

// =============================================================================
// MAIN SERVER INITIALIZATION
// =============================================================================

// Load environment variables from .env file
import 'dotenv/config';

import Anthropic from '@anthropic-ai/sdk';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { FileKnowledgeStorageService } from './knowledge/index.js';
import { askTool } from './tools/ask.js';
import { deleteTool } from './tools/delete.js';
import { discoverIntegrationTool } from './tools/discover-integration.js';
import { healthCheckTool } from './tools/health-check.js';
import { initializeTool } from './tools/initialize.js';
import { learnTool } from './tools/learn.js';
import { listIntegrationsTool } from './tools/list-integrations.js';
import { prepareContextTool } from './tools/prepare-context.js';
import { provideContextTool } from './tools/provide-context.js';
import type { ToolContext } from './tools/types.js';
import { updateConnectorTool } from './tools/update-connector.js';
import { usageTool } from './tools/usage.js';
import { useIntegrationTool } from './tools/use-integration.js';
import { verifyIntegrationTool } from './tools/verify-integration.js';
import { createUsageTrackerFromEnv } from './usage/index.js';

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

/**
 * All registered tools.
 * Add new tool imports here as they are created.
 */
const allTools = [
  healthCheckTool.definition,
  initializeTool.definition,
  learnTool.definition,
  provideContextTool.definition,
  prepareContextTool.definition,
  askTool.definition,
  deleteTool.definition,
  usageTool.definition,
  // Integration tools
  listIntegrationsTool.definition,
  useIntegrationTool.definition,
  verifyIntegrationTool.definition,
  discoverIntegrationTool.definition,
  updateConnectorTool.definition,
];

/**
 * Route a tool call to its handler.
 * This is the central dispatch for all tool invocations.
 */
async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<CallToolResult> {
  switch (toolName) {
    case 'health_check':
      return healthCheckTool.handler(args, ctx);

    case 'kai_initialize':
      return initializeTool.handler(args, ctx);

    case 'kai_learn':
      return learnTool.handler(args, ctx);

    case 'kai_provide_context':
      return provideContextTool.handler(args, ctx);

    case 'kai_prepare_context':
      return prepareContextTool.handler(args, ctx);

    case 'kai_ask':
      return askTool.handler(args, ctx);

    case 'kai_delete':
      return deleteTool.handler(args, ctx);

    case 'kai_usage':
      return usageTool.handler(args, ctx);

    // Integration tools
    case 'kai_list_integrations':
      return listIntegrationsTool.handler(args, ctx);

    case 'kai_use_integration':
      return useIntegrationTool.handler(args, ctx);

    case 'kai_verify_integration':
      return verifyIntegrationTool.handler(args, ctx);

    case 'kai_discover_integration':
      return discoverIntegrationTool.handler(args, ctx);

    case 'kai_update_connector':
      return updateConnectorTool.handler(args, ctx);

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${toolName}`,
          },
        ],
        isError: true,
      };
  }
}

// =============================================================================
// MAIN SERVER
// =============================================================================

async function main() {
  // Create local knowledge storage service
  const storage = new FileKnowledgeStorageService();

  // Create shared Anthropic client (used by agent-based tools)
  const anthropic = new Anthropic();

  // Create usage tracker for cost tracking
  const usageTracker = createUsageTrackerFromEnv();

  // Build the shared tool context
  const ctx: ToolContext = { storage, anthropic, usageTracker };

  // Log usage tracking status
  const userIdentity = usageTracker.getUserIdentity();
  if (userIdentity) {
    console.error(
      `[${SERVER_NAME}] Usage tracking enabled for user: ${userIdentity.userId}, org: ${userIdentity.organizationId}`
    );
  } else {
    console.error(`[${SERVER_NAME}] Usage tracking enabled (local session only)`);
  }

  // Create MCP server
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ---------------------------------------------------------------------------
  // TOOL HANDLERS
  // ---------------------------------------------------------------------------

  /**
   * List all available tools.
   * Called by MCP clients to discover what tools are available.
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  /**
   * Handle tool calls.
   * Routes the call to the appropriate tool handler.
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return routeToolCall(name, args ?? {}, ctx);
  });

  // ---------------------------------------------------------------------------
  // START SERVER
  // ---------------------------------------------------------------------------

  // Connect via stdio (standard for MCP servers)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup (to stderr so it doesn't interfere with MCP protocol on stdout)
  console.error(`[${SERVER_NAME}] Server started successfully`);
  console.error(`[${SERVER_NAME}] Working directory: ${process.cwd()}`);
  console.error(`[${SERVER_NAME}] Tools available: ${allTools.map((t) => t.name).join(', ')}`);
}

// Run the server
main().catch((error) => {
  console.error('[kai-mcp-server] Fatal error:', error);
  process.exit(1);
});
