/**
 * List Integrations Tool
 *
 * MCP tool for listing all discovered integrations and their status.
 * Provides an overview of available integrations for agents.
 */

import {
  generateIntegrationsSummaryMarkdown,
  listIntegrationSummaries,
  listIntegrations,
} from '../integrations/index.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration
 */
export const listIntegrationsToolDefinition = {
  name: 'kai_list_integrations',
  description: `List all discovered integrations and their status.

Use this tool to see what integrations are available for use. Shows integration names, types, 
available operations, and current status (discovered, configured, verified, error).

Use this before kai_use_integration to know what integrations are available.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        description: 'Filter by integration type (database, api, messaging, etc.)',
      },
      status: {
        type: 'string',
        enum: ['discovered', 'configured', 'verified', 'error'],
        description: 'Filter by status',
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'Output format: summary (default) or detailed',
      },
    },
    required: [],
  },
};

/**
 * Handler for list integrations tool
 */
export async function listIntegrationsToolHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<MCPToolResponse> {
  const typeFilter = args.type as string | undefined;
  const statusFilter = args.status as string | undefined;
  const format = (args.format as string) ?? 'summary';

  try {
    if (format === 'detailed') {
      // Get full integration descriptors
      const integrations = await listIntegrations();

      if (integrations.length === 0) {
        return markdownResponse(`# Discovered Integrations

*No integrations discovered yet.*

Use \`kai_learn\` on files that describe your external services, APIs, or databases to discover integrations.`);
      }

      // Apply filters
      let filtered = integrations;
      if (typeFilter) {
        filtered = filtered.filter((i) => i.type === typeFilter);
      }
      if (statusFilter) {
        filtered = filtered.filter((i) => i.status === statusFilter);
      }

      if (filtered.length === 0) {
        return markdownResponse(`# Discovered Integrations

*No integrations match the specified filters.*

**Filters applied:**
- Type: ${typeFilter ?? 'all'}
- Status: ${statusFilter ?? 'all'}

Try removing filters or use \`kai_learn\` to discover more integrations.`);
      }

      // Generate detailed markdown using the filtered list
      return markdownResponse(await generateIntegrationsSummaryMarkdown(filtered));
    }

    // Summary format
    const summaries = await listIntegrationSummaries();

    if (summaries.length === 0) {
      return markdownResponse(`# Discovered Integrations

*No integrations discovered yet.*

Use \`kai_learn\` on files that describe your external services, APIs, or databases to discover integrations.`);
    }

    // Apply filters
    let filtered = summaries;
    if (typeFilter) {
      filtered = filtered.filter((i) => i.type === typeFilter);
    }
    if (statusFilter) {
      filtered = filtered.filter((i) => i.status === statusFilter);
    }

    if (filtered.length === 0) {
      return markdownResponse(`# Discovered Integrations

*No integrations match the specified filters.*

**Filters applied:**
- Type: ${typeFilter ?? 'all'}
- Status: ${statusFilter ?? 'all'}

Try removing filters or use \`kai_learn\` to discover more integrations.`);
    }

    // Build summary markdown
    const statusIcon = (status: string) => {
      switch (status) {
        case 'verified':
          return '✅';
        case 'configured':
          return '🔧';
        case 'error':
          return '❌';
        default:
          return '🔍';
      }
    };

    const markdown = `# Discovered Integrations

**Total:** ${filtered.length} integration${filtered.length === 1 ? '' : 's'}

| Name | Type | Operations | Auth | Status |
|------|------|------------|------|--------|
${filtered.map((i) => `| ${i.displayName} | ${i.type} | ${i.operationNames.join(', ')} | ${i.authMethod} | ${statusIcon(i.status)} ${i.status} |`).join('\n')}

## Usage

To use an integration:
\`\`\`
kai_use_integration(
  integration: "<integration-id>",
  operation: "<operation-name>",
  params: { ... }
)
\`\`\`

To verify an integration works:
\`\`\`
kai_verify_integration(integration: "<integration-id>")
\`\`\``;

    return markdownResponse(markdown);
  } catch (error) {
    return markdownResponse(
      `Error listing integrations: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }
}

/**
 * Export the tool definition and handler together
 */
export const listIntegrationsTool = {
  definition: listIntegrationsToolDefinition,
  handler: listIntegrationsToolHandler,
};
