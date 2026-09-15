/**
 * Health Check Tool - Verify MCP server connectivity
 *
 * A simple diagnostic tool that confirms the Kai MCP server is running
 * and responsive. Returns server identity and available tools.
 */

import { SERVER_NAME, SERVER_VERSION } from '../config.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration.
 */
export const healthCheckToolDefinition = {
  name: 'health_check',
  description: `Check if the Kai MCP server is running correctly.

This tool verifies the MCP connection is working.

Actions:
- ping: Confirm MCP server is alive`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['ping'],
        description: 'Type of health check',
      },
    },
    required: ['action'],
  },
};

/**
 * Handle the health_check tool call.
 *
 * @param args - Tool arguments from MCP client
 * @param _ctx - Tool context (unused for health check)
 * @returns MCP tool response with server status
 */
export async function healthCheckToolHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<MCPToolResponse> {
  const action = (args as { action?: string }).action || 'ping';

  if (action === 'ping') {
    return markdownResponse(
      `# Kai MCP Server

**Status:** Running ✅
**Server:** ${SERVER_NAME}
**Version:** ${SERVER_VERSION}
**Timestamp:** ${new Date().toISOString()}`
    );
  }

  return markdownResponse(`Unknown action: ${action}\n\nValid actions: ping`, true);
}

/**
 * Export the tool definition and handler together.
 */
export const healthCheckTool = {
  definition: healthCheckToolDefinition,
  handler: healthCheckToolHandler,
};
