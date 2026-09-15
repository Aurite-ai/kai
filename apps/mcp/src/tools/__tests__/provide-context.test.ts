import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  provideContextTool,
  provideContextToolDefinition,
  provideContextToolHandler,
} from '../provide-context.js';
import { createMockContext } from './test-utils.js';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

const mockMkdir = vi.mocked(fs.mkdir);
const mockWriteFile = vi.mocked(fs.writeFile);

describe('provideContextToolDefinition', () => {
  it('has the correct name', () => {
    expect(provideContextToolDefinition.name).toBe('kai_provide_context');
  });

  it('requires type and content', () => {
    expect(provideContextToolDefinition.inputSchema.required).toContain('type');
    expect(provideContextToolDefinition.inputSchema.required).toContain('content');
  });

  it('defines type as enum with org and user options', () => {
    const typeSchema = provideContextToolDefinition.inputSchema.properties.type;
    expect(typeSchema.type).toBe('string');
    expect(typeSchema.enum).toEqual(['org', 'user']);
  });

  it('defines content as string', () => {
    const contentSchema = provideContextToolDefinition.inputSchema.properties.content;
    expect(contentSchema.type).toBe('string');
  });

  it('has description with <examples> and <hints>', () => {
    expect(provideContextToolDefinition.description).toContain('<examples>');
    expect(provideContextToolDefinition.description).toContain('<hints>');
    expect(provideContextToolDefinition.description).toContain('USE THIS TOOL WHEN');
  });
});

describe('provideContextToolHandler', () => {
  const ctx = createMockContext();
  // Test uses a custom knowledge dir to avoid relying on os.homedir mock
  const testKnowledgeDir = '/test/knowledge/path';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    // Set a known test directory
    process.env.KAI_KNOWLEDGE_DIR = testKnowledgeDir;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('input validation', () => {
    it('rejects missing type parameter', async () => {
      const result = await provideContextToolHandler(
        { content: '# Organization Context\n\nHealthcare startup building patient portals.' },
        ctx
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid Input');
    });

    it('rejects invalid type parameter', async () => {
      const result = await provideContextToolHandler(
        { type: 'invalid', content: '# Some Content\n\nWith enough content to pass validation.' },
        ctx
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('type must be "org" or "user"');
    });

    it('rejects missing content parameter', async () => {
      const result = await provideContextToolHandler({ type: 'org' }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid Input');
    });

    it('rejects empty content', async () => {
      const result = await provideContextToolHandler({ type: 'org', content: '' }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('content cannot be empty');
    });

    it('rejects content that is too short (< 50 bytes)', async () => {
      const result = await provideContextToolHandler({ type: 'org', content: 'Too short' }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Content is too short');
      expect(result.content[0].text).toContain('minimum 50 bytes');
    });
  });

  describe('valid org context storage', () => {
    const validOrgContent =
      '# Organization Context\n\nHealthcare startup building patient portals.\n\n## Constraints\n- HIPAA compliance required';

    it('creates knowledge directory if needed', async () => {
      await provideContextToolHandler({ type: 'org', content: validOrgContent }, ctx);

      expect(mockMkdir).toHaveBeenCalledWith(testKnowledgeDir, { recursive: true });
    });

    it('writes org-context.mdc file', async () => {
      await provideContextToolHandler({ type: 'org', content: validOrgContent }, ctx);

      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(testKnowledgeDir, 'org-context.mdc'),
        expect.stringContaining(validOrgContent),
        'utf-8'
      );
    });

    it('writes file with proper frontmatter', async () => {
      await provideContextToolHandler({ type: 'org', content: validOrgContent }, ctx);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('---');
      expect(writtenContent).toContain('type: knowledge');
      expect(writtenContent).toContain('category: context');
      expect(writtenContent).toContain('title: "Organization Context"');
      expect(writtenContent).toContain('created_at:');
      expect(writtenContent).toContain('updated_at:');
    });

    it('returns success response for org context', async () => {
      const result = await provideContextToolHandler({ type: 'org', content: validOrgContent }, ctx);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('# Context Stored');
      expect(result.content[0].text).toContain('organization context');
      expect(result.content[0].text).toContain('org-context.mdc');
    });
  });

  describe('valid user context storage', () => {
    const validUserContent =
      '# User Context\n\nSenior developer, 10 years experience.\n\n## Preferences\n- Prefers TDD approach';

    it('writes user-context.mdc file', async () => {
      await provideContextToolHandler({ type: 'user', content: validUserContent }, ctx);

      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(testKnowledgeDir, 'user-context.mdc'),
        expect.stringContaining(validUserContent),
        'utf-8'
      );
    });

    it('writes file with proper frontmatter for user context', async () => {
      await provideContextToolHandler({ type: 'user', content: validUserContent }, ctx);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('title: "User Context"');
    });

    it('returns success response for user context', async () => {
      const result = await provideContextToolHandler({ type: 'user', content: validUserContent }, ctx);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('# Context Stored');
      expect(result.content[0].text).toContain('user context');
      expect(result.content[0].text).toContain('user-context.mdc');
    });
  });

  describe('file overwrite behavior', () => {
    const validContent = '# Context\n\nThis is updated content that should replace the existing file.';

    it('overwrites existing org-context.mdc file', async () => {
      // First write
      await provideContextToolHandler({ type: 'org', content: validContent }, ctx);
      // Second write should succeed (overwrite)
      const result = await provideContextToolHandler(
        { type: 'org', content: `${validContent} Updated.` },
        ctx
      );

      expect(result.isError).toBeUndefined();
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });

    it('overwrites existing user-context.mdc file', async () => {
      // First write
      await provideContextToolHandler({ type: 'user', content: validContent }, ctx);
      // Second write should succeed (overwrite)
      const result = await provideContextToolHandler(
        { type: 'user', content: `${validContent} Updated.` },
        ctx
      );

      expect(result.isError).toBeUndefined();
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('custom knowledge directory', () => {
    const validContent = '# Context\n\nThis is content for custom directory testing purposes.';

    it('respects KAI_KNOWLEDGE_DIR environment variable', async () => {
      process.env.KAI_KNOWLEDGE_DIR = '/custom/knowledge/path';

      await provideContextToolHandler({ type: 'org', content: validContent }, ctx);

      expect(mockMkdir).toHaveBeenCalledWith('/custom/knowledge/path', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/custom/knowledge/path/org-context.mdc',
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('error handling', () => {
    const validContent = '# Context\n\nThis is content for error handling testing purposes.';

    it('handles directory creation failure', async () => {
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await provideContextToolHandler({ type: 'org', content: validContent }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Storage Error');
      expect(result.content[0].text).toContain('Failed to create knowledge directory');
    });

    it('handles file write failure', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('Disk full'));

      const result = await provideContextToolHandler({ type: 'org', content: validContent }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Storage Error');
      expect(result.content[0].text).toContain('Failed to write context file');
      expect(result.content[0].text).toContain('Disk full');
    });
  });

  describe('response format', () => {
    const validContent = '# Context\n\nThis is content for response format testing purposes.';

    it('includes hints in success response', async () => {
      const result = await provideContextToolHandler({ type: 'org', content: validContent }, ctx);

      expect(result.content[0].text).toContain('<hints>');
      expect(result.content[0].text).toContain('kai_prepare_context');
      expect(result.content[0].text).toContain('replaces previous');
    });

    it('includes hints in error response', async () => {
      const result = await provideContextToolHandler({ type: 'invalid' as 'org', content: validContent }, ctx);

      expect(result.content[0].text).toContain('<hints>');
    });
  });
});

describe('provideContextTool export', () => {
  it('exports definition and handler together', () => {
    expect(provideContextTool.definition).toBe(provideContextToolDefinition);
    expect(provideContextTool.handler).toBe(provideContextToolHandler);
  });
});
