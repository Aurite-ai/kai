import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentResult, AgentUsageStats } from '../../knowledge/index.js';
import { KnowledgeStorageError } from '../../knowledge/index.js';
import { learnToolDefinition, learnToolHandler } from '../learn.js';
import type { ToolContext } from '../types.js';
import { createMockContext, createMockEntry } from './test-utils.js';

// Mock the generateProjectHash function
vi.mock('../onboarding-check.js', async () => {
  const actual = await vi.importActual('../onboarding-check.js');
  return {
    ...actual,
    generateProjectHash: vi.fn(() => '123abc'),
  };
});

/**
 * Default usage stats for mock agent results.
 */
const defaultUsage: AgentUsageStats = {
  totalInputTokens: 100,
  totalOutputTokens: 50,
  totalCost: 0.001,
  llmCallCount: 1,
  totalLatencyMs: 500,
};

// Mock the agent runner
vi.mock('../../knowledge/agents/run-agent.js', () => ({
  runAgent: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  access: vi.fn(),
}));

import { runAgent } from '../../knowledge/agents/run-agent.js';

const mockRunAgent = vi.mocked(runAgent);

/**
 * Helper: Build a mock AgentResult for categorize_file tool.
 */
function mockCategorizationResult(overrides?: Record<string, unknown>): AgentResult {
  return {
    textResponse: '',
    toolResults: [
      {
        tool: 'categorize_file',
        category: 'reference',
        confidence: 0.9,
        reasoning: 'Test categorization',
        title: 'API Guidelines',
        summary: 'REST API design standards covering naming conventions and auth',
        topics: ['API Design', 'REST Conventions', 'Authentication'],
        ...overrides,
      },
    ],
    usage: defaultUsage,
  };
}

/**
 * Helper: Build a mock AgentResult for report_contradictions tool.
 */
function mockContradictionCheckResult(
  contradictions: Array<{ slug: string; explanation: string }>
): AgentResult {
  return {
    textResponse: '',
    toolResults: [
      {
        tool: 'report_contradictions',
        contradictions,
      },
    ],
    usage: {
      totalCost: 0,
      totalInputTokens: 0,
      totalLatencyMs: 0,
      totalOutputTokens: 0,
      llmCallCount: 0,
    },
  };
}

describe('learnToolDefinition', () => {
  it('has the correct name', () => {
    expect(learnToolDefinition.name).toBe('kai_learn');
  });

  it('requires paths', () => {
    expect(learnToolDefinition.inputSchema.required).toContain('paths');
    expect(learnToolDefinition.inputSchema.required).not.toContain('description');
  });

  it('defines paths as array of strings', () => {
    const pathsSchema = learnToolDefinition.inputSchema.properties.paths;
    expect(pathsSchema.type).toBe('array');
    expect(pathsSchema.items.type).toBe('string');
  });

  it('has description with <examples> and <hints>', () => {
    expect(learnToolDefinition.description).toContain('<examples>');
    expect(learnToolDefinition.description).toContain('<hints>');
  });
});

describe('learnToolHandler', () => {
  let ctx: ToolContext;
  const mockFsStat = vi.mocked(fs.stat);
  const mockFsReadFile = vi.mocked(fs.readFile);
  const mockFsAccess = vi.mocked(fs.access);

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();

    // Default file system mocks
    mockFsAccess.mockResolvedValue(undefined);
    mockFsStat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as Awaited<ReturnType<typeof fs.stat>>);
    mockFsReadFile.mockResolvedValue('# Test Content\n\nSome content here.');

    // Default agent mock
    mockRunAgent.mockResolvedValue(mockCategorizationResult());
  });

  describe('input validation', () => {
    it('returns error when paths is missing', async () => {
      const result = await learnToolHandler({}, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('paths');
    });

    it('returns error when paths array is empty', async () => {
      const result = await learnToolHandler({ paths: [] }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('paths');
    });

    it('returns error when no accessible files found', async () => {
      mockFsAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await learnToolHandler({ paths: ['/nonexistent/file.md'] }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No Files Found');
    });
  });

  describe('successful processing', () => {
    it('processes a single file through agent → storage pipeline', async () => {
      const now = new Date().toISOString();
      vi.mocked(ctx.storage.save).mockResolvedValue(
        createMockEntry({
          slug: 'api-guidelines',
          title: 'API Guidelines',
          created_at: now,
          updated_at: now,
        })
      );

      // Mock both agent calls: categorization then contradiction check
      mockRunAgent
        .mockResolvedValueOnce(mockCategorizationResult())
        .mockResolvedValueOnce(mockContradictionCheckResult([]));

      const result = await learnToolHandler({ paths: ['docs/api-guidelines.md'] }, ctx);

      // Verify both agents were called
      expect(mockRunAgent).toHaveBeenCalledTimes(2);

      // First call: categorization agent
      expect(mockRunAgent).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          model: expect.any(String),
          systemPrompt: expect.any(String),
          maxIterations: 1,
        }),
        expect.stringContaining('api-guidelines.md'),
        ctx.storage,
        ctx.anthropic,
        ctx.usageTracker,
        'kai_learn'
      );

      // Second call: contradiction check agent
      expect(mockRunAgent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          model: expect.any(String),
          systemPrompt: expect.any(String),
          maxIterations: 10,
        }),
        expect.stringContaining('API Guidelines'),
        ctx.storage,
        ctx.anthropic,
        ctx.usageTracker,
        'kai_learn'
      );

      // Verify storage.save called with flat fields from agent result
      // Title should include hash based on project directory for uniqueness
      expect(ctx.storage.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/^API Guidelines \[[a-f0-9]{6}\]$/),
          summary: expect.stringContaining('REST API'),
          sourceFile: 'api-guidelines.md',
          sourcePath: 'docs/api-guidelines.md',
          category: 'reference',
          confidence: 0.9,
          topics: expect.arrayContaining(['API Design']),
        })
      );

      // Verify markdown response
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('# Context Received');
      expect(text).toContain('api-guidelines.md');
      expect(text).toContain('<hints>');
    });

    it('includes description in reasoning when provided', async () => {
      vi.mocked(ctx.storage.save).mockResolvedValue(createMockEntry());

      await learnToolHandler(
        { paths: ['docs/api.md'], description: 'Our API design standards' },
        ctx
      );

      expect(ctx.storage.save).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: expect.stringContaining('Our API design standards'),
        })
      );
    });
  });

  describe('partial failure', () => {
    it('handles one success + one read error', async () => {
      const now = new Date().toISOString();
      vi.mocked(ctx.storage.save).mockResolvedValue(
        createMockEntry({ slug: 'good-file', created_at: now, updated_at: now })
      );

      // First file reads fine, second fails
      mockFsReadFile
        .mockResolvedValueOnce('Good content')
        .mockRejectedValueOnce(new Error('Permission denied'));

      const result = await learnToolHandler({ paths: ['good-file.md', 'bad-file.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('✅');
      expect(text).toContain('❌');
      expect(text).toContain('Failed to read file');
    });

    it('handles KnowledgeStorageError', async () => {
      vi.mocked(ctx.storage.save).mockRejectedValue(
        new KnowledgeStorageError('Directory not accessible', 'DIR_ERROR')
      );

      const result = await learnToolHandler({ paths: ['test.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('Storage error');
      expect(text).toContain('DIR_ERROR');
    });
  });

  describe('error handling', () => {
    it('rejects files exceeding size limit', async () => {
      // Create content that exceeds 400KB
      const largeContent = 'x'.repeat(500_000);
      mockFsReadFile.mockResolvedValue(largeContent);

      const result = await learnToolHandler({ paths: ['large-file.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('File too large');
      // Agent should not have been called
      expect(mockRunAgent).not.toHaveBeenCalled();
    });

    it('handles agent not producing categorization result', async () => {
      mockRunAgent.mockResolvedValue({
        textResponse: 'I could not categorize this file.',
        toolResults: [],
        usage: defaultUsage,
      });

      const result = await learnToolHandler({ paths: ['test.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('Categorization agent did not produce result');
    });

    it('handles unexpected API errors', async () => {
      mockRunAgent.mockRejectedValue(new Error('API rate limited'));

      const result = await learnToolHandler({ paths: ['test.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('API rate limited');
    });
  });

  describe('contradiction detection', () => {
    it('reports contradictions when agent detects them', async () => {
      const now = new Date().toISOString();
      vi.mocked(ctx.storage.save).mockResolvedValue(
        createMockEntry({
          slug: 'new-api-guidelines',
          title: 'New API Guidelines',
          created_at: now,
          updated_at: now,
        })
      );

      // Mock both agent calls: categorization then contradiction check with contradictions
      mockRunAgent
        .mockResolvedValueOnce(
          mockCategorizationResult({
            category: 'reference',
            title: 'New API Guidelines',
            summary: 'Updated REST API design standards',
          })
        )
        .mockResolvedValueOnce(
          mockContradictionCheckResult([
            {
              slug: 'old-api-guidelines',
              explanation:
                'The new file specifies JWT authentication while the old file requires OAuth2',
            },
          ])
        );

      const result = await learnToolHandler({ paths: ['docs/new-api.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('⚠️ Contradictions Detected');
      expect(text).toContain('old-api-guidelines');
      expect(text).toContain('JWT authentication');
      expect(text).toContain('OAuth2');
      expect(text).toContain('kai_delete');
    });

    it('reports multiple contradictions', async () => {
      const now = new Date().toISOString();
      vi.mocked(ctx.storage.save).mockResolvedValue(
        createMockEntry({ created_at: now, updated_at: now })
      );

      // Mock both agent calls with multiple contradictions
      mockRunAgent.mockResolvedValueOnce(mockCategorizationResult()).mockResolvedValueOnce(
        mockContradictionCheckResult([
          {
            slug: 'old-policy-1',
            explanation: 'Conflicting rate limit values',
          },
          {
            slug: 'old-policy-2',
            explanation: 'Different authentication requirements',
          },
        ])
      );

      const result = await learnToolHandler({ paths: ['docs/new-policy.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('old-policy-1');
      expect(text).toContain('old-policy-2');
      expect(text).toContain('rate limit');
      expect(text).toContain('authentication');
    });

    it('does not show contradiction section when none detected', async () => {
      const now = new Date().toISOString();
      vi.mocked(ctx.storage.save).mockResolvedValue(
        createMockEntry({ created_at: now, updated_at: now })
      );

      mockRunAgent.mockResolvedValue(mockCategorizationResult());

      const result = await learnToolHandler({ paths: ['docs/api.md'] }, ctx);

      const text = result.content[0].text;
      expect(text).not.toContain('⚠️ Contradictions Detected');
    });

    it('excludes the file being updated from contradiction checks', async () => {
      // Simulate uploading the same file twice (update scenario)
      const projectHash = '123abc'; // Mock hash
      const uniqueTitle = `API Guidelines [${projectHash}]`;
      const existingSlug = 'api-guidelines-123abc';

      // Mock storage.list to return the existing entry
      vi.mocked(ctx.storage.list).mockResolvedValue([
        createMockEntry({
          slug: existingSlug,
          title: uniqueTitle,
          summary: 'REST API design standards',
        }),
      ]);

      // Mock storage.save to return updated entry (same created/updated time = update)
      const now = new Date().toISOString();
      const earlier = new Date(Date.now() - 10000).toISOString();
      vi.mocked(ctx.storage.save).mockResolvedValue(
        createMockEntry({
          slug: existingSlug,
          title: uniqueTitle,
          created_at: earlier,
          updated_at: now, // Different from created_at = update
        })
      );

      // Mock categorization agent
      mockRunAgent
        .mockResolvedValueOnce(mockCategorizationResult())
        // Mock contradiction check - should NOT report the file itself
        .mockResolvedValueOnce(mockContradictionCheckResult([]));

      const result = await learnToolHandler({ paths: ['docs/api-guidelines.md'] }, ctx);

      // Verify the contradiction check message excludes the existing slug
      const contradictionCheckCall = mockRunAgent.mock.calls[1];
      const contradictionCheckMessage = contradictionCheckCall[1] as string;
      expect(contradictionCheckMessage).toContain('IMPORTANT');
      expect(contradictionCheckMessage).toContain(existingSlug);
      expect(contradictionCheckMessage).toContain('Do NOT report this slug as a contradiction');

      // Verify no contradictions in response
      const text = result.content[0].text;
      expect(text).not.toContain('⚠️ Contradictions Detected');
      expect(text).toContain('updated existing entry');
    });
  });
});
