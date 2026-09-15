/**
 * Onboarding Status Checker
 *
 * Checks if organization and project context files exist in the knowledge base.
 * Used by tools to gate or warn when onboarding is incomplete.
 *
 * Context files are created by:
 * - org-onboarding skill: creates files with titles like "Organization Context"
 * - project-onboarding skill: creates files with titles like "Project Context" + project hash
 *
 * The project hash is the first 6 hex characters of an MD5 hash of the project path.
 *
 * IMPORTANT: Slug matching is flexible because copilots may vary the exact titles.
 * We look for slugs containing key terms (org/organization + context, project + context + hash)
 * rather than requiring exact patterns.
 */

import * as crypto from 'node:crypto';
import type { KnowledgeStorageService } from '../knowledge/storage/types.js';

/**
 * Result of checking onboarding status.
 */
export interface OnboardingStatus {
  /** Whether org context exists in KB */
  hasOrgContext: boolean;
  /** Whether project context exists for current directory */
  hasProjectContext: boolean;
  /** Slug of org context entry if found */
  orgContextSlug?: string;
  /** Slug of project context entry if found */
  projectContextSlug?: string;
  /** The expected project context slug based on current directory */
  expectedProjectSlug: string;
}

/**
 * Generate the project hash used in project context slugs.
 * Uses first 6 hex characters of MD5 hash of the project path.
 *
 * This matches the algorithm in project-onboarding/SKILL.md:
 * "Generate a short hash (6 characters) from the path"
 */
export function generateProjectHash(projectPath: string): string {
  const hash = crypto.createHash('md5').update(projectPath).digest('hex');
  return hash.substring(0, 6);
}

/**
 * Check if a slug represents organization context.
 *
 * Flexible matching: accepts slugs containing both "org" (or "organization") and "context".
 * Examples that match:
 * - "org-context" (canonical)
 * - "organization-context"
 * - "organization-wide-context"
 * - "org-context-updated"
 */
export function isOrgContextSlug(slug: string): boolean {
  const lower = slug.toLowerCase();
  const hasOrgTerm = lower.includes('org');
  const hasContext = lower.includes('context');
  return hasOrgTerm && hasContext;
}

/**
 * Check if a slug represents project context for a specific project hash.
 *
 * Flexible matching: accepts slugs containing "project", "context", and the project hash.
 * Examples that match (for hash "36d725"):
 * - "project-context-36d725" (canonical)
 * - "project-business-context-36d725"
 * - "project-business-context-and-success-criteria-36d725ab"
 */
export function isProjectContextSlug(slug: string, projectHash: string): boolean {
  const lower = slug.toLowerCase();
  const hashLower = projectHash.toLowerCase();
  const hasProject = lower.includes('project');
  const hasContext = lower.includes('context');
  const hasHash = lower.includes(hashLower);
  return hasProject && hasContext && hasHash;
}

/**
 * Check if organization and project context files exist in the knowledge base.
 *
 * @param storage - Knowledge storage service instance
 * @param projectPath - Optional project path override (defaults to process.cwd())
 * @returns OnboardingStatus indicating what context exists
 */
export async function checkOnboardingStatus(
  storage: KnowledgeStorageService,
  projectPath?: string
): Promise<OnboardingStatus> {
  const cwd = projectPath ?? process.cwd();
  const projectHash = generateProjectHash(cwd);
  const expectedProjectSlug = `project-context-${projectHash}`;

  // Get all active entries from base directory only (context files are not in subdirectories)
  const entries = await storage.list({ status: 'active' }, []);

  // Find org context - flexible matching for slugs containing "org" and "context"
  const orgEntry = entries.find((entry) => isOrgContextSlug(entry.slug));

  // Find project context - flexible matching for slugs containing "project", "context", and the hash
  const projectEntry = entries.find((entry) => isProjectContextSlug(entry.slug, projectHash));

  return {
    hasOrgContext: !!orgEntry,
    hasProjectContext: !!projectEntry,
    orgContextSlug: orgEntry?.slug,
    projectContextSlug: projectEntry?.slug,
    expectedProjectSlug,
  };
}

/**
 * Build markdown response for missing org context.
 * Used as a hard gate in prepare_context.
 */
export function buildMissingOrgContextMarkdown(): string {
  return `# Organization Context Required

Before I can surface relevant context, I need to understand your organization.

**Say "set up org context"** to complete a quick 4-question onboarding.

<hints>
- This is a one-time setup that takes ~2 minutes
- Captures your industry, team structure, constraints, and priorities
- Helps Kai make recommendations aligned with your organization
</hints>`;
}

/**
 * Build markdown response for missing project context.
 * Used as a hard gate in prepare_context (after org context exists).
 */
export function buildMissingProjectContextMarkdown(): string {
  return `# Project Context Required

I have your organization context, but need context for this specific project.

**Say "set up project context"** to complete a quick 3-question onboarding.

<hints>
- Captures the problem, users, and success criteria for this project
- Takes ~2 minutes to complete
- Helps surface the most relevant knowledge for your task
</hints>`;
}

/**
 * Build hint text for missing context (soft warning for ask tool).
 * Returns empty string if both contexts exist.
 */
export function buildOnboardingHints(status: OnboardingStatus): string {
  const hints: string[] = [];

  if (!status.hasOrgContext) {
    hints.push('- Complete org onboarding with "set up org context" for better answers');
  }

  if (!status.hasProjectContext) {
    hints.push('- Complete project onboarding with "set up project context" for better answers');
  }

  return hints.join('\n');
}

/**
 * Build a prominent warning banner for missing context.
 * Returns empty string if both contexts exist.
 *
 * This banner is designed to appear BEFORE the answer in kai_ask responses,
 * making it impossible for copilots to ignore the missing context.
 */
export function buildOnboardingWarningBanner(status: OnboardingStatus): string {
  const warnings: string[] = [];

  if (!status.hasOrgContext) {
    warnings.push(`## ⚠️ Organization Context Missing

Your knowledge base does not have organization context set up yet.
**Say "set up org context"** to complete a quick 4-question onboarding.`);
  }

  if (!status.hasProjectContext) {
    warnings.push(`## ⚠️ Project Context Missing

${status.hasOrgContext ? 'You have organization context, but n' : 'N'}o project context exists for this directory.
**Say "set up project context"** to complete a quick 3-question onboarding.`);
  }

  if (warnings.length === 0) {
    return '';
  }

  return `${warnings.join('\n\n')}\n\n---\n\n`;
}
