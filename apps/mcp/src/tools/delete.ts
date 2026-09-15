/**
 * Kai Delete Tool - Remove files from knowledge base
 *
 * Allows deletion of outdated or contradicting files from the knowledge base.
 * Should only be called after user confirmation.
 *
 * See: docs/architecture/02-context-management-system.md
 */

import { z } from 'zod';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration.
 */
export const deleteToolDefinition = {
  name: 'kai_delete',
  description: `Delete files from the Kai knowledge base.

⚠️ IMPORTANT: This tool should ONLY be called after:
1. kai_learn reports contradictions with existing files
2. You ask the user for permission to delete the outdated files
3. The user explicitly approves the deletion

USE THIS TOOL WHEN:
- kai_learn output indicates contradictions with existing KB files
- User confirms they want to remove the outdated/contradicting files
- You need to clean up superseded policies, outdated decisions, or conflicting information

DO NOT USE THIS TOOL:
- Without explicit user permission
- Based solely on your own judgment
- For files that are complementary rather than contradictory

<examples>
### After user approves deletion
kai_delete(slugs=["old-api-guidelines", "deprecated-security-policy"])
</examples>

<hints>
- Always confirm with the user before calling this tool
- Provide context about why files should be deleted
- Deletion is permanent - files cannot be recovered
</hints>`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slugs: {
        type: 'array',
        description: 'Slugs of knowledge base files to delete',
        items: {
          type: 'string',
        },
        minItems: 1,
      },
      subdirectory: {
        type: 'string',
        description:
          'Optional subdirectory within the knowledge base (e.g., project hash for project-specific files)',
      },
    },
    required: ['slugs'],
  },
};

/**
 * Zod schema for validating delete tool input.
 */
const deleteInputSchema = z.object({
  slugs: z
    .array(z.string(), { error: 'Missing or empty slugs array' })
    .min(1, { message: 'slugs array cannot be empty' }),
  subdirectory: z.string().optional(),
});

/**
 * Result for a single file deletion
 */
interface FileDeletionResult {
  slug: string;
  success: boolean;
  title?: string;
  error?: string;
}

// =============================================================================
// MARKDOWN RESPONSE BUILDERS
// =============================================================================

function buildDeleteSuccessMarkdown(results: FileDeletionResult[]): string {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const parts: string[] = [];

  // Header
  parts.push('# Files Deleted from Knowledge Base\n');
  parts.push(
    `Processed **${results.length} files** — ${successful.length} deleted, ${failed.length} failed:\n`
  );

  // Results table
  if (failed.length > 0) {
    parts.push('| Slug | Status | Details |');
    parts.push('|------|--------|---------|');
    for (const r of results) {
      if (r.success) {
        parts.push(`| \`${r.slug}\` | ✅ Deleted | ${r.title || 'File removed'} |`);
      } else {
        parts.push(`| \`${r.slug}\` | ❌ Failed | ${r.error} |`);
      }
    }
  } else {
    // All successful
    parts.push('| Slug | Title |');
    parts.push('|------|-------|');
    for (const r of successful) {
      parts.push(`| \`${r.slug}\` | ${r.title || 'Deleted'} |`);
    }
  }

  // Hints
  parts.push('\n<hints>');
  if (successful.length > 0) {
    parts.push('- Files have been permanently removed from the knowledge base');
    parts.push('- Use `kai_learn` to add updated versions if needed');
    parts.push('- Use `kai_prepare_context` to refresh context for your current task');
  }
  if (failed.length > 0) {
    parts.push('- Some files could not be deleted - they may not exist or have invalid slugs');
  }
  parts.push('</hints>');

  return parts.join('\n');
}

function buildDeleteNoFilesMarkdown(): string {
  return `# No Files to Delete

No file slugs provided.

<hints>
- Provide at least one file slug to delete
- Get slugs from kai_learn contradiction reports
- Always confirm with user before deleting files
</hints>`;
}

// =============================================================================
// TOOL HANDLER
// =============================================================================

/**
 * Handle the kai_delete tool call.
 *
 * Pipeline:
 * 1. Validate input
 * 2. For each slug: attempt to delete from storage
 * 3. Build markdown response
 */
export async function deleteToolHandler(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<MCPToolResponse> {
  const { storage } = ctx;

  // Validate input with Zod
  const parseResult = deleteInputSchema.safeParse(args);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map((i) => i.message).join(', ');
    return markdownResponse(
      `Invalid input: ${issues}\n\n<hints>\n- Provide at least one file slug to delete\n</hints>`,
      true
    );
  }

  const { slugs, subdirectory } = parseResult.data;

  if (slugs.length === 0) {
    return markdownResponse(buildDeleteNoFilesMarkdown(), true);
  }

  // Process each slug
  const results: FileDeletionResult[] = [];

  for (const slug of slugs) {
    try {
      // Get the file first to retrieve its title for the response
      const entry = await storage.get(slug, subdirectory);

      if (!entry) {
        results.push({
          slug,
          success: false,
          error: 'File not found in knowledge base',
        });
        continue;
      }

      // Delete the file (permanent delete)
      await storage.delete(slug, subdirectory, true);

      results.push({
        slug,
        success: true,
        title: entry.title,
      });
    } catch (error) {
      results.push({
        slug,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const allFailed = results.every((r) => !r.success);
  return markdownResponse(buildDeleteSuccessMarkdown(results), allFailed);
}

/**
 * Export the tool definition and handler together.
 */
export const deleteTool = {
  definition: deleteToolDefinition,
  handler: deleteToolHandler,
};
