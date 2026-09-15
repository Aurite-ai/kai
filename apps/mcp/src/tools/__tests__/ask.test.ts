import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentResult, AgentUsageStats } from '../../knowledge/index.js';
import { askToolDefinition, askToolHandler } from '../ask.js';
import { generateProjectHash } from '../onboarding-check.js';
import type { ToolContext } from '../types.js';
import { createMockContext, createMockEntry } from './test-utils.js';

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

// Mock fs/promises for .kai/context-guide.md reading
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { runAgent } from '../../knowledge/agents/run-agent.js';

const mockReadFile = vi.mocked(fs.readFile);

const mockRunAgent = vi.mocked(runAgent);

/**
 * Create onboarding context entries (org + project) required by onboarding check.
 */
function createOnboardingContextEntries() {
  const projectHash = generateProjectHash(process.cwd());
  return [
    createMockEntry({ slug: 'org-context', title: 'Organization Context' }),
    createMockEntry({ slug: `project-context-${projectHash}`, title: 'Project Context' }),
  ];
}

describe('askToolDefinition', () => {
  it('has the correct name', () => {
    expect(askToolDefinition.name).toBe('kai_ask');
  });

  it('requires question', () => {
    expect(askToolDefinition.inputSchema.required).toContain('question');
  });

  it('has question as string parameter', () => {
    const questionSchema = askToolDefinition.inputSchema.properties.question;
    expect(questionSchema.type).toBe('string');
  });

  it('has description with <examples> and <hints>', () => {
    expect(askToolDefinition.description).toContain('<examples>');
    expect(askToolDefinition.description).toContain('<hints>');
  });
});

describe('askToolHandler', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    // Default: no .kai/context-guide.md exists
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));
    // Default: onboarding context exists (for soft warning, ask doesn't block)
    vi.mocked(ctx.storage.list).mockResolvedValue(createOnboardingContextEntries());
  });

  describe('input validation', () => {
    it('returns error when question is missing', async () => {
      const result = await askToolHandler({}, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing or empty question');
    });

    it('returns error when question is empty string', async () => {
      const result = await askToolHandler({ question: '' }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing or empty question');
    });

    it('returns error when question is only whitespace', async () => {
      const result = await askToolHandler({ question: '   ' }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing or empty question');
    });
  });

  describe('successful answer', () => {
    it('returns markdown response with question, answer, and hints', async () => {
      mockRunAgent.mockResolvedValue({
        textResponse:
          'Based on the knowledge base, the answer is: We use Vitest for testing.\n\n**Source:** testing-guide.mdc',
        toolResults: [],
        usage: defaultUsage,
      });

      const result = await askToolHandler({ question: 'What testing framework do we use?' }, ctx);

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('# Answer');
      expect(text).toContain('**Question:** What testing framework do we use?');
      expect(text).toContain('Vitest');
      expect(text).toContain('<hints>');
    });

    it('passes question to runAgent as user message', async () => {
      mockRunAgent.mockResolvedValue({
        textResponse: 'Some answer',
        toolResults: [],
        usage: defaultUsage,
      });

      await askToolHandler({ question: 'Why did we choose X?' }, ctx);

      expect(mockRunAgent).toHaveBeenCalledOnce();
      expect(mockRunAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          systemPrompt: expect.any(String),
          tools: expect.any(Array),
        }),
        'Why did we choose X?',
        ctx.storage,
        ctx.anthropic,
        ctx.usageTracker,
        'kai_ask'
      );
    });

    it('includes referenced KB files in system prompt when .kai/context-guide.md exists', async () => {
      // Mock .kai/context-guide.md with KB file references
      const contextGuideContent = `# Context for: Build authentication system

Surfaced from Kai knowledge base on 2026-02-12.

## Knowledge Base Files

| Topic | KB Path | Why Relevant |
|-------|---------|--------------|
| Authentication Patterns | [/home/user/.kai/knowledge/auth-patterns.mdc](/home/user/.kai/knowledge/auth-patterns.mdc) | Contains JWT implementation patterns |
| Security Best Practices | [/home/user/.kai/knowledge/security-guide.mdc](/home/user/.kai/knowledge/security-guide.mdc) | Security requirements for auth |

## Start Here

1. Review /home/user/.kai/knowledge/auth-patterns.mdc — Contains JWT implementation patterns
2. Review /home/user/.kai/knowledge/security-guide.mdc — Security requirements for auth
`;

      mockReadFile.mockResolvedValue(contextGuideContent);
      mockRunAgent.mockResolvedValue({
        textResponse: 'Answer based on KB',
        toolResults: [],
        usage: defaultUsage,
      });

      await askToolHandler({ question: 'How should I implement auth?' }, ctx);

      expect(mockRunAgent).toHaveBeenCalledOnce();
      const systemPrompt = mockRunAgent.mock.calls[0][0].systemPrompt;

      // Verify the system prompt includes the referenced KB files
      expect(systemPrompt).toContain('/home/user/.kai/knowledge/auth-patterns.mdc');
      expect(systemPrompt).toContain('/home/user/.kai/knowledge/security-guide.mdc');
      expect(systemPrompt).toContain(
        'already has these KB files referenced in their .kai/context-guide.md'
      );
    });

    it('handles missing .kai/context-guide.md gracefully', async () => {
      // mockReadFile already rejects by default in beforeEach
      mockRunAgent.mockResolvedValue({
        textResponse: 'Answer without context',
        toolResults: [],
        usage: defaultUsage,
      });

      await askToolHandler({ question: 'Test question' }, ctx);

      expect(mockRunAgent).toHaveBeenCalledOnce();
      const systemPrompt = mockRunAgent.mock.calls[0][0].systemPrompt;

      // Verify the system prompt doesn't include referenced files section
      expect(systemPrompt).not.toContain('already has these KB files referenced');
    });

    it('extracts multiple KB file paths from .kai/context-guide.md', async () => {
      const contextGuideContent = `# Context for: Multi-file task

## Knowledge Base Files

| Topic | KB Path | Why Relevant |
|-------|---------|--------------|
| File 1 | [/path/to/file1.mdc](/path/to/file1.mdc) | Reason 1 |
| File 2 | [/path/to/file2.mdc](/path/to/file2.mdc) | Reason 2 |
| File 3 | [/path/to/file3.mdc](/path/to/file3.mdc) | Reason 3 |
`;

      mockReadFile.mockResolvedValue(contextGuideContent);
      mockRunAgent.mockResolvedValue({
        textResponse: 'Answer',
        toolResults: [],
        usage: defaultUsage,
      });

      await askToolHandler({ question: 'Test' }, ctx);

      const systemPrompt = mockRunAgent.mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('/path/to/file1.mdc');
      expect(systemPrompt).toContain('/path/to/file2.mdc');
      expect(systemPrompt).toContain('/path/to/file3.mdc');
    });
  });

  describe('error handling', () => {
    it('handles agent errors gracefully', async () => {
      mockRunAgent.mockRejectedValue(new Error('API rate limited'));

      const result = await askToolHandler({ question: 'Test question' }, ctx);

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toContain('Failed to answer question');
      expect(text).toContain('API rate limited');
    });
  });

  describe('onboarding soft warnings', () => {
    it('includes onboarding hints when org context is missing', async () => {
      // Only project context, no org context
      const projectHash = generateProjectHash(process.cwd());
      vi.mocked(ctx.storage.list).mockResolvedValue([
        createMockEntry({ slug: `project-context-${projectHash}`, title: 'Project Context' }),
      ]);
      mockRunAgent.mockResolvedValue({
        textResponse: 'Some answer',
        toolResults: [],
        usage: defaultUsage,
      });

      const result = await askToolHandler({ question: 'Test question' }, ctx);

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('# Answer'); // Still answers
      expect(text).toContain('set up org context'); // But warns
    });

    it('includes onboarding hints when project context is missing', async () => {
      // Only org context, no project context
      vi.mocked(ctx.storage.list).mockResolvedValue([
        createMockEntry({ slug: 'org-context', title: 'Organization Context' }),
      ]);
      mockRunAgent.mockResolvedValue({
        textResponse: 'Some answer',
        toolResults: [],
        usage: defaultUsage,
      });

      const result = await askToolHandler({ question: 'Test question' }, ctx);

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('# Answer'); // Still answers
      expect(text).toContain('set up project context'); // But warns
    });

    it('includes both warnings when both contexts are missing', async () => {
      vi.mocked(ctx.storage.list).mockResolvedValue([]); // Empty KB
      mockRunAgent.mockResolvedValue({
        textResponse: 'Some answer',
        toolResults: [],
        usage: defaultUsage,
      });

      const result = await askToolHandler({ question: 'Test question' }, ctx);

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('# Answer'); // Still answers
      expect(text).toContain('set up org context');
      expect(text).toContain('set up project context');
    });

    it('does not include warnings when both contexts exist', async () => {
      // Both contexts exist (default from beforeEach)
      mockRunAgent.mockResolvedValue({
        textResponse: 'Some answer',
        toolResults: [],
        usage: defaultUsage,
      });

      const result = await askToolHandler({ question: 'Test question' }, ctx);

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).not.toContain('set up org context');
      expect(text).not.toContain('set up project context');
    });
  });
});
