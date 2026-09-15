/**
 * Tests for the framework boilerplate copier
 *
 * Tests the file-based template approach where templates are read
 * from the filesystem at runtime.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs/promises before importing the module
vi.mock('node:fs/promises');

// Mock the local templates module (async functions that return Promises)
// Use factory functions so mocks survive vi.resetAllMocks()
vi.mock('../../../templates/index.js', () => ({
  getProjectFiles: vi.fn(),
  getFrameworkFiles: vi.fn(),
}));

// Import the mocked module to set up implementations in beforeEach
import * as templates from '../../../templates/index.js';

// Mock the config
vi.mock('../../../config.js', () => ({
  FRAMEWORKS: {
    langgraph: {
      id: 'langgraph',
      displayName: 'LangGraph',
      kbDocSlug: 'langgraph-best-practices',
    },
  },
  getFrameworkIds: () => ['langgraph'],
}));

// Import after mocks are set up
import {
  FrameworkError,
  copyFrameworkBoilerplate,
  resolveFrameworkTemplateDir,
} from '../framework-copier.js';

describe('framework-copier', () => {
  const mockProjectDir = '/test/project';

  beforeEach(() => {
    vi.resetAllMocks();

    // Re-setup mock implementations after reset
    vi.mocked(templates.getProjectFiles).mockResolvedValue([
      { path: '.env', content: '# Anthropic API Key\nANTHROPIC_API_KEY=' },
      { path: '.gitignore', content: '# Python\n__pycache__/' },
    ]);

    vi.mocked(templates.getFrameworkFiles).mockImplementation(async (frameworkId: string) => {
      if (frameworkId === 'langgraph') {
        return [
          { path: 'main.py', content: '# Main entry point' },
          { path: 'pyproject.toml', content: '[project]\nname = "kai-agent"' },
          { path: 'README.md', content: '# LangGraph Agent' },
          { path: 'src/agent/__init__.py', content: '# Agent init' },
          { path: 'src/agent/graph.py', content: '# Graph definition' },
          { path: 'src/agent/state.py', content: '# State schema' },
          { path: 'src/agent/tools.py', content: '# Tool implementations' },
        ];
      }
      throw new Error(`Unknown framework: ${frameworkId}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveFrameworkTemplateDir', () => {
    it('returns embedded marker for valid framework', () => {
      const result = resolveFrameworkTemplateDir('langgraph');
      // Now returns an embedded marker since templates are no longer read from filesystem
      expect(result).toContain('embedded');
      expect(result).toContain('langgraph');
    });

    it('throws FrameworkError for invalid framework', () => {
      expect(() => resolveFrameworkTemplateDir('invalid-framework')).toThrow(FrameworkError);
      expect(() => resolveFrameworkTemplateDir('invalid-framework')).toThrow(/Unknown framework/);
    });
  });

  describe('copyFrameworkBoilerplate', () => {
    it('writes all embedded template files to project directory', async () => {
      // Mock fs.access to fail for all destination files (they don't exist)
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await copyFrameworkBoilerplate('langgraph', mockProjectDir);

      expect(result.framework).toBe('langgraph');
      expect(result.displayName).toBe('LangGraph');
      expect(result.kbDocSlug).toBe('langgraph-best-practices');
      expect(result.success).toBe(true);

      // Should include both project files and framework files
      expect(result.copiedFiles).toContain('.env');
      expect(result.copiedFiles).toContain('.gitignore');
      expect(result.copiedFiles).toContain('main.py');
      expect(result.copiedFiles).toContain('pyproject.toml');
      expect(result.copiedFiles).toContain('README.md');
      expect(result.copiedFiles).toContain('src/agent/__init__.py');
      expect(result.copiedFiles).toContain('src/agent/graph.py');
      expect(result.copiedFiles).toContain('src/agent/state.py');
      expect(result.copiedFiles).toContain('src/agent/tools.py');

      expect(result.skippedFiles).toHaveLength(0);
    });

    it('writes files with correct content using fs.writeFile', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await copyFrameworkBoilerplate('langgraph', mockProjectDir);

      // Verify writeFile was called with correct paths and content
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(mockProjectDir, '.env'),
        '# Anthropic API Key\nANTHROPIC_API_KEY=',
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(mockProjectDir, '.gitignore'),
        '# Python\n__pycache__/',
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(mockProjectDir, 'main.py'),
        '# Main entry point',
        'utf-8'
      );
    });

    it('creates parent directories for nested files', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await copyFrameworkBoilerplate('langgraph', mockProjectDir);

      // Should create src/agent directory for nested files
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(mockProjectDir, 'src/agent'),
        { recursive: true }
      );
    });

    it('skips files that already exist in project', async () => {
      // Mock: .env and main.py already exist, others don't
      vi.mocked(fs.access).mockImplementation(async (pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr === path.join(mockProjectDir, '.env')) return;
        if (pathStr === path.join(mockProjectDir, 'main.py')) return;
        throw new Error('ENOENT');
      });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await copyFrameworkBoilerplate('langgraph', mockProjectDir);

      // These should be skipped
      expect(result.skippedFiles).toContain('.env');
      expect(result.skippedFiles).toContain('main.py');

      // These should be copied
      expect(result.copiedFiles).toContain('.gitignore');
      expect(result.copiedFiles).toContain('pyproject.toml');
      expect(result.copiedFiles).toContain('README.md');

      expect(result.success).toBe(true);
    });

    it('returns success even when all files skipped', async () => {
      // All files already exist
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await copyFrameworkBoilerplate('langgraph', mockProjectDir);

      // All files should be skipped
      expect(result.copiedFiles).toHaveLength(0);
      expect(result.skippedFiles.length).toBeGreaterThan(0);
      expect(result.skippedFiles).toContain('.env');
      expect(result.skippedFiles).toContain('main.py');
      expect(result.success).toBe(true);
    });

    it('throws FrameworkError for invalid framework', async () => {
      await expect(copyFrameworkBoilerplate('nonexistent', mockProjectDir)).rejects.toThrow(
        FrameworkError
      );
      await expect(copyFrameworkBoilerplate('nonexistent', mockProjectDir)).rejects.toThrow(
        /Unknown framework/
      );
    });

    it('throws FrameworkError when write fails', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(copyFrameworkBoilerplate('langgraph', mockProjectDir)).rejects.toThrow(
        FrameworkError
      );
      await expect(copyFrameworkBoilerplate('langgraph', mockProjectDir)).rejects.toThrow(
        /Failed to write/
      );
    });

    it('uses current working directory as default project dir', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await copyFrameworkBoilerplate('langgraph');

      expect(result.success).toBe(true);
      // Files should be written relative to cwd
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(process.cwd(), '.env'),
        expect.any(String),
        'utf-8'
      );
    });
  });
});
