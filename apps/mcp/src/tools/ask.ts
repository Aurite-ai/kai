/**
 * Kai Ask Tool - Quick Q&A with AI agent
 *
 * Mid-task question answering. An LLM agent searches the knowledge base,
 * reads relevant files, and synthesizes an answer.
 *
 * See: docs/internal/designs/context-management-system.md
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { MODELS } from '../config.js';
import { buildQASystemPrompt, qaTools, runAgent } from '../knowledge/index.js';
import { generateAgentUsageLine } from '../usage/index.js';
import {
  buildOnboardingHints,
  buildOnboardingWarningBanner,
  checkOnboardingStatus,
} from './onboarding-check.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration.
 */
export const askToolDefinition = {
  name: 'kai_ask',
  description: `Quick Q&A using the project knowledge base.

USE THIS TOOL WHEN:
- Mid-task and need specific information
- User asks a direct question about the project
- Need clarification on a decision or pattern
- Need information beyond what's in .kai/context-guide.md

Searches the knowledge base and synthesizes an answer with source citations.

<examples>
### Direct question
kai_ask(question="Why did we choose keyword search over embeddings?")

### Clarification
kai_ask(question="What's our error handling pattern for API calls?")

### Check if exists
kai_ask(question="Do we have rate limiting requirements documented?")
</examples>

<hints>
- Searches knowledge base with AI-powered answer synthesis
- Use for quick questions mid-task
- For comprehensive context setup, use kai_prepare_context instead
- Returns answer with source citations
</hints>`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      question: {
        type: 'string',
        description: 'What you want to know',
      },
    },
    required: ['question'],
  },
};

/**
 * Zod schema for validating ask tool input.
 */
const askInputSchema = z.object({
  question: z
    .string({ error: 'Missing or empty question' })
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, { message: 'Missing or empty question' }),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Read and parse .kai/context-guide.md to extract KB file references.
 * Returns an array of KB file paths that are already surfaced.
 *
 * @returns Array of KB file paths (e.g., ["/home/user/.kai/knowledge/file.mdc"])
 */
async function getReferencedKBFiles(): Promise<string[]> {
  try {
    const contextGuidePath = path.join(process.cwd(), '.kai/context-guide.md');
    const content = await fs.readFile(contextGuidePath, 'utf-8');

    // Extract KB paths from the markdown table
    // Format: | Title | [/path/to/file.mdc](/path/to/file.mdc) | Reason |
    const kbPathRegex = /\|\s*[^|]+\s*\|\s*\[([^\]]+\.mdc)\]\([^)]+\)\s*\|/g;
    const paths: string[] = [];

    let match = kbPathRegex.exec(content);
    while (match !== null) {
      paths.push(match[1]);
      match = kbPathRegex.exec(content);
    }

    return paths;
  } catch (error) {
    // If .kai/context-guide.md doesn't exist or can't be read, return empty array
    return [];
  }
}

// =============================================================================
// TOOL HANDLER
// =============================================================================

/**
 * Handle the kai_ask tool call.
 *
 * Pipeline:
 * 1. Validate input
 * 2. Read .kai/context-guide.md to get already-referenced KB files
 * 3. Build Q&A system prompt with referenced files
 * 4. Run Q&A agent with list + read tools
 * 5. Return markdown response with answer
 */
export async function askToolHandler(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<MCPToolResponse> {
  const { storage, anthropic, usageTracker } = ctx;

  // Validate input
  const parseResult = askInputSchema.safeParse(args);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map((i) => i.message).join(', ');
    return markdownResponse(
      `Invalid input: ${issues}\n\n<hints>\n- Provide a clear question about the project\n</hints>`,
      true
    );
  }

  const { question } = parseResult.data;

  try {
    // Get KB files already referenced in .kai/context-guide.md
    const referencedKBFiles = await getReferencedKBFiles();

    // Check for onboarding status (warning banner - don't block)
    const onboardingStatus = await checkOnboardingStatus(storage);
    const onboardingHints = buildOnboardingHints(onboardingStatus);
    const warningBanner = buildOnboardingWarningBanner(onboardingStatus);

    // Build system prompt with referenced files
    const systemPrompt = buildQASystemPrompt(referencedKBFiles);

    // Run Q&A agent with usage tracking
    const agentResult = await runAgent(
      {
        model: MODELS.ask,
        systemPrompt,
        tools: qaTools,
        maxTokens: 2000,
      },
      question,
      storage,
      anthropic,
      usageTracker,
      'kai_ask'
    );

    // Build markdown response
    const answer =
      agentResult.textResponse || "I couldn't find information about this in the knowledge base.";

    // Build compact usage line with project totals
    const { usage } = agentResult;
    const usageLine = await generateAgentUsageLine(
      usage.totalInputTokens,
      usage.totalOutputTokens,
      usage.totalCost
    );
    const usageSummary = `

---
${usageLine}`;

    // Build hints, including onboarding warning if context is missing
    const baseHints = [
      '- Full details may be in the cited knowledge base entries',
      '- Use kai_prepare_context if you need broader context for a task',
      '- Use kai_learn to add new information to the knowledge base',
    ];
    const allHints = onboardingHints
      ? [onboardingHints, ...baseHints].join('\n')
      : baseHints.join('\n');

    const markdown = `${warningBanner}# Answer

**Question:** ${question}

${answer}

<hints>
${allHints}
</hints>${usageSummary}`;

    return markdownResponse(markdown);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return markdownResponse(
      `Failed to answer question: ${errorMessage}\n\n<hints>\n- Check if the knowledge base is accessible and try again\n</hints>`,
      true
    );
  }
}

/**
 * Export the tool definition and handler together.
 */
export const askTool = {
  definition: askToolDefinition,
  handler: askToolHandler,
};
