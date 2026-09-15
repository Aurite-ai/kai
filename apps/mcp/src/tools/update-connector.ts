/**
 * kai_update_connector MCP Tool
 *
 * Updates or refreshes an existing integration connector.
 * Can re-research to get latest API changes, add new operations,
 * or fix issues found during verification.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock, Message, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { MODELS } from '../config.js';
import {
  createPerplexityUrlFetch,
  createPerplexityWebSearch,
  isPerplexityAvailable,
} from '../connectors/agents/perplexity-search.js';
import {
  CONNECTOR_UPDATE_PROMPT,
  buildUpdateUserMessage,
} from '../connectors/agents/research-prompts.js';
import {
  type ResearchToolContext,
  executeResearchTool,
  integrationResearchTools,
} from '../connectors/agents/research-tools.js';
import { getConnectorRegistry } from '../connectors/registry/json-registry.js';
import type { ToolContext } from './types.js';

// =============================================================================
// TOOL DEFINITION
// =============================================================================

const definition: Tool = {
  name: 'kai_update_connector',
  description: `Update or refresh an existing integration connector.

Use this when:
- API endpoints have changed and need refreshing
- Adding new operations to an existing connector
- Fixing authentication issues discovered during verification
- Updating rate limit or base URL information
- Refreshing a connector with latest documentation

The agent will:
1. Load the existing connector
2. Research any changes or additions needed
3. Update the connector manifest
4. Save the updated connector

Examples:
- kai_update_connector(connector_id="slack", action="refresh")
- kai_update_connector(connector_id="stripe", action="add_operations", operations=["create-customer", "list-invoices"])
- kai_update_connector(connector_id="twilio", action="fix_auth", hints="Use basic auth with Account SID and Auth Token")`,
  inputSchema: {
    type: 'object',
    properties: {
      connector_id: {
        type: 'string',
        description: 'The ID of the connector to update (e.g., "slack", "stripe")',
      },
      action: {
        type: 'string',
        enum: ['refresh', 'add_operations', 'fix_auth', 'update_base_url', 'delete'],
        description: `Action to perform:
- refresh: Re-research and update the entire connector
- add_operations: Add specific operations to the connector
- fix_auth: Update authentication configuration
- update_base_url: Update the API base URL
- delete: Remove the connector from the registry`,
      },
      operations: {
        type: 'array',
        items: { type: 'string' },
        description: 'For add_operations: list of operation names to add',
      },
      hints: {
        type: 'string',
        description: 'Optional: Additional context or documentation URL to help the update',
      },
    },
    required: ['connector_id', 'action'],
  },
};

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_TURNS = 8;

// =============================================================================
// TOOL HANDLER
// =============================================================================

async function handler(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<CallToolResult> {
  const connectorId = args.connector_id as string;
  const action = args.action as string;
  const operations = args.operations as string[] | undefined;
  const hints = args.hints as string | undefined;

  const registry = getConnectorRegistry();

  // Load existing connector
  const existing = await registry.resolve(connectorId);

  if (!existing && action !== 'delete') {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Connector not found:** ${connectorId}

Use \`kai_discover_integration\` to create a new connector first.

**Available connectors:**
${(await registry.list()).map((c) => `- ${c.metadata.id}`).join('\n')}`,
        },
      ],
      isError: true,
    };
  }

  // Handle delete action
  if (action === 'delete') {
    if (!existing) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Connector "${connectorId}" does not exist (nothing to delete)`,
          },
        ],
      };
    }

    const deleted = await registry.unregister(connectorId);
    return {
      content: [
        {
          type: 'text',
          text: deleted
            ? `✅ **Connector "${connectorId}" deleted successfully**`
            : `❌ Failed to delete connector "${connectorId}"`,
        },
      ],
      isError: !deleted,
    };
  }

  // At this point we know existing is defined (checked above)
  const connector = existing;

  // Handle simple update actions that don't need AI
  if (action === 'update_base_url' && hints && connector) {
    const updated = {
      ...connector,
      spec: {
        ...connector.spec,
        baseUrl: hints,
      },
    };
    await registry.register(updated);
    return {
      content: [
        {
          type: 'text',
          text: `✅ **Base URL updated for "${connectorId}"**

**New base URL:** ${hints}`,
        },
      ],
    };
  }

  // For refresh, add_operations, fix_auth - use AI agent
  const anthropic = new Anthropic();

  // Build research context with Perplexity if available
  const researchContext: ResearchToolContext = {
    registry,
    webSearch: isPerplexityAvailable() ? createPerplexityWebSearch() : undefined,
    fetchUrl: isPerplexityAvailable() ? createPerplexityUrlFetch() : undefined,
  };

  // Build changes description for the update agent
  let changesDescription = `Action: ${action}\n`;

  if (connector) {
    changesDescription += `\nExisting connector info:\n- Type: ${connector.metadata.type}\n- Operations: ${connector.spec.operations.map((o) => o.name).join(', ')}\n`;
  }

  if (action === 'add_operations' && operations && operations.length > 0) {
    changesDescription += `\nOperations to add: ${operations.join(', ')}`;
  }

  if (action === 'fix_auth') {
    changesDescription += '\nUpdate the authentication configuration.';
  }

  if (action === 'refresh') {
    changesDescription += '\nRe-research and update the entire connector with latest info.';
  }

  if (hints) {
    changesDescription += `\n\nAdditional context: ${hints}`;
  }

  // Build user message based on action
  const userMessage = buildUpdateUserMessage(connectorId, changesDescription);

  // Run agentic loop
  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }];

  let turnCount = 0;
  let finalResponse = '';

  try {
    while (turnCount < MAX_TURNS) {
      turnCount++;

      // Call Claude
      const response = await anthropic.messages.create({
        model: MODELS.ask,
        max_tokens: 4096,
        system: CONNECTOR_UPDATE_PROMPT,
        tools: integrationResearchTools,
        messages,
      });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        finalResponse = extractTextContent(response);
        break;
      }

      if (response.stop_reason === 'tool_use') {
        // Process tool calls
        const toolCalls = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        // Add assistant's response to messages
        messages.push({ role: 'assistant', content: response.content });

        // Execute tools and collect results
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const toolCall of toolCalls) {
          const result = await executeResearchTool(
            toolCall.name,
            toolCall.input as Record<string, unknown>,
            researchContext
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result,
          });
        }

        // Add tool results to messages
        messages.push({ role: 'user', content: toolResults });
      } else {
        finalResponse = extractTextContent(response);
        break;
      }
    }

    if (turnCount >= MAX_TURNS) {
      finalResponse +=
        '\n\n⚠️ Update reached maximum iterations. The connector may be partially updated.';
    }

    return {
      content: [
        {
          type: 'text',
          text:
            finalResponse || `Update completed for "${connectorId}". Check the connector registry.`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      content: [
        {
          type: 'text',
          text: `❌ **Update failed for "${connectorId}"**

**Error:** ${errorMessage}

**Suggestions:**
1. Try a more specific action (e.g., "fix_auth" instead of "refresh")
2. Provide documentation URL in the \`hints\` parameter
3. Check that the connector ID is correct`,
        },
      ],
      isError: true,
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractTextContent(response: Message): string {
  return response.content
    .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

// =============================================================================
// EXPORT
// =============================================================================

export const updateConnectorTool = { definition, handler };
