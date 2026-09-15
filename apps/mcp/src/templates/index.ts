/**
 * Template access utilities for file-based templates.
 *
 * Templates are stored as files in the templates/ directory and are
 * read from the filesystem at runtime. This makes templates easier
 * to maintain and edit compared to embedding them as strings.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnv } from '../kai-home.js';

// =============================================================================
// Types
// =============================================================================

/**
 * A template file with its relative path and content.
 */
export interface TemplateFile {
  path: string;
  content: string;
}

/**
 * Framework template metadata.
 */
export interface FrameworkTemplate {
  id: string;
  name: string;
  description: string;
  path: string;
}

/**
 * Copilot config template metadata.
 */
export interface CopilotConfigTemplate {
  id: string;
  name: string;
  description: string;
  path: string;
}

// =============================================================================
// Template Directory Resolution
// =============================================================================

// Cache the templates directory path
let _templatesDir: string | null = null;

/**
 * Get the absolute path to the templates directory.
 *
 * Works for both:
 * - Development: templates/ relative to src/templates/
 * - Bundled CJS: templates/ relative to the bundle location
 * - npm installed: templates/ in package directory
 * - Docker: via KAI_TEMPLATES_DIR environment variable
 */
function getTemplatesDir(): string {
  // Return cached value if available
  if (_templatesDir) {
    return _templatesDir;
  }

  // 1. Check KAI_TEMPLATES_DIR env var first (Docker, explicit config)
  const envPath = readEnv('KAI_TEMPLATES_DIR');
  if (envPath) {
    _templatesDir = envPath;
    return _templatesDir;
  }

  // 2. Try to detect from module location
  // In CJS bundles, import.meta.url is empty/undefined
  // In ESM development, we use import.meta.url

  // Check if we're in a CJS bundle (import.meta.url will be undefined or empty)
  // biome-ignore lint/suspicious/noExplicitAny: CJS/ESM compatibility check
  const metaUrl = (import.meta as any)?.url;

  if (metaUrl) {
    // ESM mode (development or tsc compiled)
    const __filename = fileURLToPath(metaUrl);
    const __dirname = path.dirname(__filename);

    // Development: templates/ is at apps/mcp/templates/ (up from src/templates/)
    if (__dirname.includes('src')) {
      _templatesDir = path.resolve(__dirname, '..', '..', 'templates');
      return _templatesDir;
    }

    // TSC compiled: dist/templates/index.js -> templates are in dist/templates/
    // __dirname = dist/templates, templates are at dist/templates/copilot-configs/, etc.
    if (__dirname.includes('dist')) {
      _templatesDir = __dirname;
      return _templatesDir;
    }

    // ESM bundled fallback
    _templatesDir = path.resolve(__dirname, 'templates');
    return _templatesDir;
  }

  // CJS mode (bundled)
  // In bundled CJS with esbuild, we need to find templates/ relative to the bundle
  // The bundle is at dist/kai-mcp.cjs, templates are at dist/templates/

  // Try __dirname first (available in CJS context, more reliable than process.argv)
  // In bundled CJS, __dirname points to the directory containing the bundle
  // biome-ignore lint/suspicious/noExplicitAny: CJS global check
  const cjsDirname = typeof __dirname !== 'undefined' ? __dirname : undefined;
  if (cjsDirname) {
    _templatesDir = path.resolve(cjsDirname, 'templates');
    return _templatesDir;
  }

  // Fallback: Use process.argv[1] which is the path to the script being executed
  // This works for `node dist/kai-mcp.cjs` and npx scenarios
  // but may fail when loaded as a library or in some test runners
  const scriptPath = process.argv[1];
  if (scriptPath) {
    const scriptDir = path.dirname(scriptPath);
    _templatesDir = path.resolve(scriptDir, 'templates');
    return _templatesDir;
  }

  // Last resort: use cwd
  _templatesDir = path.resolve(process.cwd(), 'templates');
  return _templatesDir;
}

// =============================================================================
// Template Metadata
// =============================================================================

/**
 * Available framework templates.
 */
export const FRAMEWORK_TEMPLATES: FrameworkTemplate[] = [
  {
    id: 'langgraph',
    name: 'LangGraph',
    description: 'Python agent framework using LangGraph for stateful workflows',
    path: 'frameworks/langgraph',
  },
  {
    id: 'openai',
    name: 'OpenAI Agent SDK',
    description:
      'Python agent framework using OpenAI Agents SDK for tool calling and multi-agent handoffs',
    path: 'frameworks/openai',
  },
];

/**
 * Available copilot configuration templates.
 */
export const COPILOT_CONFIG_TEMPLATES: CopilotConfigTemplate[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Configuration for Claude Code (formerly Cline)',
    path: 'copilot-configs/claude-code',
  },
];

/**
 * Get a framework template by ID.
 */
export function getFrameworkTemplate(id: string): FrameworkTemplate | undefined {
  return FRAMEWORK_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get a copilot config template by ID.
 */
export function getCopilotConfigTemplate(id: string): CopilotConfigTemplate | undefined {
  return COPILOT_CONFIG_TEMPLATES.find((t) => t.id === id);
}

/**
 * List all available frameworks.
 */
export function listFrameworks(): FrameworkTemplate[] {
  return [...FRAMEWORK_TEMPLATES];
}

/**
 * List all available copilot configs.
 */
export function listCopilotConfigs(): CopilotConfigTemplate[] {
  return [...COPILOT_CONFIG_TEMPLATES];
}

// =============================================================================
// File Reading Utilities
// =============================================================================

/**
 * Recursively read all files from a directory.
 * Returns TemplateFile[] with relative paths.
 */
async function readDirectoryRecursive(dirPath: string, basePath = ''): Promise<TemplateFile[]> {
  const files: TemplateFile[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Recursively read subdirectory
        const subFiles = await readDirectoryRecursive(fullPath, relativePath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Read file content
        const content = await fs.readFile(fullPath, 'utf-8');
        files.push({
          path: relativePath,
          content,
        });
      }
    }
  } catch (error) {
    // Log template read failures for debugging
    // ENOENT (directory doesn't exist) is expected in some scenarios, log as debug
    const isNotFound = (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (isNotFound) {
      console.warn(`[kai] Template directory not found: ${dirPath}`);
    } else {
      console.error(`[kai] Failed to read template directory: ${dirPath}`, error);
    }
    // Return empty array - caller should handle gracefully
  }

  return files;
}

/**
 * Read a single template file.
 */
async function readTemplateFile(relativePath: string): Promise<string | null> {
  const templatesDir = getTemplatesDir();
  const fullPath = path.join(templatesDir, relativePath);

  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// =============================================================================
// Public API: Get Template Files
// =============================================================================

/**
 * Get project-level template files (.env template, .gitignore).
 */
export async function getProjectFiles(): Promise<TemplateFile[]> {
  const files: TemplateFile[] = [];

  const envContent = await readTemplateFile('project-env');
  if (envContent) {
    files.push({ path: '.env', content: envContent });
  }

  const gitignoreContent = await readTemplateFile('project-gitignore');
  if (gitignoreContent) {
    files.push({ path: '.gitignore', content: gitignoreContent });
  }

  return files;
}

/**
 * Get LangGraph framework files.
 */
export async function getLangGraphFiles(): Promise<TemplateFile[]> {
  const templatesDir = getTemplatesDir();
  const frameworkDir = path.join(templatesDir, 'frameworks', 'langgraph');
  return readDirectoryRecursive(frameworkDir);
}

/**
 * Get OpenAI framework files.
 */
export async function getOpenAIFiles(): Promise<TemplateFile[]> {
  const templatesDir = getTemplatesDir();
  const frameworkDir = path.join(templatesDir, 'frameworks', 'openai');
  return readDirectoryRecursive(frameworkDir);
}

/**
 * Get Claude Code configuration files.
 */
export async function getClaudeCodeFiles(): Promise<TemplateFile[]> {
  const templatesDir = getTemplatesDir();
  const configDir = path.join(templatesDir, 'copilot-configs', 'claude-code');
  return readDirectoryRecursive(configDir);
}

/**
 * Get knowledge base seed files.
 */
export async function getKnowledgeBaseFiles(): Promise<TemplateFile[]> {
  const templatesDir = getTemplatesDir();
  const kbDir = path.join(templatesDir, 'knowledge-base');
  return readDirectoryRecursive(kbDir);
}

/**
 * Get template files for a framework.
 */
export async function getFrameworkFiles(frameworkId: string): Promise<TemplateFile[]> {
  switch (frameworkId) {
    case 'langgraph':
      return getLangGraphFiles();
    case 'openai':
      return getOpenAIFiles();
    default:
      throw new Error(`Unknown framework: ${frameworkId}`);
  }
}

/**
 * Get config files for a copilot.
 */
export async function getCopilotConfigFiles(copilotId: string): Promise<TemplateFile[]> {
  switch (copilotId) {
    case 'claude-code':
      return getClaudeCodeFiles();
    default:
      throw new Error(`Unknown copilot: ${copilotId}`);
  }
}
