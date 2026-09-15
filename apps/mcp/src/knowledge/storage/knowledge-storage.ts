/**
 * Knowledge Storage Service implementation
 *
 * Provides file-based storage for knowledge entries in .mdc format.
 * Simplified from the original: flat fields, no tags/entities, process.cwd() for project.
 * See: docs/internal/designs/context-management-system.md
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getKnowledgeDir as resolveKnowledgeDir } from '../../kai-home.js';
import type {
  HealthCheckResult,
  KnowledgeEntry,
  KnowledgeEntryFilter,
  KnowledgeEntryFrontmatter,
  KnowledgeStorageService,
  SaveKnowledgeEntryInput,
} from './types.js';
import { KnowledgeStorageError } from './types.js';
import { generateMdcFile, generateSlug, parseMdcFile, validateCategory } from './utils.js';

/**
 * Get the base directory for knowledge storage.
 * Uses KAI_KNOWLEDGE_DIR (or legacy KAHUNA_KNOWLEDGE_DIR) if set, otherwise ~/.kai/knowledge/
 */
function getDefaultBaseDir(): string {
  return resolveKnowledgeDir();
}

/**
 * File-based implementation of KnowledgeStorageService
 *
 * Stores knowledge entries as .mdc files (markdown with YAML frontmatter).
 * Files are named by title-derived slug for semantic naming.
 * Designed for ~1000 entries with on-demand file scanning.
 */
export class FileKnowledgeStorageService implements KnowledgeStorageService {
  private readonly baseDir: string;
  private dirEnsured = false;

  /**
   * Create a new FileKnowledgeStorageService
   *
   * @param baseDir - Directory for storing .mdc files (defaults to ~/.kai/knowledge/)
   */
  constructor(baseDir: string = getDefaultBaseDir()) {
    this.baseDir = baseDir;
  }

  /**
   * Ensure the knowledge directory exists (lazy initialization)
   */
  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) return;

    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      this.dirEnsured = true;
    } catch (error) {
      throw new KnowledgeStorageError(
        `Failed to create knowledge directory: ${this.baseDir}`,
        'DIR_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the file path for a given slug
   *
   * @param slug - The slug for the knowledge entry
   * @param subdirectory - Optional subdirectory within the base directory
   */
  private getFilePath(slug: string, subdirectory?: string): string {
    if (subdirectory) {
      return path.join(this.baseDir, subdirectory, `${slug}.mdc`);
    }
    return path.join(this.baseDir, `${slug}.mdc`);
  }

  /**
   * Ensure a subdirectory exists within the knowledge base
   *
   * @param subdirectory - Subdirectory path relative to baseDir
   */
  private async ensureSubdirectory(subdirectory: string): Promise<void> {
    const subdirPath = path.join(this.baseDir, subdirectory);
    try {
      await fs.mkdir(subdirPath, { recursive: true });
    } catch (error) {
      throw new KnowledgeStorageError(
        `Failed to create subdirectory: ${subdirPath}`,
        'DIR_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create or update a knowledge entry.
   *
   * Accepts simplified SaveKnowledgeEntryInput with flat fields.
   * Sets source.project = process.cwd() automatically.
   * Preserves created_at on updates.
   * Supports optional subdirectory for project-specific storage.
   */
  async save(input: SaveKnowledgeEntryInput): Promise<KnowledgeEntry> {
    await this.ensureDir();

    // Ensure subdirectory exists if specified
    if (input.subdirectory) {
      await this.ensureSubdirectory(input.subdirectory);
    }

    // Generate slug from title
    const slug = generateSlug(input.title);
    if (!slug) {
      throw new KnowledgeStorageError(
        `Invalid title: "${input.title}" generates empty slug`,
        'WRITE_ERROR'
      );
    }

    const filepath = this.getFilePath(slug, input.subdirectory);
    const now = new Date().toISOString();

    // Check if file exists to preserve created_at
    let createdAt = now;
    try {
      const existing = await this.get(slug, input.subdirectory);
      if (existing) {
        createdAt = existing.created_at;
      }
    } catch {
      // File doesn't exist, use current time for created_at
    }

    // Build frontmatter with simplified flat fields
    const frontmatter: KnowledgeEntryFrontmatter = {
      type: 'knowledge',
      title: input.title,
      summary: input.summary,
      created_at: createdAt,
      updated_at: now,
      source: {
        file: input.sourceFile,
        project: process.cwd(),
        path: input.sourcePath ?? null,
      },
      classification: {
        category: validateCategory(input.category),
        confidence: input.confidence,
        reasoning: input.reasoning,
        topics: input.topics,
      },
      status: 'active',
    };

    // Generate .mdc content
    const mdcContent = generateMdcFile(frontmatter, input.content);

    // Write file
    try {
      await fs.writeFile(filepath, mdcContent, 'utf-8');
    } catch (error) {
      throw new KnowledgeStorageError(
        `Failed to write knowledge entry: ${filepath}`,
        'WRITE_ERROR',
        error instanceof Error ? error : undefined
      );
    }

    return { ...frontmatter, slug, content: input.content };
  }

  /**
   * List all knowledge entries with optional filtering.
   *
   * Reads all .mdc files from the directory and subdirectories, parses them,
   * and applies filters in memory. No tag-based filtering (tags removed).
   *
   * @param filter - Optional filter criteria
   * @param subdirectories - Optional array of subdirectories to include. If null/undefined, scans ALL subdirectories. Pass empty array [] to scan only base directory.
   */
  async list(
    filter?: KnowledgeEntryFilter,
    subdirectories?: string[] | null
  ): Promise<KnowledgeEntry[]> {
    await this.ensureDir();

    const entries: KnowledgeEntry[] = [];

    // Helper function to read .mdc files from a directory
    const readMdcFiles = async (dirPath: string, subdirectory?: string): Promise<void> => {
      let files: string[];
      try {
        files = await fs.readdir(dirPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return;
        }
        throw new KnowledgeStorageError(
          `Failed to read directory: ${dirPath}`,
          'DIR_ERROR',
          error instanceof Error ? error : undefined
        );
      }

      // Filter for .mdc files
      const mdcFiles = files.filter((f) => f.endsWith('.mdc'));

      // Parse all files
      for (const filename of mdcFiles) {
        try {
          const slug = filename.replace(/\.mdc$/, '');
          const content = await fs.readFile(path.join(dirPath, filename), 'utf-8');
          const parsed = parseMdcFile(content);
          entries.push({
            ...parsed.frontmatter,
            slug,
            content: parsed.body,
            subdirectory,
          });
        } catch (error) {
          // Log warning but don't fail the entire operation
          const displayPath = subdirectory ? `${subdirectory}/${filename}` : filename;
          console.warn(`Failed to parse ${displayPath}:`, error);
        }
      }
    };

    // Read from base directory
    await readMdcFiles(this.baseDir);

    // Determine which subdirectories to scan
    if (subdirectories === null || subdirectories === undefined) {
      // Scan ALL subdirectories
      try {
        const allFiles = await fs.readdir(this.baseDir, { withFileTypes: true });
        const subdirs = allFiles.filter((f) => f.isDirectory()).map((f) => f.name);
        for (const subdir of subdirs) {
          const subdirPath = path.join(this.baseDir, subdir);
          await readMdcFiles(subdirPath, subdir);
        }
      } catch (error) {
        // If we can't read subdirectories, just continue with base directory files
        console.warn('Failed to scan subdirectories:', error);
      }
    } else if (subdirectories.length > 0) {
      // Scan specific subdirectories
      for (const subdir of subdirectories) {
        const subdirPath = path.join(this.baseDir, subdir);
        await readMdcFiles(subdirPath, subdir);
      }
    }
    // If subdirectories is empty array [], only base directory is scanned (already done above)

    // Apply filters if provided
    if (!filter) return entries;

    return entries.filter((entry) => {
      // Filter by project
      if (filter.project && entry.source.project !== filter.project) {
        return false;
      }

      // Filter by status
      if (filter.status && entry.status !== filter.status) {
        return false;
      }

      // Filter by category (can be single or array)
      if (filter.category) {
        const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
        if (!categories.includes(entry.classification.category)) {
          return false;
        }
      }

      // Filter by content search (simple substring match)
      if (filter.contentSearch) {
        const searchLower = filter.contentSearch.toLowerCase();
        const contentLower = entry.content.toLowerCase();
        const titleLower = entry.title.toLowerCase();
        const summaryLower = entry.summary.toLowerCase();

        // Search in content, title, and summary
        if (
          !contentLower.includes(searchLower) &&
          !titleLower.includes(searchLower) &&
          !summaryLower.includes(searchLower)
        ) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get a single entry by slug
   *
   * @param slug - Filename without extension (e.g., "api-design-guidelines")
   * @param subdirectory - Optional subdirectory within the knowledge base
   * @returns Entry or null if not found
   */
  async get(slug: string, subdirectory?: string): Promise<KnowledgeEntry | null> {
    const filepath = this.getFilePath(slug, subdirectory);

    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const parsed = parseMdcFile(content);
      return { ...parsed.frontmatter, slug, content: parsed.body };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new KnowledgeStorageError(
        `Failed to read knowledge entry: ${filepath}`,
        'PARSE_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if an entry exists
   *
   * @param slug - Filename without extension
   * @param subdirectory - Optional subdirectory within the knowledge base
   */
  async exists(slug: string, subdirectory?: string): Promise<boolean> {
    const filepath = this.getFilePath(slug, subdirectory);

    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an entry (or mark as archived)
   *
   * @param slug - Filename without extension
   * @param subdirectory - Optional subdirectory within the knowledge base
   * @param permanent - If true, delete file; if false, set status to archived
   */
  async delete(slug: string, subdirectory?: string, permanent = false): Promise<void> {
    const filepath = this.getFilePath(slug, subdirectory);

    if (permanent) {
      // Hard delete - remove file
      try {
        await fs.unlink(filepath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new KnowledgeStorageError(`Entry not found: ${slug}`, 'NOT_FOUND');
        }
        throw new KnowledgeStorageError(
          `Failed to delete knowledge entry: ${filepath}`,
          'WRITE_ERROR',
          error instanceof Error ? error : undefined
        );
      }
    } else {
      // Soft delete - mark as archived
      const existing = await this.get(slug, subdirectory);
      if (!existing) {
        throw new KnowledgeStorageError(`Entry not found: ${slug}`, 'NOT_FOUND');
      }

      // Update status to archived
      const frontmatter: KnowledgeEntryFrontmatter = {
        type: existing.type,
        title: existing.title,
        summary: existing.summary,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
        source: existing.source,
        classification: existing.classification,
        status: 'archived',
      };

      const mdcContent = generateMdcFile(frontmatter, existing.content);

      try {
        await fs.writeFile(filepath, mdcContent, 'utf-8');
      } catch (error) {
        throw new KnowledgeStorageError(
          `Failed to archive knowledge entry: ${filepath}`,
          'WRITE_ERROR',
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  /**
   * Check if the knowledge base directory exists and is accessible
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await this.ensureDir();

      const files = await fs.readdir(this.baseDir);
      const mdcFiles = files.filter((f) => f.endsWith('.mdc'));

      return {
        ok: true,
        path: this.baseDir,
        entryCount: mdcFiles.length,
      };
    } catch {
      return {
        ok: false,
        path: this.baseDir,
        entryCount: 0,
      };
    }
  }

  /**
   * Remove all .mdc files from the directory.
   *
   * Used primarily for testing. Use with caution in production.
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.baseDir);
      const mdcFiles = files.filter((f) => f.endsWith('.mdc'));

      await Promise.all(mdcFiles.map((filename) => fs.unlink(path.join(this.baseDir, filename))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist, nothing to clear
        return;
      }
      throw new KnowledgeStorageError(
        `Failed to clear knowledge directory: ${this.baseDir}`,
        'WRITE_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }
}
