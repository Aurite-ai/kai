/**
 * Kai Usage Tool - View project usage summary
 *
 * Displays token usage and cost information for the current project.
 * Shows cumulative totals and per-tool breakdown.
 *
 * See: docs/internal/designs/context-management-system.md
 */

import {
  type ProjectUsageData,
  formatCost,
  formatTokens,
  getProjectUsageData,
} from '../usage/index.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration.
 */
export const usageToolDefinition = {
  name: 'kai_usage',
  description: `View token usage and cost summary for the current project.

USE THIS TOOL WHEN:
- User asks about usage, costs, or token consumption
- User wants to see how much they've spent
- User asks "how much have I used?"

Shows cumulative project totals and breakdown by tool.

<examples>
### Check usage
kai_usage()
</examples>

<hints>
- Shows project-level cumulative usage (persisted across sessions)
- Costs are estimates based on Anthropic's published pricing
- Usage data is stored in .kai/usage.json
</hints>`,

  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

// =============================================================================
// MARKDOWN RESPONSE BUILDERS
// =============================================================================

function buildUsageSummaryMarkdown(data: ProjectUsageData): string {
  const parts: string[] = [];

  parts.push('# 📊 Project Usage Summary\n');

  // Total usage section
  const { totalUsage } = data;
  const totalTokens = totalUsage.inputTokens + totalUsage.outputTokens;

  parts.push('## Totals\n');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  parts.push(`| **Total Tokens** | ${formatTokens(totalTokens)} |`);
  parts.push(`| Input Tokens | ${formatTokens(totalUsage.inputTokens)} |`);
  parts.push(`| Output Tokens | ${formatTokens(totalUsage.outputTokens)} |`);
  parts.push(`| **Estimated Cost** | ${formatCost(totalUsage.estimatedCostUSD)} |`);
  parts.push(`| Total Calls | ${totalUsage.callCount} |`);

  // Per-tool breakdown
  const toolNames = Object.keys(data.byTool);
  if (toolNames.length > 0) {
    parts.push('\n## Usage by Tool\n');
    parts.push('| Tool | Calls | Tokens | Est. Cost |');
    parts.push('|------|-------|--------|-----------|');

    // Sort by cost descending
    const sortedTools = toolNames.sort(
      (a, b) => data.byTool[b].estimatedCostUSD - data.byTool[a].estimatedCostUSD
    );

    for (const toolName of sortedTools) {
      const toolData = data.byTool[toolName];
      const toolTokens = toolData.inputTokens + toolData.outputTokens;
      const displayName = toolName.replace('kai_', '');
      parts.push(
        `| ${displayName} | ${toolData.callCount} | ${formatTokens(toolTokens)} | ${formatCost(toolData.estimatedCostUSD)} |`
      );
    }
  }

  // Last updated
  if (data.lastUpdated) {
    const date = new Date(data.lastUpdated);
    const formattedDate = date.toLocaleString();
    parts.push(`\n*Last updated: ${formattedDate}*`);
  }

  parts.push('\n<hints>');
  parts.push('- Costs are estimates based on Anthropic pricing');
  parts.push('- Usage is persisted across sessions in .kai/usage.json');
  parts.push('- Each Kai tool call may involve multiple LLM calls');
  parts.push('</hints>');

  return parts.join('\n');
}

function buildNoUsageMarkdown(): string {
  return `# 📊 Project Usage Summary

No usage recorded yet for this project.

<hints>
- Usage is tracked when you use Kai tools (learn, ask, prepare_context)
- Data is stored in .kai/usage.json
- Call this tool again after using Kai tools
</hints>`;
}

// =============================================================================
// TOOL HANDLER
// =============================================================================

/**
 * Handle the kai_usage tool call.
 *
 * Pipeline:
 * 1. Load project usage data from .kai/usage.json
 * 2. Build markdown summary
 * 3. Return response
 */
export async function usageToolHandler(
  _args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<MCPToolResponse> {
  try {
    const data = await getProjectUsageData();

    // Check if there's any usage data
    if (data.totalUsage.callCount === 0) {
      return markdownResponse(buildNoUsageMarkdown());
    }

    const markdown = buildUsageSummaryMarkdown(data);
    return markdownResponse(markdown);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return markdownResponse(
      `Failed to load usage data: ${errorMessage}\n\n<hints>\n- Usage data is stored in .kai/usage.json\n- Try using a Kai tool first to generate usage data\n</hints>`,
      true
    );
  }
}

/**
 * Export the tool definition and handler together.
 */
export const usageTool = {
  definition: usageToolDefinition,
  handler: usageToolHandler,
};
