/**
 * Context Writer — manages the project's .kai/context-guide.md
 *
 * References knowledge base files by their KB paths in a .kai/context-guide.md.
 *
 * See: docs/internal/designs/context-management-system.md
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { KnowledgeEntry } from '../storage/types.js';
import type { FrameworkCopyResult } from './framework-copier.js';

/**
 * A KB file reference with its knowledge base path.
 */
export interface KBFileReference {
  slug: string;
  reason: string;
  kbPath: string;
  title?: string;
}

/**
 * A local project file reference (not in KB, not copied).
 */
export interface ReferencedFile {
  slug: string;
  reason: string;
  localPath: string;
}

/**
 * Get the default KB directory path.
 * Uses KAI_KNOWLEDGE_DIR env var if set, otherwise defaults to ~/.kai/knowledge/
 */
function getKBDir(): string {
  return process.env.KAI_KNOWLEDGE_DIR || path.join(os.homedir(), '.kai', 'knowledge');
}

/**
 * Get the full KB path for a given slug.
 *
 * @param slug - The knowledge entry slug
 * @returns Full path to the .mdc file in the KB
 */
export function getKBPath(slug: string): string {
  return path.join(getKBDir(), `${slug}.mdc`);
}

/**
 * Ensure the context directory exists and is empty.
 * Creates the directory if it doesn't exist, removes .kai/context-guide.md if it does.
 *
 * @param contextDir - Path to the context directory
 */
export async function clearContextDir(contextDir: string): Promise<void> {
  // Ensure .kai directory exists
  const kaiDir = path.join(contextDir, '.kai');
  await fs.mkdir(kaiDir, { recursive: true });

  // Remove .kai/context-guide.md if it exists
  try {
    await fs.unlink(path.join(kaiDir, 'context-guide.md'));
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Generate and write a .kai/context-guide.md file
 *
 * @param contextDir - Path to the context directory
 * @param task - The task description that triggered context surfacing
 * @param kbFiles - KB files to reference with their paths
 * @param referencedFiles - Optional: Local project files to reference
 * @param frameworkResult - Optional: Framework boilerplate copy result
 */
export async function writeContextReadme(
  contextDir: string,
  task: string,
  kbFiles: KBFileReference[],
  referencedFiles?: ReferencedFile[],
  frameworkResult?: FrameworkCopyResult
): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const parts: string[] = [];

  parts.push(`# Context for: ${task}`);
  parts.push('');
  parts.push(`Surfaced from Kai knowledge base on ${date}.`);
  parts.push('');

  // Framework section (if boilerplate was copied)
  if (frameworkResult && frameworkResult.copiedFiles.length > 0) {
    parts.push('## Framework');
    parts.push('');
    parts.push(`Framework: **${frameworkResult.displayName}**`);
    parts.push(
      'Boilerplate files added to your project. See [README.md](./README.md) for structure and usage.'
    );
    parts.push('');
  }

  // Build file table for KB files (referenced by path, not copied)
  if (kbFiles.length > 0) {
    parts.push('## Knowledge Base Files');
    parts.push('');
    parts.push('| Topic | KB Path | Why Relevant |');
    parts.push('|-------|---------|--------------|');

    for (const file of kbFiles) {
      const title = file.title || file.slug;
      parts.push(`| ${title} | [${file.kbPath}](${file.kbPath}) | ${file.reason} |`);
    }
    parts.push('');
  }

  // Local project files section (referenced, not copied)
  if (referencedFiles && referencedFiles.length > 0) {
    parts.push('## Local Project Files');
    parts.push('');
    parts.push('These files are in your project:');
    parts.push('');
    parts.push('| Topic | Location | Why Relevant |');
    parts.push('|-------|----------|--------------|');
    for (const ref of referencedFiles) {
      parts.push(`| ${ref.slug} | [${ref.localPath}](./${ref.localPath}) | ${ref.reason} |`);
    }
    parts.push('');
  }

  // Build "Start Here" section
  const allItems = [
    ...kbFiles.map((f) => ({
      slug: f.slug,
      reason: f.reason,
      path: f.kbPath,
      isKB: true,
    })),
    ...(referencedFiles || []).map((r) => ({
      slug: r.slug,
      reason: r.reason,
      path: r.localPath,
      isKB: false,
    })),
  ];

  if (allItems.length > 0) {
    parts.push('## Start Here');
    parts.push('');

    const startHere = allItems.slice(0, 3).map((item, i) => {
      return `${i + 1}. Review ${item.path} — ${item.reason}`;
    });
    parts.push(startHere.join('\n'));
    parts.push('');
  }

  parts.push('---');
  parts.push('');
  parts.push('*Prepared by Kai | Use `kai_ask` for additional questions*');
  parts.push('');

  // Ensure .kai directory exists before writing
  const kaiDir = path.join(contextDir, '.kai');
  await fs.mkdir(kaiDir, { recursive: true });

  await fs.writeFile(path.join(kaiDir, 'context-guide.md'), parts.join('\n'), 'utf-8');
}

/**
 * Check if a KB entry has a local source file in the project.
 * Returns true if the source file:
 * 1. Has a source path recorded
 * 2. Exists at that path relative to cwd
 * 3. Is INSIDE the current working directory (not ../external/file.md)
 *
 * @param entry - The knowledge entry to check
 * @returns Promise<boolean> - True if entry has a local source file
 */
export async function hasLocalSource(entry: KnowledgeEntry): Promise<boolean> {
  // Check if entry has source path info
  if (!entry.source?.path) {
    return false;
  }

  const cwd = process.cwd();
  const fullPath = path.resolve(cwd, entry.source.path);

  // Ensure the resolved path is inside the current working directory
  // This prevents referencing files like "../external-project/file.md"
  const normalizedFull = path.normalize(fullPath);
  const normalizedCwd = path.normalize(cwd);
  if (!normalizedFull.startsWith(normalizedCwd + path.sep)) {
    return false;
  }

  // Check if the source file exists
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the relative path to a local source file.
 * Prefers source.path (relative path) over source.file (filename only).
 *
 * @param entry - The knowledge entry with source info
 * @returns Relative path suitable for markdown links from .kai/context-guide.md
 */
export function getLocalSourcePath(entry: KnowledgeEntry): string {
  if (!entry.source) {
    return '';
  }

  // Prefer source.path (the full relative path) over source.file (just filename)
  const sourcePath = entry.source.path || entry.source.file || '';

  // If the path is already relative, just use it
  if (!path.isAbsolute(sourcePath)) {
    return sourcePath;
  }

  // Get path relative to cwd
  const relativeToCwd = path.relative(process.cwd(), sourcePath);
  return relativeToCwd;
}
