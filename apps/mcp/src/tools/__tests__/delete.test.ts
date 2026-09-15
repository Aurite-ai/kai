import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeStorageError } from '../../knowledge/index.js';
import { deleteToolDefinition, deleteToolHandler } from '../delete.js';
import type { ToolContext } from '../types.js';
import { createMockContext, createMockEntry } from './test-utils.js';

describe('deleteToolDefinition', () => {
  it('has the correct name', () => {
    expect(deleteToolDefinition.name).toBe('kai_delete');
  });

  it('requires slugs', () => {
    expect(deleteToolDefinition.inputSchema.required).toContain('slugs');
  });

  it('defines slugs as array of strings', () => {
    const slugsSchema = deleteToolDefinition.inputSchema.properties.slugs;
    expect(slugsSchema.type).toBe('array');
    expect(slugsSchema.items.type).toBe('string');
  });

  it('has description with warnings about user permission', () => {
    expect(deleteToolDefinition.description).toContain('⚠️');
    expect(deleteToolDefinition.description).toContain('user permission');
    expect(deleteToolDefinition.description).toContain('kai_learn');
  });

  it('has description with <examples> and <hints>', () => {
    expect(deleteToolDefinition.description).toContain('<examples>');
    expect(deleteToolDefinition.description).toContain('<hints>');
  });
});

describe('deleteToolHandler', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
  });

  describe('input validation', () => {
    it('returns error when slugs is missing', async () => {
      const result = await deleteToolHandler({}, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('slugs');
    });

    it('returns error when slugs array is empty', async () => {
      const result = await deleteToolHandler({ slugs: [] }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('slugs array cannot be empty');
    });
  });

  describe('successful deletion', () => {
    it('deletes a single file', async () => {
      const mockEntry = createMockEntry({
        slug: 'old-api-guidelines',
        title: 'Old API Guidelines',
      });

      vi.mocked(ctx.storage.get).mockResolvedValue(mockEntry);
      vi.mocked(ctx.storage.delete).mockResolvedValue(undefined);

      const result = await deleteToolHandler({ slugs: ['old-api-guidelines'] }, ctx);

      // Verify storage.get was called to retrieve title
      expect(ctx.storage.get).toHaveBeenCalledWith('old-api-guidelines', undefined);

      // Verify storage.delete was called
      expect(ctx.storage.delete).toHaveBeenCalledWith('old-api-guidelines', undefined, true);

      // Verify markdown response
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('# Files Deleted from Knowledge Base');
      expect(text).toContain('old-api-guidelines');
      expect(text).toContain('Old API Guidelines');
      expect(text).toContain('1 deleted');
      expect(text).toContain('<hints>');
    });

    it('deletes multiple files', async () => {
      const mockEntry1 = createMockEntry({
        slug: 'old-policy',
        title: 'Old Policy',
      });
      const mockEntry2 = createMockEntry({
        slug: 'deprecated-doc',
        title: 'Deprecated Doc',
      });

      vi.mocked(ctx.storage.get)
        .mockResolvedValueOnce(mockEntry1)
        .mockResolvedValueOnce(mockEntry2);
      vi.mocked(ctx.storage.delete).mockResolvedValue(undefined);

      const result = await deleteToolHandler({ slugs: ['old-policy', 'deprecated-doc'] }, ctx);

      expect(ctx.storage.delete).toHaveBeenCalledTimes(2);
      expect(ctx.storage.delete).toHaveBeenCalledWith('old-policy', undefined, true);
      expect(ctx.storage.delete).toHaveBeenCalledWith('deprecated-doc', undefined, true);

      const text = result.content[0].text;
      expect(text).toContain('2 files');
      expect(text).toContain('old-policy');
      expect(text).toContain('deprecated-doc');
    });

    it('deletes a file from a subdirectory', async () => {
      const mockEntry = createMockEntry({
        slug: 'project-specific-doc',
        title: 'Project Specific Doc',
      });

      vi.mocked(ctx.storage.get).mockResolvedValue(mockEntry);
      vi.mocked(ctx.storage.delete).mockResolvedValue(undefined);

      const result = await deleteToolHandler(
        { slugs: ['project-specific-doc'], subdirectory: 'abc123' },
        ctx
      );

      // Verify storage.get was called with subdirectory
      expect(ctx.storage.get).toHaveBeenCalledWith('project-specific-doc', 'abc123');

      // Verify storage.delete was called with subdirectory
      expect(ctx.storage.delete).toHaveBeenCalledWith('project-specific-doc', 'abc123', true);

      // Verify markdown response
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('# Files Deleted from Knowledge Base');
      expect(text).toContain('project-specific-doc');
      expect(text).toContain('Project Specific Doc');
    });
  });

  describe('partial failure', () => {
    it('handles one success + one not found', async () => {
      const mockEntry = createMockEntry({
        slug: 'existing-file',
        title: 'Existing File',
      });

      vi.mocked(ctx.storage.get).mockResolvedValueOnce(mockEntry).mockResolvedValueOnce(null);
      vi.mocked(ctx.storage.delete).mockResolvedValue(undefined);

      const result = await deleteToolHandler({ slugs: ['existing-file', 'nonexistent-file'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('✅');
      expect(text).toContain('❌');
      expect(text).toContain('File not found');
      expect(text).toContain('existing-file');
      expect(text).toContain('nonexistent-file');
    });

    it('handles deletion errors', async () => {
      const mockEntry = createMockEntry({
        slug: 'locked-file',
        title: 'Locked File',
      });

      vi.mocked(ctx.storage.get).mockResolvedValue(mockEntry);
      vi.mocked(ctx.storage.delete).mockRejectedValue(
        new KnowledgeStorageError('File is locked', 'WRITE_ERROR')
      );

      const result = await deleteToolHandler({ slugs: ['locked-file'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('❌');
      expect(text).toContain('File is locked');
    });
  });

  describe('error handling', () => {
    it('handles file not found', async () => {
      vi.mocked(ctx.storage.get).mockResolvedValue(null);

      const result = await deleteToolHandler({ slugs: ['nonexistent'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('File not found');
      // Delete should not be called if file doesn't exist
      expect(ctx.storage.delete).not.toHaveBeenCalled();
    });

    it('handles unexpected errors', async () => {
      vi.mocked(ctx.storage.get).mockRejectedValue(new Error('Database connection lost'));

      const result = await deleteToolHandler({ slugs: ['test-file'] }, ctx);

      const text = result.content[0].text;
      expect(text).toContain('Database connection lost');
    });
  });
});
