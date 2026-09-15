/**
 * Tests for FileKnowledgeStorageService (knowledge/ module)
 *
 * Based on the existing storage/__tests__/knowledge-storage.test.ts
 * but updated for simplified types (no tags, no entities, flat fields).
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileKnowledgeStorageService } from '../knowledge-storage.js';
import type { SaveKnowledgeEntryInput } from '../types.js';
import { KnowledgeStorageError } from '../types.js';

describe('FileKnowledgeStorageService', () => {
  let testDir: string;
  let storage: FileKnowledgeStorageService;

  // Create a fresh test directory before each test
  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `kai-knowledge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    storage = new FileKnowledgeStorageService(testDir);
  });

  // Clean up test directory after each test
  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Helper to create a valid simplified input
  function createTestInput(
    overrides: Partial<SaveKnowledgeEntryInput> = {}
  ): SaveKnowledgeEntryInput {
    return {
      title: 'Test Entry',
      summary: 'A test knowledge entry for unit testing.',
      content: '# Test Content\n\nThis is test content.',
      sourceFile: 'test.md',
      sourcePath: '/docs/test.md',
      category: 'reference',
      confidence: 0.9,
      reasoning: 'Test categorization',
      topics: ['testing', 'documentation'],
      ...overrides,
    };
  }

  describe('save()', () => {
    it('creates new entry with correct structure', async () => {
      const input = createTestInput({ title: 'API Design Guidelines' });

      const entry = await storage.save(input);

      expect(entry.slug).toBe('api-design-guidelines');
      expect(entry.type).toBe('knowledge');
      expect(entry.title).toBe('API Design Guidelines');
      expect(entry.content).toBe(input.content);
      expect(entry.summary).toBe(input.summary);
      expect(entry.source.file).toBe(input.sourceFile);
      expect(entry.source.project).toBe(process.cwd()); // Automatically set
      expect(entry.classification.category).toBe('reference');
      expect(entry.classification.confidence).toBe(0.9);
      expect(entry.classification.topics).toEqual(['testing', 'documentation']);
      expect(entry.status).toBe('active');

      // Verify timestamps
      expect(entry.created_at).toBeDefined();
      expect(entry.updated_at).toBeDefined();
      expect(new Date(entry.created_at).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('creates .mdc file on disk', async () => {
      const input = createTestInput({ title: 'Disk Test' });

      await storage.save(input);

      const filepath = path.join(testDir, 'disk-test.mdc');
      const content = await fs.readFile(filepath, 'utf-8');

      expect(content).toContain('---');
      expect(content).toContain('type: knowledge');
      expect(content).toContain('title: Disk Test');
      expect(content).toContain('# Test Content');
    });

    it('updates existing entry with same title', async () => {
      const input1 = createTestInput({ title: 'Same Title', content: 'Original content' });
      const input2 = createTestInput({ title: 'Same Title', content: 'Updated content' });

      const entry1 = await storage.save(input1);

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const entry2 = await storage.save(input2);

      expect(entry2.slug).toBe(entry1.slug);
      expect(entry2.content).toBe('Updated content');
      expect(entry2.created_at).toBe(entry1.created_at); // Preserved
      expect(entry2.updated_at).not.toBe(entry1.updated_at); // Changed

      // Verify only one file exists
      const files = await fs.readdir(testDir);
      expect(files.filter((f) => f.includes('same-title'))).toHaveLength(1);
    });

    it('validates categories correctly', async () => {
      const policyInput = createTestInput({ title: 'Policy Doc', category: 'policy' });
      const referenceInput = createTestInput({ title: 'Reference Doc', category: 'reference' });
      const patternInput = createTestInput({ title: 'Pattern Doc', category: 'pattern' });
      // Force an invalid category to test fallback
      const unknownInput = createTestInput({ title: 'Unknown Doc' });
      (unknownInput as unknown as Record<string, unknown>).category = 'unknown-category';

      const policyEntry = await storage.save(policyInput);
      const referenceEntry = await storage.save(referenceInput);
      const patternEntry = await storage.save(patternInput);
      const unknownEntry = await storage.save(unknownInput as SaveKnowledgeEntryInput);

      expect(policyEntry.classification.category).toBe('policy');
      expect(referenceEntry.classification.category).toBe('reference');
      expect(patternEntry.classification.category).toBe('pattern');
      expect(unknownEntry.classification.category).toBe('context'); // Fallback
    });

    it('sets source.project from process.cwd()', async () => {
      const input = createTestInput({ title: 'Project Test' });

      const entry = await storage.save(input);

      expect(entry.source.project).toBe(process.cwd());
    });

    it('handles missing optional sourcePath', async () => {
      const input: SaveKnowledgeEntryInput = {
        title: 'Minimal Entry',
        summary: 'Minimal test',
        content: 'Minimal content',
        sourceFile: 'minimal.md',
        category: 'context',
        confidence: 0.5,
        reasoning: 'Minimal test',
        topics: [],
      };

      const entry = await storage.save(input);

      expect(entry.summary).toBe('Minimal test');
      expect(entry.classification.topics).toEqual([]);
      expect(entry.source.path).toBeNull();
      expect(entry.source.project).toBe(process.cwd());
    });

    it('throws on empty slug from title', async () => {
      const input = createTestInput({ title: '日本語のみ' }); // Non-latin chars only

      await expect(storage.save(input)).rejects.toThrow(KnowledgeStorageError);
      await expect(storage.save(input)).rejects.toThrow('generates empty slug');
    });

    it('creates directory lazily on first write', async () => {
      // Directory shouldn't exist yet
      await expect(fs.access(testDir)).rejects.toThrow();

      await storage.save(createTestInput());

      // Directory should now exist
      const stat = await fs.stat(testDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('list()', () => {
    beforeEach(async () => {
      // Create multiple test entries
      await storage.save(
        createTestInput({
          title: 'API Guidelines',
          category: 'policy',
          summary: 'API stuff',
          topics: ['backend'],
        })
      );
      await storage.save(
        createTestInput({
          title: 'React Patterns',
          category: 'pattern',
          summary: 'React stuff',
          topics: ['ui'],
        })
      );
      await storage.save(
        createTestInput({
          title: 'Database Schema',
          category: 'reference',
          summary: 'DB stuff',
          topics: ['backend'],
        })
      );
    });

    it('returns all entries without filter', async () => {
      const entries = await storage.list();

      expect(entries).toHaveLength(3);
      const titles = entries.map((e) => e.title);
      expect(titles).toContain('API Guidelines');
      expect(titles).toContain('React Patterns');
      expect(titles).toContain('Database Schema');
    });

    it('filters by category (single)', async () => {
      const entries = await storage.list({ category: 'policy' });

      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('API Guidelines');
    });

    it('filters by category (array)', async () => {
      const entries = await storage.list({ category: ['policy', 'pattern'] });

      expect(entries).toHaveLength(2);
      const titles = entries.map((e) => e.title);
      expect(titles).toContain('API Guidelines');
      expect(titles).toContain('React Patterns');
    });

    it('filters by contentSearch (content match)', async () => {
      await storage.save(
        createTestInput({
          title: 'Unique Search Target',
          content: 'This contains searchable unicorn keyword',
        })
      );

      const entries = await storage.list({ contentSearch: 'unicorn' });

      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Unique Search Target');
    });

    it('filters by contentSearch (title match)', async () => {
      const entries = await storage.list({ contentSearch: 'Database' });

      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Database Schema');
    });

    it('filters by contentSearch (summary match)', async () => {
      const entries = await storage.list({ contentSearch: 'React stuff' });

      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('React Patterns');
    });

    it('filters by project', async () => {
      // All entries have source.project = process.cwd()
      const entries = await storage.list({ project: process.cwd() });

      expect(entries).toHaveLength(3);
    });

    it('filters by status', async () => {
      // Archive one entry
      await storage.delete('api-guidelines', undefined, false);

      const activeEntries = await storage.list({ status: 'active' });
      const archivedEntries = await storage.list({ status: 'archived' });

      expect(activeEntries).toHaveLength(2);
      expect(archivedEntries).toHaveLength(1);
      expect(archivedEntries[0].title).toBe('API Guidelines');
    });

    it('returns empty array for non-existent directory', async () => {
      const emptyStorage = new FileKnowledgeStorageService(
        path.join(os.tmpdir(), `nonexistent-${Date.now()}`)
      );

      const entries = await emptyStorage.list();

      expect(entries).toEqual([]);
    });

    it('returns empty array when no entries match filter', async () => {
      const entries = await storage.list({ category: 'decision' });

      expect(entries).toEqual([]);
    });
  });

  describe('get()', () => {
    it('returns entry by slug', async () => {
      await storage.save(createTestInput({ title: 'Get Test Entry' }));

      const entry = await storage.get('get-test-entry');

      expect(entry).not.toBeNull();
      expect(entry?.title).toBe('Get Test Entry');
      expect(entry?.slug).toBe('get-test-entry');
    });

    it('returns null for non-existent entry', async () => {
      const entry = await storage.get('non-existent-slug');

      expect(entry).toBeNull();
    });

    it('returns complete entry with content and topics', async () => {
      const input = createTestInput({
        title: 'Complete Entry Test',
        content: '# Full Content\n\nWith multiple lines.',
        topics: ['topic-a', 'topic-b'],
      });
      await storage.save(input);

      const entry = await storage.get('complete-entry-test');

      expect(entry?.content).toBe(input.content);
      expect(entry?.classification.topics).toEqual(input.topics);
    });
  });

  describe('exists()', () => {
    it('returns true for existing entry', async () => {
      await storage.save(createTestInput({ title: 'Exists Test' }));

      const exists = await storage.exists('exists-test');

      expect(exists).toBe(true);
    });

    it('returns false for non-existent entry', async () => {
      const exists = await storage.exists('non-existent-entry');

      expect(exists).toBe(false);
    });
  });

  describe('delete()', () => {
    it('hard deletes entry (permanent=true)', async () => {
      await storage.save(createTestInput({ title: 'Delete Me' }));

      await storage.delete('delete-me', undefined, true);

      const exists = await storage.exists('delete-me');
      expect(exists).toBe(false);

      const files = await fs.readdir(testDir);
      expect(files).not.toContain('delete-me.mdc');
    });

    it('soft deletes entry (permanent=false)', async () => {
      await storage.save(createTestInput({ title: 'Archive Me' }));

      await storage.delete('archive-me', undefined, false);

      const entry = await storage.get('archive-me');
      expect(entry).not.toBeNull();
      expect(entry?.status).toBe('archived');
    });

    it('updates updated_at on soft delete', async () => {
      const saved = await storage.save(createTestInput({ title: 'Archive Timestamp' }));

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await storage.delete('archive-timestamp', undefined, false);

      const entry = await storage.get('archive-timestamp');
      expect(entry?.updated_at).not.toBe(saved.updated_at);
    });

    it('throws NOT_FOUND for non-existent entry (hard delete)', async () => {
      await expect(storage.delete('non-existent', undefined, true)).rejects.toThrow(
        KnowledgeStorageError
      );

      try {
        await storage.delete('non-existent', undefined, true);
      } catch (error) {
        expect((error as KnowledgeStorageError).code).toBe('NOT_FOUND');
      }
    });

    it('throws NOT_FOUND for non-existent entry (soft delete)', async () => {
      await expect(storage.delete('non-existent', undefined, false)).rejects.toThrow(
        KnowledgeStorageError
      );

      try {
        await storage.delete('non-existent', undefined, false);
      } catch (error) {
        expect((error as KnowledgeStorageError).code).toBe('NOT_FOUND');
      }
    });

    it('defaults to soft delete', async () => {
      await storage.save(createTestInput({ title: 'Default Archive' }));

      await storage.delete('default-archive');

      const entry = await storage.get('default-archive');
      expect(entry?.status).toBe('archived');
    });
  });

  describe('clear()', () => {
    it('removes all .mdc files', async () => {
      await storage.save(createTestInput({ title: 'Entry One' }));
      await storage.save(createTestInput({ title: 'Entry Two' }));
      await storage.save(createTestInput({ title: 'Entry Three' }));

      const beforeList = await storage.list();
      expect(beforeList).toHaveLength(3);

      await storage.clear();

      const afterList = await storage.list();
      expect(afterList).toHaveLength(0);
    });

    it('does not throw for empty/non-existent directory', async () => {
      const emptyStorage = new FileKnowledgeStorageService(
        path.join(os.tmpdir(), `nonexistent-clear-${Date.now()}`)
      );

      await expect(emptyStorage.clear()).resolves.not.toThrow();
    });

    it('preserves non-.mdc files', async () => {
      await storage.save(createTestInput({ title: 'Entry' }));

      // Create a non-.mdc file
      const otherFile = path.join(testDir, 'other-file.txt');
      await fs.writeFile(otherFile, 'other content');

      await storage.clear();

      const files = await fs.readdir(testDir);
      expect(files).toContain('other-file.txt');
      expect(files.filter((f) => f.endsWith('.mdc'))).toHaveLength(0);
    });
  });

  describe('healthCheck()', () => {
    it('returns ok=true with entry count', async () => {
      await storage.save(createTestInput({ title: 'Health Check One' }));
      await storage.save(createTestInput({ title: 'Health Check Two' }));

      const health = await storage.healthCheck();

      expect(health.ok).toBe(true);
      expect(health.path).toBe(testDir);
      expect(health.entryCount).toBe(2);
    });

    it('creates directory if it does not exist', async () => {
      const newStorage = new FileKnowledgeStorageService(
        path.join(os.tmpdir(), `health-check-new-${Date.now()}`)
      );

      const health = await newStorage.healthCheck();

      expect(health.ok).toBe(true);
      expect(health.entryCount).toBe(0);
    });

    it('returns ok=true for empty directory', async () => {
      await storage.healthCheck(); // Ensure directory exists

      const health = await storage.healthCheck();

      expect(health.ok).toBe(true);
      expect(health.entryCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles special characters in content', async () => {
      const input = createTestInput({
        title: 'Special Chars',
        content: '```typescript\nconst x: string = "test";\n```\n\n---\n\n> Quote',
      });

      await storage.save(input);
      const entry = await storage.get('special-chars');

      expect(entry?.content).toBe(input.content);
    });

    it('handles very long titles', async () => {
      const longTitle = `${'A'.repeat(200)} Long Title`;
      const input = createTestInput({ title: longTitle });

      const entry = await storage.save(input);

      expect(entry.title).toBe(longTitle);
      expect(entry.slug.length).toBeLessThanOrEqual(250);
    });

    it('handles unicode in content but ASCII in title', async () => {
      const input = createTestInput({
        title: 'Unicode Content Test',
        content: '日本語コンテンツ with émojis 🎉 and ñ',
      });

      await storage.save(input);
      const entry = await storage.get('unicode-content-test');

      expect(entry?.content).toBe(input.content);
    });

    it('handles concurrent saves to different files', async () => {
      const inputs = [
        createTestInput({ title: 'Concurrent One' }),
        createTestInput({ title: 'Concurrent Two' }),
        createTestInput({ title: 'Concurrent Three' }),
      ];

      const entries = await Promise.all(inputs.map((input) => storage.save(input)));

      expect(entries).toHaveLength(3);
      const list = await storage.list();
      expect(list).toHaveLength(3);
    });
  });

  describe('subdirectory filtering', () => {
    it('lists only base directory files when subdirectories is empty array', async () => {
      // Create files in base directory
      await storage.save(createTestInput({ title: 'Base File 1' }));
      await storage.save(createTestInput({ title: 'Base File 2' }));

      // Create files in subdirectories
      await storage.save(createTestInput({ title: 'Project A File', subdirectory: 'abc123' }));
      await storage.save(createTestInput({ title: 'Project B File', subdirectory: 'def456' }));

      // List with empty array should only return base directory files
      const entries = await storage.list({}, []);

      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.title).sort()).toEqual(['Base File 1', 'Base File 2']);
    });

    it('lists base directory and specific subdirectory files', async () => {
      // Create files in base directory
      await storage.save(createTestInput({ title: 'Base File' }));

      // Create files in multiple subdirectories
      await storage.save(createTestInput({ title: 'Project A File', subdirectory: 'abc123' }));
      await storage.save(createTestInput({ title: 'Project B File', subdirectory: 'def456' }));
      await storage.save(createTestInput({ title: 'Project C File', subdirectory: 'ghi789' }));

      // List with specific subdirectory should return base + that subdirectory
      const entries = await storage.list({}, ['abc123']);

      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.title).sort()).toEqual(['Base File', 'Project A File']);
    });

    it('lists base directory and multiple specific subdirectories', async () => {
      // Create files in base directory
      await storage.save(createTestInput({ title: 'Base File' }));

      // Create files in multiple subdirectories
      await storage.save(createTestInput({ title: 'Project A File', subdirectory: 'abc123' }));
      await storage.save(createTestInput({ title: 'Project B File', subdirectory: 'def456' }));
      await storage.save(createTestInput({ title: 'Project C File', subdirectory: 'ghi789' }));

      // List with multiple subdirectories
      const entries = await storage.list({}, ['abc123', 'ghi789']);

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.title).sort()).toEqual([
        'Base File',
        'Project A File',
        'Project C File',
      ]);
    });

    it('lists all subdirectories when subdirectories parameter is null', async () => {
      // Create files in base directory
      await storage.save(createTestInput({ title: 'Base File' }));

      // Create files in multiple subdirectories
      await storage.save(createTestInput({ title: 'Project A File', subdirectory: 'abc123' }));
      await storage.save(createTestInput({ title: 'Project B File', subdirectory: 'def456' }));
      await storage.save(createTestInput({ title: 'Project C File', subdirectory: 'ghi789' }));

      // List with null should scan all subdirectories
      const entries = await storage.list({}, null);

      expect(entries).toHaveLength(4);
      expect(entries.map((e) => e.title).sort()).toEqual([
        'Base File',
        'Project A File',
        'Project B File',
        'Project C File',
      ]);
    });

    it('lists all subdirectories when subdirectories parameter is undefined', async () => {
      // Create files in base directory
      await storage.save(createTestInput({ title: 'Base File' }));

      // Create files in multiple subdirectories
      await storage.save(createTestInput({ title: 'Project A File', subdirectory: 'abc123' }));
      await storage.save(createTestInput({ title: 'Project B File', subdirectory: 'def456' }));

      // List with undefined (default) should scan all subdirectories
      const entries = await storage.list({}, undefined);

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.title).sort()).toEqual([
        'Base File',
        'Project A File',
        'Project B File',
      ]);
    });

    it('applies filters when listing with subdirectory restriction', async () => {
      // Create files in base directory
      await storage.save(
        createTestInput({ title: 'Base Policy', category: 'policy', content: 'Policy content' })
      );
      await storage.save(
        createTestInput({
          title: 'Base Reference',
          category: 'reference',
          content: 'Reference content',
        })
      );

      // Create files in subdirectory
      await storage.save(
        createTestInput({
          title: 'Project Policy',
          category: 'policy',
          content: 'Project policy',
          subdirectory: 'abc123',
        })
      );
      await storage.save(
        createTestInput({
          title: 'Project Reference',
          category: 'reference',
          content: 'Project reference',
          subdirectory: 'abc123',
        })
      );

      // Create file in different subdirectory
      await storage.save(
        createTestInput({
          title: 'Other Project Policy',
          category: 'policy',
          subdirectory: 'def456',
        })
      );

      // List with category filter and subdirectory restriction
      const entries = await storage.list({ category: 'policy' }, ['abc123']);

      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.title).sort()).toEqual(['Base Policy', 'Project Policy']);
    });

    it('handles non-existent subdirectory gracefully', async () => {
      // Create files in base directory
      await storage.save(createTestInput({ title: 'Base File' }));

      // List with non-existent subdirectory should only return base files
      const entries = await storage.list({}, ['nonexistent']);

      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Base File');
    });
  });
});
