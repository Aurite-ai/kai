/**
 * Initialize tool tests
 *
 * Tests:
 * 1. KB seed files are well-formed .mdc files
 * 2. Context detection functions work correctly
 * 3. Adaptive onboarding responses based on context state
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMdcFile } from '../../knowledge/storage/utils.js';
import {
  MIN_CONTEXT_FILE_SIZE,
  checkContextFileExists,
  checkContextStatus,
  initializeToolHandler,
} from '../initialize.js';
import type { ToolContext } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve the seed templates directory (now at apps/mcp/templates/) */
const seedTemplatesDir = path.resolve(__dirname, '..', '..', '..', 'templates', 'knowledge-base');

// =============================================================================
// KB SEED FILE TESTS
// =============================================================================

describe('KB seed files', () => {
  it('seed templates directory exists', async () => {
    const stat = await fs.stat(seedTemplatesDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('contains at least one .mdc file', async () => {
    const files = await fs.readdir(seedTemplatesDir);
    const mdcFiles = files.filter((f) => f.endsWith('.mdc'));
    expect(mdcFiles.length).toBeGreaterThan(0);
  });

  it('langgraph-best-practices.mdc is a valid .mdc file with correct frontmatter', async () => {
    const filePath = path.join(seedTemplatesDir, 'langgraph-best-practices.mdc');
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = parseMdcFile(content);

    // Frontmatter validation
    expect(parsed.frontmatter.type).toBe('knowledge');
    expect(parsed.frontmatter.title).toBe('LangGraph Best Practices');
    expect(parsed.frontmatter.summary).toBeTruthy();
    expect(parsed.frontmatter.classification.category).toBe('reference');
    expect(parsed.frontmatter.classification.confidence).toBe(1.0);
    expect(parsed.frontmatter.classification.topics).toContain('LangGraph');
    expect(parsed.frontmatter.source.file).toBe('langgraph-best-practices.mdc');
    expect(parsed.frontmatter.source.project).toBeNull();
    expect(parsed.frontmatter.status).toBe('active');

    // Body content validation
    expect(parsed.body).toContain('# LangGraph Best Practices');
    expect(parsed.body).toContain('## Core Concepts');
    expect(parsed.body.length).toBeGreaterThan(100);
  });

  it('all .mdc seed files are parseable', async () => {
    const files = await fs.readdir(seedTemplatesDir);
    const mdcFiles = files.filter((f) => f.endsWith('.mdc'));

    for (const file of mdcFiles) {
      const filePath = path.join(seedTemplatesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Should not throw
      const parsed = parseMdcFile(content);
      expect(parsed.frontmatter.type).toBe('knowledge');
      expect(parsed.frontmatter.title).toBeTruthy();
      expect(parsed.body.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// CONTEXT DETECTION TESTS (Phase 3)
// =============================================================================

describe('Context detection', () => {
  let tempDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kai-test-'));
    // Override the knowledge directory for tests
    originalEnv = process.env.KAI_KNOWLEDGE_DIR;
    process.env.KAI_KNOWLEDGE_DIR = tempDir;
  });

  afterEach(async () => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.KAI_KNOWLEDGE_DIR = originalEnv;
    } else {
      process.env.KAI_KNOWLEDGE_DIR = '';
    }
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('checkContextFileExists', () => {
    it('returns false when file does not exist', async () => {
      const result = await checkContextFileExists('org');
      expect(result).toBe(false);
    });

    it('returns false when file is empty (0 bytes)', async () => {
      await fs.writeFile(path.join(tempDir, 'org-context.mdc'), '');
      const result = await checkContextFileExists('org');
      expect(result).toBe(false);
    });

    it('returns false when file is too small (< MIN_CONTENT_SIZE bytes)', async () => {
      // Write content smaller than threshold
      const smallContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE - 1);
      await fs.writeFile(path.join(tempDir, 'org-context.mdc'), smallContent);
      const result = await checkContextFileExists('org');
      expect(result).toBe(false);
    });

    it('returns true when file exists and is large enough', async () => {
      // Write content larger than threshold
      const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
      await fs.writeFile(path.join(tempDir, 'org-context.mdc'), validContent);
      const result = await checkContextFileExists('org');
      expect(result).toBe(true);
    });

    it('correctly checks user-context.mdc', async () => {
      const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
      await fs.writeFile(path.join(tempDir, 'user-context.mdc'), validContent);
      const result = await checkContextFileExists('user');
      expect(result).toBe(true);
    });

    it('returns false when path is a directory, not a file', async () => {
      await fs.mkdir(path.join(tempDir, 'org-context.mdc'), { recursive: true });
      const result = await checkContextFileExists('org');
      expect(result).toBe(false);
    });
  });

  describe('checkContextStatus', () => {
    it('returns both false when neither file exists', async () => {
      const status = await checkContextStatus();
      expect(status.hasOrgContext).toBe(false);
      expect(status.hasUserContext).toBe(false);
    });

    it('returns org true, user false when only org exists', async () => {
      const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
      await fs.writeFile(path.join(tempDir, 'org-context.mdc'), validContent);

      const status = await checkContextStatus();
      expect(status.hasOrgContext).toBe(true);
      expect(status.hasUserContext).toBe(false);
    });

    it('returns org false, user true when only user exists', async () => {
      const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
      await fs.writeFile(path.join(tempDir, 'user-context.mdc'), validContent);

      const status = await checkContextStatus();
      expect(status.hasOrgContext).toBe(false);
      expect(status.hasUserContext).toBe(true);
    });

    it('returns both true when both files exist', async () => {
      const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
      await fs.writeFile(path.join(tempDir, 'org-context.mdc'), validContent);
      await fs.writeFile(path.join(tempDir, 'user-context.mdc'), validContent);

      const status = await checkContextStatus();
      expect(status.hasOrgContext).toBe(true);
      expect(status.hasUserContext).toBe(true);
    });

    it('handles mixed valid/invalid files', async () => {
      // Org file is valid
      const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
      await fs.writeFile(path.join(tempDir, 'org-context.mdc'), validContent);
      // User file is too small
      await fs.writeFile(path.join(tempDir, 'user-context.mdc'), 'tiny');

      const status = await checkContextStatus();
      expect(status.hasOrgContext).toBe(true);
      expect(status.hasUserContext).toBe(false);
    });
  });
});

// =============================================================================
// ADAPTIVE RESPONSE TESTS (Phase 4)
// =============================================================================

describe('Initialize tool adaptive responses', () => {
  let tempDir: string;
  let targetDir: string;
  let originalKbEnv: string | undefined;

  // Mock ToolContext
  const mockCtx: ToolContext = {
    storage: {} as ToolContext['storage'],
    anthropic: {} as ToolContext['anthropic'],
    usageTracker: {} as ToolContext['usageTracker'],
  };

  beforeEach(async () => {
    // Create temp directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kai-kb-test-'));
    targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kai-target-test-'));

    // Override knowledge directory
    originalKbEnv = process.env.KAI_KNOWLEDGE_DIR;
    process.env.KAI_KNOWLEDGE_DIR = tempDir;
  });

  afterEach(async () => {
    // Restore env
    if (originalKbEnv !== undefined) {
      process.env.KAI_KNOWLEDGE_DIR = originalKbEnv;
    } else {
      process.env.KAI_KNOWLEDGE_DIR = '';
    }
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  });

  it('returns full onboarding instructions when neither context exists', async () => {
    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;

    // Should contain full onboarding
    expect(text).toContain('Complete onboarding before restarting');
    expect(text).toContain('Phase 1: Situational Assessment');
    expect(text).toContain('Phase 2: Document Discovery');
    expect(text).toContain('Phase 3: Targeted Follow-ups');
    expect(text).toContain('Phase 4: Store Context');
    expect(text).toContain('kai_provide_context');
  });

  it('returns user-only onboarding when org exists but user does not', async () => {
    // Create valid org context
    const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
    await fs.writeFile(path.join(tempDir, 'org-context.mdc'), validContent);

    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;

    // Should contain user-only onboarding
    expect(text).toContain('Complete user onboarding before restarting');
    expect(text).toContain('User Context Needed');
    expect(text).toContain('organization context');

    // Should NOT contain full onboarding phases
    expect(text).not.toContain('Phase 1: Situational Assessment');
    expect(text).not.toContain('Phase 2: Document Discovery');
  });

  it('returns no onboarding when both contexts exist', async () => {
    // Create both valid context files
    const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
    await fs.writeFile(path.join(tempDir, 'org-context.mdc'), validContent);
    await fs.writeFile(path.join(tempDir, 'user-context.mdc'), validContent);

    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;

    // Should indicate no onboarding needed
    expect(text).toContain('organization and user context are already set up');
    expect(text).toContain('Restart Claude Code');
    expect(text).toContain('kai_prepare_context');

    // Should NOT contain onboarding instructions
    expect(text).not.toContain('Complete onboarding');
    expect(text).not.toContain('Phase 1');
  });

  it('returns full onboarding when only user context exists (unusual case)', async () => {
    // Create only user context (unusual - org should be set first)
    const validContent = 'x'.repeat(MIN_CONTEXT_FILE_SIZE + 10);
    await fs.writeFile(path.join(tempDir, 'user-context.mdc'), validContent);

    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;

    // Should still return full onboarding to capture org context
    expect(text).toContain('Complete onboarding before restarting');
    expect(text).toContain('Phase 1: Situational Assessment');
  });

  it('treats small files as missing (corrupted/empty)', async () => {
    // Create files that are too small
    await fs.writeFile(path.join(tempDir, 'org-context.mdc'), 'tiny');
    await fs.writeFile(path.join(tempDir, 'user-context.mdc'), 'also tiny');

    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;

    // Should return full onboarding because files are too small
    expect(text).toContain('Complete onboarding before restarting');
    expect(text).toContain('Phase 1: Situational Assessment');
  });

  it('still deploys templates when onboarding is needed', async () => {
    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;

    // Should report successful deployment
    expect(text).toContain('Kai Configured');
    expect(text).toContain('Rules deployed to `.claude/`');
    expect(text).toContain('Copilot Configuration');

    // Verify files were actually created
    const claudeDir = path.join(targetDir, '.claude');
    const claudeDirExists = await fs
      .stat(claudeDir)
      .then((s) => s.isDirectory())
      .catch(() => false);
    expect(claudeDirExists).toBe(true);
  });

  it('returns error for non-existent target directory', async () => {
    const result = await initializeToolHandler({ targetPath: '/nonexistent/path' }, mockCtx);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('does not exist');
  });
});

// =============================================================================
// INTEGRATION TEST: Response format matches design spec
// =============================================================================

describe('Initialize response format compliance', () => {
  let tempDir: string;
  let targetDir: string;
  let originalKbEnv: string | undefined;

  const mockCtx: ToolContext = {
    storage: {} as ToolContext['storage'],
    anthropic: {} as ToolContext['anthropic'],
    usageTracker: {} as ToolContext['usageTracker'],
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kai-kb-test-'));
    targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kai-target-test-'));
    originalKbEnv = process.env.KAI_KNOWLEDGE_DIR;
    process.env.KAI_KNOWLEDGE_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalKbEnv !== undefined) {
      process.env.KAI_KNOWLEDGE_DIR = originalKbEnv;
    } else {
      process.env.KAI_KNOWLEDGE_DIR = '';
    }
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  });

  it('includes <hints> section in response', async () => {
    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('<hints>');
    expect(text).toContain('</hints>');
  });

  it('includes the recommendation heuristic in full onboarding', async () => {
    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);
    const text = (result.content[0] as { text: string }).text;

    // The heuristic from the design doc
    expect(text).toContain('would this information change what patterns, constraints, or knowledge');
  });

  it('mentions kai_learn for document discovery', async () => {
    const result = await initializeToolHandler({ targetPath: targetDir }, mockCtx);
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('kai_learn');
    expect(text).toContain('Document Discovery');
  });
});
