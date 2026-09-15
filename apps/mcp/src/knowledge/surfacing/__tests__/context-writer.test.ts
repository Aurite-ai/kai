/**
 * Tests for context writer
 *
 * Tests clearContextDir, writeContextReadme, getKBPath,
 * hasLocalSource, and getLocalSourcePath.
 * Uses real temp directories for filesystem tests.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKnowledgeDir } from '../../../kai-home.js';
import type { KnowledgeEntry } from '../../storage/types.js';
import {
  clearContextDir,
  getKBPath,
  getLocalSourcePath,
  hasLocalSource,
  writeContextReadme,
} from '../context-writer.js';

describe('context-writer', () => {
  let contextDir: string;

  beforeEach(async () => {
    contextDir = path.join(
      os.tmpdir(),
      `kai-context-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(contextDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('clearContextDir', () => {
    it('creates directory if it does not exist', async () => {
      await clearContextDir(contextDir);

      const stat = await fs.stat(contextDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('removes .kai/context-guide.md from existing directory', async () => {
      const kaiDir = path.join(contextDir, '.kai');
      await fs.mkdir(kaiDir, { recursive: true });
      await fs.writeFile(path.join(kaiDir, 'context-guide.md'), 'readme');

      await clearContextDir(contextDir);

      // .kai directory should still exist but context-guide.md should be removed
      const kaiExists = await fs
        .stat(kaiDir)
        .then(() => true)
        .catch(() => false);
      expect(kaiExists).toBe(true);

      const files = await fs.readdir(kaiDir);
      expect(files).toHaveLength(0);
    });

    it('handles directory without .kai/context-guide.md without error', async () => {
      await fs.mkdir(contextDir, { recursive: true });

      await expect(clearContextDir(contextDir)).resolves.not.toThrow();
    });
  });

  describe('getKBPath', () => {
    it('returns KB path for a slug', () => {
      const kbPath = getKBPath('api-guidelines');

      // ~/.kai, or legacy ~/.kahuna when only that exists on this machine
      expect(kbPath.startsWith(getKnowledgeDir())).toBe(true);
      expect(kbPath).toContain('api-guidelines.mdc');
    });

    it('uses KAI_KNOWLEDGE_DIR env var if set', () => {
      const originalEnv = process.env.KAI_KNOWLEDGE_DIR;
      process.env.KAI_KNOWLEDGE_DIR = '/custom/kb/path';

      const kbPath = getKBPath('test-slug');

      expect(kbPath).toBe('/custom/kb/path/test-slug.mdc');

      // Restore original env
      if (originalEnv) {
        process.env.KAI_KNOWLEDGE_DIR = originalEnv;
      } else {
        process.env.KAI_KNOWLEDGE_DIR = undefined;
      }
    });
  });

  describe('writeContextReadme', () => {
    beforeEach(async () => {
      await fs.mkdir(contextDir, { recursive: true });
    });

    it('generates .kai/context-guide.md with KB file references', async () => {
      const kbFiles = [
        {
          slug: 'api-guidelines',
          reason: 'Contains rate limiting rules',
          kbPath: '/home/user/.kai/knowledge/api-guidelines.mdc',
          title: 'API Guidelines',
        },
        {
          slug: 'error-patterns',
          reason: 'Error handling for rate limits',
          kbPath: '/home/user/.kai/knowledge/error-patterns.mdc',
          title: 'Error Patterns',
        },
      ];

      await writeContextReadme(contextDir, 'Add rate limiting to search', kbFiles);

      const readme = await fs.readFile(path.join(contextDir, '.kai/context-guide.md'), 'utf-8');

      expect(readme).toContain('# Context for: Add rate limiting to search');
      expect(readme).toContain('## Knowledge Base Files');
      expect(readme).toContain('| Topic | KB Path | Why Relevant |');
      expect(readme).toContain('API Guidelines');
      expect(readme).toContain('/home/user/.kai/knowledge/api-guidelines.mdc');
      expect(readme).toContain('Contains rate limiting rules');
    });

    it('includes Start Here section with first 3 items', async () => {
      const kbFiles = [
        { slug: 'file-a', reason: 'Reason A', kbPath: '/kb/file-a.mdc' },
        { slug: 'file-b', reason: 'Reason B', kbPath: '/kb/file-b.mdc' },
        { slug: 'file-c', reason: 'Reason C', kbPath: '/kb/file-c.mdc' },
        { slug: 'file-d', reason: 'Reason D', kbPath: '/kb/file-d.mdc' },
      ];

      await writeContextReadme(contextDir, 'Test task', kbFiles);

      const readme = await fs.readFile(path.join(contextDir, '.kai/context-guide.md'), 'utf-8');

      expect(readme).toContain('## Start Here');
      expect(readme).toContain('1. Review /kb/file-a.mdc');
      expect(readme).toContain('2. Review /kb/file-b.mdc');
      expect(readme).toContain('3. Review /kb/file-c.mdc');
      // 4th item should not be in Start Here
      expect(readme).not.toContain('Review /kb/file-d.mdc');
    });

    it('includes date and Kai attribution', async () => {
      await writeContextReadme(contextDir, 'Test', [
        { slug: 'test', reason: 'Test reason', kbPath: '/kb/test.mdc' },
      ]);

      const readme = await fs.readFile(path.join(contextDir, '.kai/context-guide.md'), 'utf-8');

      expect(readme).toContain('Surfaced from Kai knowledge base on');
      expect(readme).toContain('Prepared by Kai');
      expect(readme).toContain('kai_ask');
    });

    it('includes Local Project Files section when referencedFiles provided', async () => {
      const kbFiles = [{ slug: 'kb-file', reason: 'From KB', kbPath: '/kb/file.mdc' }];
      const referencedFiles = [
        { slug: 'local-doc', reason: 'From local project', localPath: 'docs/api-design.md' },
      ];

      await writeContextReadme(contextDir, 'Test with local files', kbFiles, referencedFiles);

      const readme = await fs.readFile(path.join(contextDir, '.kai/context-guide.md'), 'utf-8');

      expect(readme).toContain('## Local Project Files');
      expect(readme).toContain('These files are in your project');
      expect(readme).toContain('local-doc');
      expect(readme).toContain('docs/api-design.md');
      expect(readme).toContain('./docs/api-design.md'); // Link format
    });

    it('includes Framework section when frameworkResult provided with copied files', async () => {
      const kbFiles = [{ slug: 'test-file', reason: 'Test', kbPath: '/kb/test.mdc' }];
      const frameworkResult = {
        framework: 'langgraph',
        displayName: 'LangGraph',
        copiedFiles: ['src/agent.py', 'src/tools.py'],
        skippedFiles: [] as string[],
        success: true,
        kbDocSlug: 'langgraph-best-practices',
      };

      await writeContextReadme(contextDir, 'Build agent', kbFiles, undefined, frameworkResult);

      const readme = await fs.readFile(path.join(contextDir, '.kai/context-guide.md'), 'utf-8');

      expect(readme).toContain('## Framework');
      expect(readme).toContain('Framework: **LangGraph**');
      expect(readme).toContain('Boilerplate files added to your project');
    });

    it('does not include Framework section when no files were copied', async () => {
      const kbFiles = [{ slug: 'test-file', reason: 'Test', kbPath: '/kb/test.mdc' }];
      const frameworkResult = {
        framework: 'langgraph',
        displayName: 'LangGraph',
        copiedFiles: [] as string[],
        skippedFiles: ['src/agent.py'], // All files skipped
        success: true,
        kbDocSlug: 'langgraph-best-practices',
      };

      await writeContextReadme(contextDir, 'Build agent', kbFiles, undefined, frameworkResult);

      const readme = await fs.readFile(path.join(contextDir, '.kai/context-guide.md'), 'utf-8');

      expect(readme).not.toContain('## Framework');
    });
  });

  describe('hasLocalSource', () => {
    let inProjectDir: string;
    let inProjectFile: string;
    let inProjectRelativePath: string;
    let externalDir: string;
    let externalFile: string;
    let externalRelativePath: string;

    beforeEach(async () => {
      // Create a file inside cwd for testing (should have local source)
      inProjectDir = path.join(process.cwd(), 'test-local-ref');
      await fs.mkdir(inProjectDir, { recursive: true });
      inProjectFile = path.join(inProjectDir, 'test.md');
      inProjectRelativePath = path.relative(process.cwd(), inProjectFile);
      await fs.writeFile(inProjectFile, '# Test content');

      // Create a file outside cwd for testing (should NOT have local source)
      externalDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kai-external-'));
      externalFile = path.join(externalDir, 'external.md');
      externalRelativePath = path.relative(process.cwd(), externalFile);
      await fs.writeFile(externalFile, '# External content');
    });

    afterEach(async () => {
      try {
        await fs.rm(inProjectDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
      try {
        await fs.rm(externalDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    function createMockEntry(overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
      return {
        slug: 'test-entry',
        type: 'knowledge',
        title: 'Test Entry',
        summary: 'Test summary',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: {
          file: 'test.md',
          project: null,
          path: null,
        },
        classification: {
          category: 'reference',
          confidence: 0.9,
          reasoning: 'Test',
          topics: ['test'],
        },
        status: 'active',
        content: '# Test',
        ...overrides,
      };
    }

    it('returns false when source.path is null', async () => {
      const entry = createMockEntry({
        source: { file: 'test.md', project: process.cwd(), path: null },
      });

      const result = await hasLocalSource(entry);

      expect(result).toBe(false);
    });

    it('returns false when source.path file does not exist', async () => {
      const entry = createMockEntry({
        source: { file: 'nonexistent.md', project: process.cwd(), path: 'nonexistent/file.md' },
      });

      const result = await hasLocalSource(entry);

      expect(result).toBe(false);
    });

    it('returns true when source.path exists inside cwd', async () => {
      const entry = createMockEntry({
        source: { file: 'test.md', project: '/some/other/project', path: inProjectRelativePath },
      });

      const result = await hasLocalSource(entry);

      expect(result).toBe(true);
    });

    it('returns false when source.path exists but is outside cwd', async () => {
      const entry = createMockEntry({
        source: { file: 'external.md', project: '/external/project', path: externalRelativePath },
      });

      const result = await hasLocalSource(entry);

      // File exists but is outside the project directory - should NOT have local source
      expect(result).toBe(false);
    });
  });

  describe('getLocalSourcePath', () => {
    it('returns source.path when available', () => {
      const entry = {
        slug: 'test',
        title: 'Test',
        summary: 'Test',
        content: 'content',
        source: {
          file: 'api-design.md',
          path: 'docs/api-design.md',
          project: process.cwd(),
        },
      } as KnowledgeEntry;

      const result = getLocalSourcePath(entry);

      expect(result).toBe('docs/api-design.md');
    });

    it('falls back to source.file when source.path is not available', () => {
      const entry = {
        slug: 'test',
        title: 'Test',
        summary: 'Test',
        content: 'content',
        source: {
          file: 'api-design.md',
          project: process.cwd(),
        },
      } as KnowledgeEntry;

      const result = getLocalSourcePath(entry);

      expect(result).toBe('api-design.md');
    });

    it('converts absolute path to relative path from cwd', () => {
      const absolutePath = path.join(process.cwd(), 'docs', 'api-design.md');
      const entry = {
        slug: 'test',
        title: 'Test',
        summary: 'Test',
        content: 'content',
        source: {
          file: 'api-design.md',
          path: absolutePath,
          project: process.cwd(),
        },
      } as KnowledgeEntry;

      const result = getLocalSourcePath(entry);

      expect(result).toBe(path.join('docs', 'api-design.md'));
    });

    it('returns empty string when no source', () => {
      const entry = {
        slug: 'test',
        title: 'Test',
        summary: 'Test',
        content: 'content',
      } as KnowledgeEntry;

      const result = getLocalSourcePath(entry);

      expect(result).toBe('');
    });
  });
});
