/**
 * Kai Provide Context Tool - Store org/user context
 *
 * Stores free-form markdown content as context files in the knowledge base.
 * Used during onboarding to capture org and user context, or anytime
 * the copilot needs to store synthesized understanding from conversation.
 *
 * See: docs/design/tool-specifications.md (Section 2: kai_provide_context)
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Context types supported by this tool.
 */
type ContextType = 'org' | 'user';

/**
 * Minimum content size (bytes) for context to be considered valid.
 * Matches the validation threshold used in initialize for context detection.
 */
const MIN_CONTENT_SIZE = 50;

/**
 * Tool definition for MCP registration.
 */
export const provideContextToolDefinition = {
  name: 'kai_provide_context',
  description: `Store org or user context in the knowledge base.

USE THIS TOOL WHEN:
- Completing onboarding (storing synthesized org or user context)
- User describes their organization, preferences, or constraints
- Synthesizing context from a conversation (without creating temp files)

This tool stores free-form markdown content as context files. Use it to capture
synthesized understanding, not raw file content (use kai_learn for files).

<examples>
### Organization context
kai_provide_context(
  type="org",
  content="# Organization Context\\n\\nHealthcare startup building patient portals.\\n\\n## Constraints\\n- HIPAA compliance required\\n- Must integrate with Epic EHR"
)

### User context
kai_provide_context(
  type="user",
  content="# User Context\\n\\nSenior developer, 10 years experience.\\n\\n## Preferences\\n- Detailed explanations over brief answers\\n- Prefers TDD approach"
)
</examples>

<hints>
- Content should be markdown format
- Org context = domain, constraints, patterns (spans projects)
- User context = preferences, working style (personal)
- Use kai_learn for file-based knowledge; this tool is for synthesized context
- Calling again with same type replaces previous content
</hints>`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['org', 'user'],
        description: 'Type of context: "org" for organization context, "user" for personal preferences',
      },
      content: {
        type: 'string',
        description: 'Markdown content to store',
      },
    },
    required: ['type', 'content'],
  },
};

/**
 * Zod schema for validating provide-context tool input.
 */
const provideContextInputSchema = z.object({
  type: z.enum(['org', 'user'], { error: 'type must be "org" or "user"' }),
  content: z.string({ error: 'content is required' }).min(1, { message: 'content cannot be empty' }),
});

/**
 * Get the knowledge base directory path.
 * Uses KAI_KNOWLEDGE_DIR env var if set, otherwise defaults to ~/.kai/knowledge/
 */
function getKnowledgeDir(): string {
  return process.env.KAI_KNOWLEDGE_DIR || path.join(os.homedir(), '.kai', 'knowledge');
}

/**
 * Get the file path for a context type.
 */
function getContextFilePath(type: ContextType): string {
  const filename = type === 'org' ? 'org-context.mdc' : 'user-context.mdc';
  return path.join(getKnowledgeDir(), filename);
}

/**
 * Generate .mdc file content with full frontmatter compatible with storage service.
 * Uses type: knowledge so files can be read by storage.get() and parseMdcFile().
 * Follows KnowledgeEntryFrontmatter structure from types.ts.
 */
function generateContextMdc(contextType: ContextType, content: string): string {
  const now = new Date().toISOString();
  const title = contextType === 'org' ? 'Organization Context' : 'User Context';
  const summary =
    contextType === 'org'
      ? 'Organization constraints, domain, and patterns that apply to all tasks'
      : 'User preferences, working style, and communication preferences';
  const slug = contextType === 'org' ? 'org-context' : 'user-context';

  const frontmatter = `---
type: knowledge
title: "${title}"
summary: "${summary}"
created_at: ${now}
updated_at: ${now}
source:
  file: "${slug}.mdc"
  project: null
  path: null
classification:
  category: context
  confidence: 1.0
  reasoning: "Foundation context created by kai_provide_context"
  topics: []
status: active
---`;

  return `${frontmatter}\n\n${content}`;
}

/**
 * Human-readable labels for context types.
 */
const contextTypeLabels: Record<ContextType, string> = {
  org: 'organization',
  user: 'user',
};

/**
 * Build success response markdown.
 */
function buildSuccessMarkdown(type: ContextType, storedPath: string): string {
  const label = contextTypeLabels[type];

  return `# Context Stored

Saved **${label} context** to knowledge base.

**Path:** \`${storedPath}\`

<hints>
- Context will be included in future \`kai_prepare_context\` results
- You can update context by calling this tool again (replaces previous)
- Continue onboarding or tell user to restart Claude Code
</hints>`;
}

/**
 * Handle the kai_provide_context tool call.
 *
 * Pipeline:
 * 1. Validate input (type must be 'org' or 'user', content must be non-empty)
 * 2. Generate filename: org-context.mdc or user-context.mdc
 * 3. Write to ~/.kai/knowledge/ with standard .mdc frontmatter
 * 4. Return confirmation markdown
 */
export async function provideContextToolHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<MCPToolResponse> {
  // Validate input with Zod
  const parseResult = provideContextInputSchema.safeParse(args);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map((i) => i.message).join(', ');
    return markdownResponse(
      `# Invalid Input

${issues}

<hints>
- type must be "org" or "user"
- content must be non-empty markdown text
</hints>`,
      true
    );
  }

  const { type, content } = parseResult.data;

  // Validate content size (matches initialize's detection threshold)
  if (Buffer.byteLength(content, 'utf-8') < MIN_CONTENT_SIZE) {
    return markdownResponse(
      `# Invalid Input

Content is too short (minimum ${MIN_CONTENT_SIZE} bytes required).

<hints>
- Provide meaningful context content
- Include relevant details about ${type === 'org' ? 'the organization, domain, and constraints' : 'your preferences and working style'}
</hints>`,
      true
    );
  }

  // Ensure knowledge directory exists
  const knowledgeDir = getKnowledgeDir();
  try {
    await fs.mkdir(knowledgeDir, { recursive: true });
  } catch (error) {
    return markdownResponse(
      `# Storage Error

Failed to create knowledge directory: ${knowledgeDir}

<hints>
- Check file system permissions
- Verify the path is accessible
</hints>`,
      true
    );
  }

  // Generate .mdc content and write file
  const filePath = getContextFilePath(type);
  const mdcContent = generateContextMdc(type, content);

  try {
    await fs.writeFile(filePath, mdcContent, 'utf-8');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return markdownResponse(
      `# Storage Error

Failed to write context file: ${errorMessage}

<hints>
- Check file system permissions
- Verify the path is accessible: ${filePath}
</hints>`,
      true
    );
  }

  return markdownResponse(buildSuccessMarkdown(type, filePath));
}

/**
 * Export the tool definition and handler together.
 */
export const provideContextTool = {
  definition: provideContextToolDefinition,
  handler: provideContextToolHandler,
};
