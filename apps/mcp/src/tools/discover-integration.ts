/**
 * kai_discover_integration MCP Tool
 *
 * Enables users to add any integration on-the-fly using an AI research agent.
 * The agent discovers API documentation, generates a connector manifest,
 * and registers it for immediate use.
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
  INTEGRATION_RESEARCH_PROMPT,
  buildResearchUserMessage,
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
  name: 'kai_discover_integration',
  description: `Discover and add a new integration connector for any service, API, or tool.

Use this when:
- The user needs an integration that isn't in the built-in list
- The user mentions a specific service (e.g., "I need Twilio", "Add Airtable")
- Setting up a new project that requires custom integrations

The agent will:
1. Research the service's API documentation
2. Identify authentication requirements
3. Extract common operations
4. Generate and register a connector

After discovery, use \`kai_verify_integration\` to test credentials.`,
  inputSchema: {
    type: 'object',
    properties: {
      service_name: {
        type: 'string',
        description: 'Name of the service to integrate (e.g., "Twilio", "Airtable", "Monday.com")',
      },
      hints: {
        type: 'string',
        description:
          'Optional: Documentation URL, specific operations needed, or other context to help discovery',
      },
    },
    required: ['service_name'],
  },
};

// Note: Input types documented in schema above, using Record<string, unknown> in handler

// =============================================================================
// TOOL HANDLER
// =============================================================================

const MAX_TURNS = 10;

async function handler(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<CallToolResult> {
  const service_name = args.service_name as string;
  const hints = args.hints as string | undefined;
  const registry = getConnectorRegistry();

  // Check if connector already exists
  const existing = await registry.resolve(service_name.toLowerCase().replace(/\s+/g, '-'));
  if (existing) {
    return {
      content: [
        {
          type: 'text',
          text: `✅ **Connector "${existing.metadata.displayName}" already exists!**

**ID:** ${existing.metadata.id}
**Type:** ${existing.metadata.type}
**Tier:** ${existing.metadata.tier}
**Status:** ${existing.status}

## Operations Available

${existing.spec.operations
  .slice(0, 5)
  .map((op) => `- \`${op.name}\`: ${op.description}`)
  .join('\n')}
${existing.spec.operations.length > 5 ? `\n... and ${existing.spec.operations.length - 5} more` : ''}

## Usage

\`\`\`
kai_use_integration(
  integration="${existing.metadata.id}",
  operation="<operation-name>",
  params={...}
)
\`\`\`

If you need a different version or to update operations, you can ask to update this connector.`,
        },
      ],
    };
  }

  // Initialize Anthropic client
  const anthropic = new Anthropic();

  // Build research context with Perplexity if available
  const researchContext: ResearchToolContext = {
    registry,
    webSearch: isPerplexityAvailable() ? createPerplexityWebSearch() : undefined,
    fetchUrl: isPerplexityAvailable() ? createPerplexityUrlFetch() : undefined,
  };

  // Log whether Perplexity is being used
  const usingPerplexity = isPerplexityAvailable();
  console.error(
    `[discover-integration] Research mode: ${usingPerplexity ? 'Perplexity (real-time web search)' : 'Claude knowledge only'}`
  );

  // Build user message
  const userMessage = buildResearchUserMessage(service_name, hints);

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
        system: INTEGRATION_RESEARCH_PROMPT,
        tools: integrationResearchTools,
        messages,
      });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        // Extract final text response
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
        // Unexpected stop reason
        finalResponse = extractTextContent(response);
        break;
      }
    }

    if (turnCount >= MAX_TURNS) {
      finalResponse +=
        '\n\n⚠️ Discovery reached maximum iterations. The connector may be partially configured.';
    }

    return {
      content: [
        {
          type: 'text',
          text:
            finalResponse ||
            `Discovery completed for "${service_name}". Check the connector registry for the new integration.`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      content: [
        {
          type: 'text',
          text: `❌ **Discovery failed for "${service_name}"**

**Error:** ${errorMessage}

**Suggestions:**
1. Provide a documentation URL using the \`hints\` parameter
2. Check that the service name is spelled correctly
3. Try a more specific name (e.g., "GitHub API" instead of "GitHub")

**Example:**
\`\`\`
kai_discover_integration(
  service_name="Twilio",
  hints="https://www.twilio.com/docs/usage/api"
)
\`\`\``,
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

export const discoverIntegrationTool = { definition, handler };
