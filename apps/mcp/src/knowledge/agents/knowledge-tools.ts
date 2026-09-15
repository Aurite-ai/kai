/**
 * Knowledge Base Agent Tools
 *
 * Internal tools for agents to explore and read from the knowledge base.
 * Includes enriched listing, structured selection, and categorization tools.
 *
 * See: docs/internal/designs/context-management-system.md
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { getFrameworkIds } from '../../config.js';
import { generateProjectHash } from '../../tools/onboarding-check.js';
import type { KnowledgeStorageService } from '../storage/types.js';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Tool definition for listing knowledge base files.
 * Returns enriched listing: slug, title, category, summary, topics per entry.
 */
export const listKnowledgeFilesTool: Tool = {
  name: 'list_knowledge_files',
  description:
    'List all files in the knowledge base with summaries and metadata. Use this to decide which files to read.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

/**
 * Tool definition for reading a specific knowledge base file.
 * Returns the full content of the file.
 */
export const readKnowledgeFileTool: Tool = {
  name: 'read_knowledge_file',
  description:
    'Read the full content of a specific knowledge base file. Use after listing files to read ones relevant to the task/question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'The file slug from the list',
      },
    },
    required: ['slug'],
  },
};

/**
 * Tool definition for selecting files to surface in .kai/context-guide.md.
 * Structured output: agent returns list of slugs with reasons.
 */
export const selectFilesForContextTool: Tool = {
  name: 'select_files_for_context',
  description: 'Select which knowledge base files to surface for this task',
  input_schema: {
    type: 'object' as const,
    properties: {
      selections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'File slug from the knowledge base',
            },
            reason: {
              type: 'string',
              description: 'Brief reason why this file is relevant to the task',
            },
          },
          required: ['slug', 'reason'],
        },
        description: 'Files to surface to the project .kai/context-guide.md file',
      },
    },
    required: ['selections'],
  },
};

/**
 * Tool definition for categorizing a file.
 * Structured output: agent returns category, confidence, reasoning, title, summary, topics.
 */
export const categorizeFileTool: Tool = {
  name: 'categorize_file',
  description: 'Classify the file and extract metadata',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: ['policy', 'requirement', 'reference', 'decision', 'pattern', 'context'],
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
      reasoning: {
        type: 'string',
        description: 'One sentence explaining why this category was chosen',
      },
      title: {
        type: 'string',
        description:
          'Clear, descriptive title. Use proper casing for acronyms. Unique enough to identify among hundreds of files.',
      },
      summary: {
        type: 'string',
        description: '2-4 sentence overview of what this file contains',
      },
      topics: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description: '3-5 key topics as natural language phrases',
      },
      isProjectContext: {
        type: 'boolean',
        description:
          'True if this file contains project-specific information (only relevant to this project). False if it contains general knowledge applicable to multiple projects.',
      },
    },
    required: [
      'category',
      'confidence',
      'reasoning',
      'title',
      'summary',
      'topics',
      'isProjectContext',
    ],
  },
};

/**
 * Tool definition for reporting contradictions.
 * Structured output: agent returns contradicting files with explanations.
 */
export const reportContradictionsTool: Tool = {
  name: 'report_contradictions',
  description:
    'Report files in the knowledge base that contradict the new file being categorized. Use the full path (subdirectory/slug) from the list_knowledge_files output.',
  input_schema: {
    type: 'object' as const,
    properties: {
      contradictions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description:
                'Slug of the contradicting file (just the slug part, not including subdirectory)',
            },
            subdirectory: {
              type: 'string',
              description:
                'Subdirectory of the contradicting file (if any). Extract from the full path shown in list_knowledge_files.',
            },
            explanation: {
              type: 'string',
              description: 'Clear explanation of how the files contradict each other',
            },
          },
          required: ['slug', 'explanation'],
        },
        description: 'List of files that contradict the new file',
      },
    },
    required: ['contradictions'],
  },
};

/**
 * Tool definition for selecting a framework scaffold.
 * Structured output: agent returns framework ID and reason.
 */
export const selectFrameworkTool: Tool = {
  name: 'select_framework',
  description:
    'Select a framework scaffold when the task involves building an agent, workflow, or LLM-powered application',
  input_schema: {
    type: 'object' as const,
    properties: {
      framework: {
        type: 'string',
        enum: getFrameworkIds(),
        description: 'The framework to scaffold',
      },
      reason: {
        type: 'string',
        description: 'Why this framework is appropriate for the task',
      },
    },
    required: ['framework', 'reason'],
  },
};

// =============================================================================
// TOOL GROUPS (for different agent configurations)
// =============================================================================

/** Tools for the retrieval agent (prepare_context): list + read + select files + select framework */
export const retrievalTools: Tool[] = [
  listKnowledgeFilesTool,
  readKnowledgeFileTool,
  selectFilesForContextTool,
  selectFrameworkTool,
];

/** Tools for the Q&A agent (ask): list + read */
export const qaTools: Tool[] = [listKnowledgeFilesTool, readKnowledgeFileTool];

/** Tools for the categorization agent (learn): categorize_file only */
export const categorizationTools: Tool[] = [categorizeFileTool];

/** Tools for the contradiction checking agent (learn): list + read + report_contradictions */
export const contradictionCheckTools: Tool[] = [
  listKnowledgeFilesTool,
  readKnowledgeFileTool,
  reportContradictionsTool,
];

// =============================================================================
// TOOL EXECUTION
// =============================================================================

/**
 * Schema for validating read_knowledge_file tool input.
 */
const readKnowledgeFileInputSchema = z.object({
  slug: z.string().min(1, 'Slug cannot be empty'),
});

/**
 * Schema for validating select_files_for_context tool input.
 */
const selectFilesInputSchema = z.object({
  selections: z.array(
    z.object({
      slug: z.string(),
      reason: z.string(),
    })
  ),
});

/**
 * Schema for validating categorize_file tool input.
 */
const categorizeFileInputSchema = z.object({
  category: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
  title: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  isProjectContext: z.boolean(),
});

/**
 * Schema for validating select_framework tool input.
 */
const selectFrameworkInputSchema = z.object({
  framework: z.string().min(1, 'Framework cannot be empty'),
  reason: z.string().min(1, 'Reason cannot be empty'),
});

/**
 * Schema for validating report_contradictions tool input.
 */
const reportContradictionsInputSchema = z.object({
  contradictions: z.array(
    z.object({
      slug: z.string(),
      subdirectory: z.string().optional(),
      explanation: z.string(),
    })
  ),
});

/**
 * Execute a knowledge base agent tool call.
 *
 * @param toolName - Name of the tool to execute
 * @param toolInput - Input parameters for the tool
 * @param storage - Knowledge storage service instance
 * @returns String result from the tool execution
 */
export async function executeKnowledgeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  storage: KnowledgeStorageService
): Promise<string> {
  switch (toolName) {
    case 'list_knowledge_files': {
      // Only include files from base directory and current project's subdirectory
      const projectHash = generateProjectHash(process.cwd());
      const entries = await storage.list({ status: 'active' }, [projectHash]);
      if (entries.length === 0) {
        return 'No files in knowledge base.';
      }

      // Enriched format: slug, title, category, summary, topics, subdirectory
      const lines = entries.map((e) => {
        const location = e.subdirectory ? `${e.subdirectory}/${e.slug}` : e.slug;
        const topicsStr =
          e.classification.topics.length > 0
            ? `  Topics: ${e.classification.topics.join(', ')}`
            : '';
        return `- ${location} [${e.classification.category}]\n  "${e.summary}"${topicsStr ? `\n${topicsStr}` : ''}`;
      });

      return `Knowledge base files (${entries.length} entries):\n\n${lines.join('\n\n')}`;
    }

    case 'read_knowledge_file': {
      const parseResult = readKnowledgeFileInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      const { slug } = parseResult.data;

      // Try base directory first
      let entry = await storage.get(slug);

      // If not found, try project subdirectory
      if (!entry) {
        const projectHash = generateProjectHash(process.cwd());
        entry = await storage.get(slug, projectHash);
      }

      if (!entry) {
        return `File not found: ${slug}`;
      }
      return `# ${entry.title}\n\n${entry.content}`;
    }

    case 'select_files_for_context': {
      const parseResult = selectFilesInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      const { selections } = parseResult.data;
      return JSON.stringify({ selections });
    }

    case 'categorize_file': {
      const parseResult = categorizeFileInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return JSON.stringify(parseResult.data);
    }

    case 'select_framework': {
      const parseResult = selectFrameworkInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return JSON.stringify(parseResult.data);
    }

    case 'report_contradictions': {
      const parseResult = reportContradictionsInputSchema.safeParse(toolInput);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => i.message).join(', ');
        return `Invalid input: ${issues}`;
      }
      return JSON.stringify(parseResult.data);
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
