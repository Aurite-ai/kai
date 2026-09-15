/**
 * Kai Learn Tool - Intelligent file ingestion
 *
 * Accepts files/folders, classifies each using an LLM categorization agent,
 * and stores them in the knowledge base as .mdc files.
 * Also detects integrations and sensitive data during ingestion.
 *
 * See: docs/internal/designs/context-management-system.md
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { MODELS } from '../config.js';
import {
  type IntegrationDescriptor,
  extractIntegrationsFrom1PasswordRefs,
  extractIntegrationsFromPatterns,
  mergeIntegration,
  mergeSecretsWithIntegrations,
} from '../integrations/index.js';
import {
  type AgentResult,
  type AgentUsageStats,
  CATEGORIZATION_PROMPT,
  CONTRADICTION_CHECK_PROMPT,
  FILE_SIZE_LIMIT,
  KnowledgeStorageError,
  type SaveKnowledgeEntryInput,
  buildCategorizationUserMessage,
  categorizationTools,
  contradictionCheckTools,
  runAgent,
} from '../knowledge/index.js';
import { generateAgentUsageLine } from '../usage/index.js';
import { envVaultProvider, redactSensitiveData } from '../vault/index.js';
import { generateProjectHash } from './onboarding-check.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

/**
 * Tool definition for MCP registration.
 */
export const learnToolDefinition = {
  name: 'kai_learn',
  description: `Send files or folders to Kai to learn from and add to the knowledge base.

USE THIS TOOL WHEN:
- User shares files/folders and wants Kai to "learn" from them
- User provides policy documents, specs, or reference materials
- User says "here's our...", "learn this", "add this to context"
- After completing work the user wants preserved as knowledge

Kai's agents will:
1. Read files from the provided paths
2. Classify what kind of knowledge each file contains
3. Store in the knowledge base with metadata
4. Files will be available for future context surfacing

<examples>
### Single file
kai_learn(paths=["docs/api-guidelines.md"], description="Our company's API design standards")

### Entire folder
kai_learn(paths=["docs/"], description="All our documentation files")

### Multiple paths
kai_learn(paths=["docs/api-guidelines.md", "specs/"], description="API guidelines and specs")
</examples>

<hints>
- Accepts both files AND folders — folders are processed recursively
- Description helps classification but isn't required
- File size limit: 400KB per file
- Use kai_prepare_context to surface learned knowledge for a task
</hints>`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      paths: {
        type: 'array',
        description: 'File or folder paths to process (relative or absolute)',
        items: {
          type: 'string',
        },
        minItems: 1,
      },
      description: {
        type: 'string',
        description: 'Optional description of what these files contain / why they matter',
      },
    },
    required: ['paths'],
  },
};

/**
 * Zod schema for validating learn tool input.
 */
const learnInputSchema = z.object({
  paths: z
    .array(z.string(), { error: 'Missing or empty paths array' })
    .min(1, { message: 'paths array cannot be empty' }),
  description: z.string().optional(),
});

/**
 * Result for a single file learning process
 */
interface FileLearnResult {
  filename: string;
  filepath: string;
  success: boolean;
  title?: string;
  category?: string;
  summary?: string;
  topics?: string[];
  error?: string;
  slug?: string;
  created?: boolean;
  /** Number of sensitive data items redacted */
  redactedCount?: number;
  /** Integrations detected in this file */
  integrationsDetected?: string[];
}

/**
 * Aggregate results for integrations and secrets across all files
 */
interface LearnAggregateResults {
  /** All integrations discovered across files */
  integrations: IntegrationDescriptor[];
  /** Total secrets redacted across files */
  totalSecretsRedacted: number;
  /** Secrets by type */
  secretsByType: Map<string, number>;
}

/**
 * Check if a path is a directory
 */
async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get all files in a directory recursively
 */
async function getFilesRecursively(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip hidden files and common non-content directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return files;
}

/**
 * Resolve paths to a list of files (expanding directories)
 */
async function resolvePaths(paths: string[]): Promise<{ files: string[]; errors: string[] }> {
  const files: string[] = [];
  const errors: string[] = [];

  for (const inputPath of paths) {
    try {
      // Check if path exists
      await fs.access(inputPath);

      if (await isDirectory(inputPath)) {
        // Recursively get all files in directory
        const dirFiles = await getFilesRecursively(inputPath);
        files.push(...dirFiles);
      } else {
        files.push(inputPath);
      }
    } catch (error) {
      errors.push(`Path not accessible: ${inputPath}`);
    }
  }

  return { files, errors };
}

/**
 * Read file content from disk
 */
async function readFileContent(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Extract the categorize_file result from agent tool results.
 */
function extractCategorizationResult(agentResult: AgentResult): {
  category: string;
  confidence: number;
  reasoning: string;
  title: string;
  summary: string;
  topics: string[];
  isProjectContext: boolean;
} | null {
  const catResult = agentResult.toolResults.find(
    (r) => (r as Record<string, unknown>).tool === 'categorize_file'
  );
  if (!catResult) return null;
  const r = catResult as Record<string, unknown>;
  return {
    category: r.category as string,
    confidence: r.confidence as number,
    reasoning: r.reasoning as string,
    title: r.title as string,
    summary: r.summary as string,
    topics: r.topics as string[],
    isProjectContext: r.isProjectContext as boolean,
  };
}

/**
 * Extract the report_contradictions result from agent tool results.
 */
function extractContradictionsResult(agentResult: AgentResult): {
  contradictions: Array<{ slug: string; explanation: string; subdirectory?: string }>;
} | null {
  const contradictionsResult = agentResult.toolResults.find(
    (r) => (r as Record<string, unknown>).tool === 'report_contradictions'
  );
  if (!contradictionsResult) return null;
  const r = contradictionsResult as Record<string, unknown>;
  return {
    contradictions: r.contradictions as Array<{
      slug: string;
      explanation: string;
      subdirectory?: string;
    }>,
  };
}

/**
 * Build the user message for the contradiction checking agent.
 *
 * @param filename - Name of the file being checked
 * @param catResult - Categorization result from the first agent
 * @param existingSlug - Slug of the existing KB entry (if updating), to exclude from contradiction checks
 */
function buildContradictionCheckUserMessage(
  filename: string,
  catResult: {
    category: string;
    title: string;
    summary: string;
    topics: string[];
  },
  existingSlug?: string
): string {
  const excludeNote = existingSlug
    ? `\n\n**IMPORTANT:** This file is updating an existing entry with slug "${existingSlug}". Do NOT report this slug as a contradiction - it's the same file being updated.`
    : '';

  return `**New file to check for contradictions:**

Filename: ${filename}
Category: ${catResult.category}
Title: ${catResult.title}
Summary: ${catResult.summary}
Topics: ${catResult.topics.join(', ')}${excludeNote}

Check if this file contradicts any existing files in the knowledge base. Use 'report_contradictions' to report any conflicts found (or an empty array if none).`;
}

// =============================================================================
// MARKDOWN RESPONSE BUILDERS
// =============================================================================

function buildLearnNoFilesMarkdown(): string {
  return `# No Files Found

No accessible files found in the provided paths.

<hints>
- Check that the paths exist and are accessible
- Provide at least one file or folder path
- Folders are searched recursively (hidden files and node_modules are skipped)
</hints>`;
}

/**
 * Enhanced markdown builder that includes integration and secret information
 */
function buildLearnSuccessMarkdownWithAggregates(
  results: FileLearnResult[],
  aggregates: LearnAggregateResults,
  contradictions?: Array<{
    filename: string;
    slug: string;
    explanation: string;
    subdirectory?: string;
  }>
): string {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const created = successful.filter((r) => r.created).length;
  const updated = successful.length - created;

  // Header
  const parts: string[] = [];
  const counts: string[] = [];
  if (created > 0) counts.push(`${created} added`);
  if (updated > 0) counts.push(`${updated} updated`);
  if (failed.length > 0) counts.push(`${failed.length} failed`);

  parts.push('# Context Received\n');
  parts.push(`Processed **${results.length} files** — ${counts.join(', ')}:\n`);

  // File table
  if (failed.length > 0) {
    // Table with status column (mixed or all-failed)
    parts.push('| File | Status | Details |');
    parts.push('|------|--------|---------|');
    for (const r of results) {
      if (r.success) {
        parts.push(
          `| \`${r.filename}\` | ✅ ${r.created ? 'Added' : 'Updated'} | ${r.category} — ${r.summary || r.title} |`
        );
      } else {
        parts.push(`| \`${r.filename}\` | ❌ Failed | ${r.error} |`);
      }
    }
  } else {
    // All successful
    parts.push('| File | Category | What Kai Found |');
    parts.push('|------|----------|-------------------|');
    for (const r of successful) {
      parts.push(
        `| \`${r.filename}\` | ${r.category} | ${r.summary || r.title}${r.created === false ? ' (updated existing entry)' : ''} |`
      );
    }
  }

  // Key topics section
  if (successful.length > 0) {
    parts.push('\n## Key Topics Learned\n');
    for (const r of successful) {
      const topicDetail = r.summary || r.title || '';
      parts.push(`- **${r.title}** — ${topicDetail}`);
    }
  }

  // Integrations section
  if (aggregates.integrations.length > 0) {
    parts.push('\n## 🔌 Integrations Discovered\n');
    parts.push(
      'Kai detected and stored these integration descriptors in `~/.kai/integrations/`:\n'
    );
    parts.push('| Integration | Type | Operations | Auth |');
    parts.push('|-------------|------|------------|------|');
    for (const integration of aggregates.integrations) {
      const ops = integration.operations.map((op) => op.name).join(', ');
      parts.push(
        `| **${integration.displayName}** | ${integration.type} | ${ops} | ${integration.authentication.method} |`
      );
    }
    parts.push('\nThese integrations are now available for agents to use automatically.');
  }

  // Secrets redaction section
  if (aggregates.totalSecretsRedacted > 0) {
    parts.push('\n## 🔐 Sensitive Data Handled\n');
    parts.push(
      `**${aggregates.totalSecretsRedacted} credential(s)** were detected, stored in vault, and redacted from knowledge base:\n`
    );
    for (const [secretType, count] of aggregates.secretsByType) {
      const typeName = secretType.replace(/_/g, ' ');
      parts.push(
        `- ${typeName}: ${count} → stored in \`~/.kai/.env\` and referenced via \`vault://env/...\``
      );
    }
    parts.push(
      '\n✅ **Secrets are now stored in your vault** at `~/.kai/.env` and can be retrieved by integrations.'
    );
  }

  // Contradictions section
  if (contradictions && contradictions.length > 0) {
    parts.push('\n## ⚠️ Contradictions Detected\n');
    parts.push(
      'The following existing files contradict the new file(s). Consider removing outdated information:\n'
    );
    for (const c of contradictions) {
      const location = c.subdirectory ? `${c.subdirectory}/${c.slug}` : c.slug;
      parts.push(`- **${location}** (from \`${c.filename}\`)`);
      parts.push(`  ${c.explanation}\n`);
    }
  }

  // Hints
  parts.push('\n<hints>');
  parts.push('- Use `kai_prepare_context` to surface this knowledge for a specific task');
  parts.push('- Send more files anytime — Kai handles classification automatically');
  if (aggregates.integrations.length > 0) {
    parts.push(
      '- Integrations are ready — agents can now connect to detected services without manual config'
    );
  }
  if (aggregates.totalSecretsRedacted > 0) {
    parts.push('- Credentials are safely referenced via vault — never stored in plain text');
  }
  if (contradictions && contradictions.length > 0) {
    parts.push(
      '- Ask the user for permission to remove the outdated files with the kai_delete tool'
    );
  }
  if (failed.length > 0) {
    parts.push('- Large files can be split into smaller, focused documents');
  }
  parts.push('</hints>');

  return parts.join('\n');
}

// =============================================================================
// TOOL HANDLER
// =============================================================================

/**
 * Handle the kai_learn tool call.
 *
 * Pipeline:
 * 1. Validate input
 * 2. Resolve paths (expand directories)
 * 3. For each file: read → validate size → categorization agent → storage.save()
 * 4. Build markdown response
 */
export async function learnToolHandler(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<MCPToolResponse> {
  const { storage, anthropic, usageTracker } = ctx;

  // Validate input with Zod
  const parseResult = learnInputSchema.safeParse(args);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map((i) => i.message).join(', ');
    return markdownResponse(
      `Invalid input: ${issues}\n\n<hints>\n- Provide at least one file or folder path\n</hints>`,
      true
    );
  }

  const { paths, description } = parseResult.data;

  // Resolve paths to files
  const { files, errors: pathErrors } = await resolvePaths(paths);

  if (files.length === 0) {
    return markdownResponse(buildLearnNoFilesMarkdown(), true);
  }

  // Process each file
  const results: FileLearnResult[] = [];

  // Track total usage across all files
  const totalUsage: AgentUsageStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    llmCallCount: 0,
    totalLatencyMs: 0,
  };

  // Track aggregates for integrations and secrets
  const aggregates: LearnAggregateResults = {
    integrations: [],
    totalSecretsRedacted: 0,
    secretsByType: new Map(),
  };
  const allContradictions: Array<{
    filename: string;
    slug: string;
    explanation: string;
    subdirectory?: string;
  }> = [];

  // Add path errors as failed results
  for (const pathError of pathErrors) {
    results.push({
      filename: pathError,
      filepath: pathError,
      success: false,
      error: pathError,
    });
  }

  for (const filePath of files) {
    const filename = path.basename(filePath);

    try {
      // Step 1: Read file content from disk
      let content: string;
      try {
        content = await readFileContent(filePath);
      } catch (error) {
        results.push({
          filename,
          filepath: filePath,
          success: false,
          error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        continue;
      }

      // Step 2: Validate file size
      if (Buffer.byteLength(content, 'utf-8') > FILE_SIZE_LIMIT) {
        const sizeKB = Math.round(Buffer.byteLength(content, 'utf-8') / 1024);
        const limitKB = Math.round(FILE_SIZE_LIMIT / 1024);
        results.push({
          filename,
          filepath: filePath,
          success: false,
          error: `File too large (${sizeKB} KB, limit ${limitKB} KB)`,
        });
        continue;
      }

      // Step 2.5: Detect sensitive data and redact before storing
      const redactionResult = redactSensitiveData(content);
      const contentToStore = redactionResult.redactedContent;
      const secretsDetected = redactionResult.matches;

      // Track secrets for aggregates and store them in the vault
      if (secretsDetected.length > 0) {
        aggregates.totalSecretsRedacted += secretsDetected.length;
        for (const secret of secretsDetected) {
          const count = aggregates.secretsByType.get(secret.type) ?? 0;
          aggregates.secretsByType.set(secret.type, count + 1);

          // Store the detected secret in the vault
          // Skip 1Password references - they're already secure references
          if (secret.type !== '1password_reference') {
            try {
              await envVaultProvider.setSecret(secret.suggestedVaultPath, secret.value);
            } catch (vaultError) {
              // Log but don't fail the learning process if vault storage fails
              console.warn(
                `Warning: Failed to store secret ${secret.suggestedVaultPath} in vault:`,
                vaultError instanceof Error ? vaultError.message : 'Unknown error'
              );
            }
          }
        }
      }

      // Step 2.6: Extract integrations from content (using original content for detection)
      const integrationResult = extractIntegrationsFromPatterns(content, {
        sourceFile: filePath,
        detectedSecrets: secretsDetected,
      });

      // Save detected integrations from pattern matching
      const fileIntegrations: string[] = [];
      for (const integration of integrationResult.integrations) {
        // Merge secrets info with integration
        const enhancedIntegration = mergeSecretsWithIntegrations([integration], secretsDetected)[0];
        // Save/merge integration
        const saved = await mergeIntegration(enhancedIntegration);
        fileIntegrations.push(saved.displayName);
        // Track in aggregates (avoid duplicates by id)
        if (!aggregates.integrations.find((i) => i.id === saved.id)) {
          aggregates.integrations.push(saved);
        }
      }

      // Step 2.7: Extract integrations from 1Password references (op:// URLs)
      // This enables "zero copy-paste" enterprise workflow where users mention
      // credentials stored in 1Password and Kai automatically understands
      // what integrations are needed
      const opIntegrationResult = extractIntegrationsFrom1PasswordRefs(content, {
        sourceFile: filePath,
      });

      // Save integrations detected from 1Password references
      for (const integration of opIntegrationResult.integrations) {
        // Check if we already found this integration via pattern matching
        if (!aggregates.integrations.find((i) => i.id === integration.id)) {
          // Save/merge integration
          const saved = await mergeIntegration(integration);
          fileIntegrations.push(saved.displayName);
          aggregates.integrations.push(saved);
        }
      }

      // Log unmatched 1Password references for debugging
      if (opIntegrationResult.unmatched.length > 0) {
        console.warn(
          `Note: Found ${opIntegrationResult.unmatched.length} 1Password reference(s) that couldn't be mapped to known integrations:`,
          opIntegrationResult.unmatched
        );
      }

      // Step 3: Run categorization agent (on redacted content) with usage tracking
      const userMessage = buildCategorizationUserMessage(filename, contentToStore, description);
      const agentResult = await runAgent(
        {
          model: MODELS.categorization,
          systemPrompt: CATEGORIZATION_PROMPT,
          tools: categorizationTools,
          maxIterations: 1,
        },
        userMessage,
        storage,
        anthropic,
        usageTracker,
        'kai_learn'
      );

      // Accumulate usage stats
      totalUsage.totalInputTokens += agentResult.usage.totalInputTokens;
      totalUsage.totalOutputTokens += agentResult.usage.totalOutputTokens;
      totalUsage.totalCost += agentResult.usage.totalCost;
      totalUsage.llmCallCount += agentResult.usage.llmCallCount;
      totalUsage.totalLatencyMs += agentResult.usage.totalLatencyMs;

      // Step 4: Extract categorization result from agent tool call
      const catResult = extractCategorizationResult(agentResult);
      if (!catResult) {
        results.push({
          filename,
          filepath: filePath,
          success: false,
          error: 'Categorization agent did not produce result',
        });
        continue;
      }

      // Step 4.5: Check if this file already exists in KB (to exclude from contradiction checks)
      // Build the unique title that will be used for storage
      const projectDir = process.cwd();
      const projectHash = generateProjectHash(projectDir);
      const uniqueTitle = `${catResult.title} [${projectHash}]`;

      // Check if an entry with this title already exists
      const existingEntries = await storage.list({ status: 'active' }, [projectHash]);
      const existingEntry = existingEntries?.find((e) => e.title === uniqueTitle);
      const existingSlug = existingEntry?.slug;

      // Step 5: Run contradiction checking agent
      const contradictionCheckUserMessage = buildContradictionCheckUserMessage(
        filename,
        catResult,
        existingSlug
      );
      const contradictionCheckResult = await runAgent(
        {
          model: MODELS.contradiction,
          systemPrompt: CONTRADICTION_CHECK_PROMPT,
          tools: contradictionCheckTools,
          maxIterations: 10,
        },
        contradictionCheckUserMessage,
        storage,
        anthropic,
        usageTracker,
        'kai_learn'
      );

      // Accumulate usage stats
      totalUsage.totalInputTokens += contradictionCheckResult.usage.totalInputTokens;
      totalUsage.totalOutputTokens += contradictionCheckResult.usage.totalOutputTokens;
      totalUsage.totalCost += contradictionCheckResult.usage.totalCost;
      totalUsage.llmCallCount += contradictionCheckResult.usage.llmCallCount;
      totalUsage.totalLatencyMs += contradictionCheckResult.usage.totalLatencyMs;

      // Step 6: Extract contradiction results
      const contradictionsResult = extractContradictionsResult(contradictionCheckResult);
      if (contradictionsResult && contradictionsResult.contradictions.length > 0) {
        for (const contradiction of contradictionsResult.contradictions) {
          allContradictions.push({
            filename,
            slug: contradiction.slug,
            explanation: contradiction.explanation,
            subdirectory: contradiction.subdirectory,
          });
        }
      }

      // Step 7: Build save input and store
      // (uniqueTitle already computed in Step 4.5)
      const saveInput: SaveKnowledgeEntryInput = {
        title: uniqueTitle,
        summary: catResult.summary,
        content: contentToStore, // Store redacted content, not original
        sourceFile: filename,
        sourcePath: filePath,
        category: catResult.category as SaveKnowledgeEntryInput['category'],
        confidence: catResult.confidence,
        reasoning: description
          ? `${catResult.reasoning} (User note: ${description})`
          : catResult.reasoning,
        topics: catResult.topics,
        // Add subdirectory if this is project-specific context (determined by agent)
        subdirectory: catResult.isProjectContext ? projectHash : undefined,
      };

      const entry = await storage.save(saveInput);

      // Determine if this was a create or update based on timestamps
      const wasCreated = entry.created_at === entry.updated_at;

      results.push({
        filename,
        filepath: filePath,
        success: true,
        title: catResult.title,
        category: entry.classification.category,
        summary: catResult.summary,
        topics: catResult.topics,
        slug: entry.slug,
        created: wasCreated,
        redactedCount: secretsDetected.length,
        integrationsDetected: fileIntegrations,
      });
    } catch (error) {
      let errorMessage: string;
      if (error instanceof KnowledgeStorageError) {
        errorMessage = `Storage error (${error.code}): ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = 'Unknown error';
      }
      results.push({
        filename,
        filepath: filePath,
        success: false,
        error: errorMessage,
      });
    }
  }

  // Build markdown with usage summary
  let markdown = buildLearnSuccessMarkdownWithAggregates(results, aggregates, allContradictions);

  // Add compact usage line with project totals
  if (totalUsage.llmCallCount > 0) {
    const usageLine = await generateAgentUsageLine(
      totalUsage.totalInputTokens,
      totalUsage.totalOutputTokens,
      totalUsage.totalCost
    );
    markdown += `

---
${usageLine}`;
  }

  return markdownResponse(markdown);
}

/**
 * Export the tool definition and handler together.
 */
export const learnTool = {
  definition: learnToolDefinition,
  handler: learnToolHandler,
};
