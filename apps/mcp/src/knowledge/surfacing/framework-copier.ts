/**
 * Framework Boilerplate Copier
 *
 * Writes framework template files to the project directory.
 * Also writes shared project files (.env, .gitignore).
 * Used by prepare_context when the agent selects a framework.
 *
 * Templates are stored as files in apps/mcp/templates/ and read at runtime.
 *
 * See: docs/internal/plans/02-10_framework-selection.md
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FRAMEWORKS } from '../../config.js';
import { getFrameworkFiles, getProjectFiles } from '../../templates/index.js';

/**
 * Result of a boilerplate copy operation.
 */
export interface FrameworkCopyResult {
  /** Framework ID that was copied */
  framework: string;
  /** Framework display name */
  displayName: string;
  /** Files that were successfully copied */
  copiedFiles: string[];
  /** Files that were skipped (already exist) */
  skippedFiles: string[];
  /** Whether any files were copied */
  success: boolean;
  /** KB doc slug to auto-surface (e.g., 'langgraph-best-practices') */
  kbDocSlug: string;
}

/**
 * Error thrown when framework operations fail.
 */
export class FrameworkError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_FRAMEWORK' | 'TEMPLATE_NOT_FOUND' | 'COPY_FAILED'
  ) {
    super(message);
    this.name = 'FrameworkError';
  }
}

/**
 * Check if a path exists.
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a file from embedded template content, skipping if it already exists.
 *
 * @param destPath - Destination file path
 * @param content - File content to write
 * @param displayPath - Path to show in results (for user feedback)
 * @param copiedFiles - Array to push copied file paths to
 * @param skippedFiles - Array to push skipped file paths to
 * @throws FrameworkError if write fails
 */
async function writeFileIfNotExists(
  destPath: string,
  content: string,
  displayPath: string,
  copiedFiles: string[],
  skippedFiles: string[]
): Promise<void> {
  if (await pathExists(destPath)) {
    // File exists, skip it
    skippedFiles.push(displayPath);
  } else {
    // File doesn't exist, write it
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, content, 'utf-8');
      copiedFiles.push(displayPath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new FrameworkError(`Failed to write ${displayPath}: ${errorMsg}`, 'COPY_FAILED');
    }
  }
}

/**
 * Copy framework boilerplate to the project directory.
 * Also writes shared project files (.env, .gitignore).
 * Skips files that already exist (no overwriting).
 *
 * @param frameworkId - Framework identifier (e.g., 'langgraph')
 * @param projectDir - Project root directory (defaults to cwd)
 * @returns Copy result with lists of copied and skipped files
 * @throws FrameworkError if framework is invalid
 */
export async function copyFrameworkBoilerplate(
  frameworkId: string,
  projectDir: string = process.cwd()
): Promise<FrameworkCopyResult> {
  const frameworkConfig = FRAMEWORKS[frameworkId];
  if (!frameworkConfig) {
    throw new FrameworkError(
      `Unknown framework: ${frameworkId}. Valid frameworks: ${Object.keys(FRAMEWORKS).join(', ')}`,
      'INVALID_FRAMEWORK'
    );
  }

  const copiedFiles: string[] = [];
  const skippedFiles: string[] = [];

  // 1. Write shared project files (.env, .gitignore)
  const projectFiles = await getProjectFiles();
  for (const file of projectFiles) {
    const destPath = path.join(projectDir, file.path);
    await writeFileIfNotExists(destPath, file.content, file.path, copiedFiles, skippedFiles);
  }

  // 2. Write framework-specific files
  const frameworkFiles = await getFrameworkFiles(frameworkId);
  for (const file of frameworkFiles) {
    const destPath = path.join(projectDir, file.path);
    await writeFileIfNotExists(destPath, file.content, file.path, copiedFiles, skippedFiles);
  }

  return {
    framework: frameworkId,
    displayName: frameworkConfig.displayName,
    copiedFiles,
    skippedFiles,
    success: copiedFiles.length > 0 || skippedFiles.length > 0,
    kbDocSlug: frameworkConfig.kbDocSlug,
  };
}

// Track if deprecation warning has been shown
let _resolveFrameworkTemplateDirWarned = false;

/**
 * Resolve the path to a framework's template directory.
 * @deprecated This function is deprecated and will be removed in a future version.
 * Templates are now embedded in the bundle. Use getFrameworkFiles() from
 * '../../templates/index.js' instead.
 *
 * @param frameworkId - Framework identifier
 * @returns A placeholder string (not a real path)
 * @throws FrameworkError if framework is invalid
 */
export function resolveFrameworkTemplateDir(frameworkId: string): string {
  // Warn once per process about deprecation
  if (!_resolveFrameworkTemplateDirWarned) {
    _resolveFrameworkTemplateDirWarned = true;
    console.warn(
      '[kai] DEPRECATED: resolveFrameworkTemplateDir() is deprecated and will be removed. ' +
        'Use getFrameworkFiles() from templates/index.js instead.'
    );
  }

  // Validate framework ID
  if (!FRAMEWORKS[frameworkId]) {
    throw new FrameworkError(
      `Unknown framework: ${frameworkId}. Valid frameworks: ${Object.keys(FRAMEWORKS).join(', ')}`,
      'INVALID_FRAMEWORK'
    );
  }

  // Return a placeholder - templates are now embedded, not read from filesystem
  return `[embedded:frameworks/${frameworkId}]`;
}
