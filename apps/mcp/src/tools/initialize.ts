/**
 * Initialize Tool - Deploy copilot configuration and run adaptive onboarding
 *
 * This tool writes the Claude Code copilot configuration from the templates
 * to the directory where the user is running Claude Code, seeds the knowledge
 * base with starter content, and returns onboarding instructions based on
 * whether org/user context already exists.
 *
 * Design refs:
 * - docs/design/tool-specifications.md (Section 1: kai_initialize)
 * - docs/internal/designs/user-interaction-model.md (Section 3: Initialize Response Format)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getKnowledgeDir as resolveKnowledgeDir } from '../kai-home.js';
import { getClaudeCodeFiles, getKnowledgeBaseFiles } from '../templates/index.js';
import { type MCPToolResponse, type ToolContext, markdownResponse } from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum file size (bytes) to consider a context file as "present".
 * Files smaller than this are treated as empty/corrupted.
 */
const MIN_CONTEXT_FILE_SIZE = 50;

// =============================================================================
// ONBOARDING INSTRUCTION TEMPLATES
// =============================================================================

/**
 * Full onboarding instructions when neither org nor user context exists.
 * This guides the copilot through the complete onboarding flow.
 */
const FULL_ONBOARDING_INSTRUCTIONS = `---

## What Makes Context Useful

Context helps Kai give better recommendations when you start a task.

**Useful context passes this test:** "If the user later says 'help me build X', would this information change what patterns, constraints, or knowledge apply?"

- **Domain/industry** → Different compliance rules, patterns
- **Technical constraints** → Affects implementation choices
- **Scale** → Solo vs. team affects complexity needs
- **Explicit preferences** → "We always use X framework"

**If the answer wouldn't change recommendations, don't collect it.**

---

## Onboarding Process

### Phase 1: Situational Assessment

Ask the user:

> "Tell me a bit about yourself and what brings you to Kai."
> "What are you working on? Are you solo or part of a team?"

Listen for:
- Domain/industry
- Scale (solo, team, organization)
- Goals (what they're building)
- Any mentioned constraints

### Phase 2: Document Discovery

Ask:

> "Do you have any existing documentation I should learn from? README, specs, company wiki, anything relevant?"

If they have documents:
1. **READ the files** to understand their content
2. Note what context they provide
3. Note what's still unclear or missing
4. Call \`kai_learn(paths=[...], description="...")\` to store them in the knowledge base

**The copilot decides** what to do with discovered documents. Generally:
- Call \`kai_learn\` for files that should be stored in the knowledge base for future reference
- Extract key information for \`kai_provide_context\` (org/user context synthesis)
- Both are often appropriate - files go to KB, synthesized context goes to context files

If no documents, proceed to Phase 3.

### Phase 3: Targeted Follow-ups

Based on Phases 1-2, ask follow-up questions **only if the answer would change recommendations**.

**Examples of useful follow-ups:**
- Domain mentioned but unclear → "What industry or domain does this work fall under?"
- Technical work mentioned → "Any specific tech stack or platforms I should know about?"
- Constraints hinted at → "You mentioned [X] - is that a hard constraint?"

**Questions to AVOID:**
- "What are your team members' names?" (Not useful for recommendations)
- "What's your company's history?" (Not actionable)
- "What's your budget?" (Not relevant to knowledge surfacing)

### Phase 4: Store Context

Synthesize everything into context documents:

**Organization context** (stable, spans projects):
\`\`\`
kai_provide_context(
  type: "org",
  content: "# Organization Context\\n\\n[Domain, constraints, patterns that apply across projects]"
)
\`\`\`

**User context** (personal preferences, working style):
\`\`\`
kai_provide_context(
  type: "user",
  content: "# User Context\\n\\n[Individual preferences, experience level, how they like to work]"
)
\`\`\`

### Phase 5: Complete

Tell the user:

> "Onboarding complete! Please restart Claude Code (Ctrl+C and run \`claude\` again) to apply the new rules."

<hints>
- Be conversational, not interrogative
- Read files before learning to understand what's in them
- Only ask questions that would change recommendations
- Don't need to collect everything - context grows over time
</hints>`;

/**
 * User-only onboarding instructions when org context exists but user context doesn't.
 */
const USER_ONLY_ONBOARDING_INSTRUCTIONS = `---

## User Context Needed

I found your organization context, but need to set up your personal preferences.

### What to Collect

Ask the user about themselves:

> "Tell me a bit about yourself - your role, experience level, and how you like to work."

Listen for:
- Role and responsibilities
- Experience level and expertise areas
- Communication preferences (detailed vs. brief)
- Working patterns (TDD, documentation-first, etc.)

### Store User Context

Synthesize into user context:

\`\`\`
kai_provide_context(
  type: "user",
  content: "# User Context\\n\\n[Individual preferences, experience level, how they like to work]"
)
\`\`\`

### Complete

Tell the user:

> "Onboarding complete! Please restart Claude Code (Ctrl+C and run \`claude\` again) to apply the new rules."

<hints>
- Keep it brief - org context already captures the organization
- Focus on personal working style and preferences
- One or two questions is usually enough
</hints>`;

/**
 * Response when both contexts exist - no onboarding needed.
 */
const NO_ONBOARDING_RESPONSE = `Your organization and user context are already set up.

**Next step:** Restart Claude Code (Ctrl+C and run \`claude\` again) to apply the rules.

<hints>
- After restart, rules will be loaded automatically
- Use \`kai_prepare_context\` to get relevant knowledge for tasks
- Use \`kai_learn\` to add new documents to the knowledge base
</hints>`;

// =============================================================================
// TOOL DEFINITION
// =============================================================================

/**
 * Tool definition for MCP registration.
 */
export const initializeToolDefinition = {
  name: 'kai_initialize',
  description: `Deploy agent-dev rules and optionally run onboarding to collect org/user context.

USE THIS TOOL WHEN:
- User says "set up Kai", "initialize", "get started with Kai"
- Starting to use Kai in a new project
- User wants to configure their copilot with Kai integration

This tool does TWO things:
1. Deploys agent-dev rules to .claude/ in the project directory
2. Returns onboarding instructions if org/user context doesn't exist yet

<examples>
### Basic initialization
kai_initialize(targetPath="/path/to/project")

### With overwrite
kai_initialize(targetPath="/path/to/project", overwrite=true)
</examples>

<hints>
- targetPath is required - the directory to initialize
- After initialization, follow the onboarding instructions in the response
- Restart Claude Code after onboarding to apply the deployed rules
</hints>`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      targetPath: {
        type: 'string',
        description: 'Target directory to initialize',
      },
      overwrite: {
        type: 'boolean',
        description: 'Whether to overwrite existing files (defaults to false)',
      },
    },
    required: ['targetPath'],
  },
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input type for the initialize tool.
 */
interface InitializeToolInput {
  targetPath: string;
  overwrite?: boolean;
}

/**
 * Result of checking context file existence.
 */
interface ContextStatus {
  hasOrgContext: boolean;
  hasUserContext: boolean;
}

// =============================================================================
// CONTEXT DETECTION (Phase 3)
// =============================================================================

/**
 * Get the knowledge base directory path.
 * Uses KAI_KNOWLEDGE_DIR (or legacy KAHUNA_KNOWLEDGE_DIR) if set, otherwise ~/.kai/knowledge/
 */
function getKnowledgeBaseDir(): string {
  return resolveKnowledgeDir();
}

/**
 * Check if a context file exists and is valid (> MIN_CONTEXT_FILE_SIZE bytes).
 *
 * @param type - 'org' or 'user'
 * @returns true if the file exists and is large enough to be considered valid
 */
async function checkContextFileExists(type: 'org' | 'user'): Promise<boolean> {
  const filename = type === 'org' ? 'org-context.mdc' : 'user-context.mdc';
  const filePath = path.join(getKnowledgeBaseDir(), filename);

  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > MIN_CONTEXT_FILE_SIZE;
  } catch {
    // File doesn't exist or can't be accessed
    return false;
  }
}

/**
 * Check the status of both context files.
 *
 * @returns ContextStatus indicating which context files exist
 */
async function checkContextStatus(): Promise<ContextStatus> {
  const [hasOrgContext, hasUserContext] = await Promise.all([
    checkContextFileExists('org'),
    checkContextFileExists('user'),
  ]);

  return { hasOrgContext, hasUserContext };
}

// =============================================================================
// FILE UTILITIES
// =============================================================================

/**
 * Check if a path exists (async replacement for fs.existsSync).
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
 * Write a file from template content.
 * Creates parent directories if needed.
 */
async function writeTemplateFile(
  targetPath: string,
  content: string,
  overwrite: boolean,
  copiedFiles: string[],
  skippedFiles: string[]
): Promise<void> {
  if ((await pathExists(targetPath)) && !overwrite) {
    skippedFiles.push(targetPath);
  } else {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf-8');
    copiedFiles.push(targetPath);
  }
}

/**
 * Seed the knowledge base with .mdc files from templates.
 *
 * @returns Object with arrays of seeded and skipped file names
 */
async function seedKnowledgeBase(
  overwrite: boolean
): Promise<{ seeded: string[]; skipped: string[]; kbDir: string }> {
  const seeded: string[] = [];
  const skipped: string[] = [];

  const kbDir = getKnowledgeBaseDir();
  const kbFiles = await getKnowledgeBaseFiles();

  // Create KB directory if it doesn't exist
  if (!(await pathExists(kbDir))) {
    await fs.mkdir(kbDir, { recursive: true });
  }

  for (const file of kbFiles) {
    const targetPath = path.join(kbDir, file.path);

    if ((await pathExists(targetPath)) && !overwrite) {
      skipped.push(file.path);
    } else {
      await fs.writeFile(targetPath, file.content, 'utf-8');
      seeded.push(file.path);
    }
  }

  return { seeded, skipped, kbDir };
}

// =============================================================================
// RESPONSE BUILDING (Phase 4)
// =============================================================================

/**
 * Build the onboarding section of the response based on context status.
 */
function buildOnboardingSection(contextStatus: ContextStatus): string {
  if (contextStatus.hasOrgContext && contextStatus.hasUserContext) {
    // Both contexts exist - no onboarding needed
    return NO_ONBOARDING_RESPONSE;
  }

  if (contextStatus.hasOrgContext && !contextStatus.hasUserContext) {
    // Org exists but user doesn't - partial onboarding
    return `**Complete user onboarding before restarting.**${USER_ONLY_ONBOARDING_INSTRUCTIONS}`;
  }

  // Neither exists (or only user exists, which is unusual) - full onboarding
  return `**Complete onboarding before restarting.**${FULL_ONBOARDING_INSTRUCTIONS}`;
}

// =============================================================================
// TOOL HANDLER
// =============================================================================

/**
 * Handle the kai_initialize tool call.
 */
export async function initializeToolHandler(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<MCPToolResponse> {
  const input = args as unknown as InitializeToolInput;
  const targetPath = input.targetPath;
  const overwrite = input.overwrite ?? false;

  try {
    // Resolve target path to absolute
    const absoluteTargetPath = path.resolve(targetPath);

    // Verify target directory exists
    if (!(await pathExists(absoluteTargetPath))) {
      return markdownResponse(
        `Target directory does not exist: ${absoluteTargetPath}\n\n<hints>\n- Create the directory first or provide a valid path\n</hints>`,
        true
      );
    }

    // Verify target is a directory
    const targetStat = await fs.stat(absoluteTargetPath);
    if (!targetStat.isDirectory()) {
      return markdownResponse(`Target path is not a directory: ${absoluteTargetPath}`, true);
    }

    // Track copied and skipped files
    const copiedFiles: string[] = [];
    const skippedFiles: string[] = [];

    // Get Claude Code templates (async)
    const claudeCodeFiles = await getClaudeCodeFiles();

    // Write all template files
    for (const file of claudeCodeFiles) {
      const filePath = path.join(absoluteTargetPath, file.path);
      await writeTemplateFile(filePath, file.content, overwrite, copiedFiles, skippedFiles);
    }

    // Create empty directories for context and plans
    const emptyDirs = [
      path.join(absoluteTargetPath, '.claude', 'context'),
      path.join(absoluteTargetPath, '.claude', 'plans'),
    ];
    for (const dir of emptyDirs) {
      if (!(await pathExists(dir))) {
        await fs.mkdir(dir, { recursive: true });
      }
    }

    // Seed knowledge base
    const seedResult = await seedKnowledgeBase(overwrite);

    // Check context status for adaptive onboarding (Phase 3)
    const contextStatus = await checkContextStatus();

    // Build markdown response
    const copiedRelative = copiedFiles.map((f) => path.relative(absoluteTargetPath, f));
    const skippedRelative = skippedFiles.map((f) => path.relative(absoluteTargetPath, f));

    let markdown = `# Kai Configured

Rules deployed to \`.claude/\` in: \`${absoluteTargetPath}\`

## Copilot Configuration

**Files copied:** ${copiedFiles.length}`;

    if (skippedFiles.length > 0) {
      markdown += `\n**Files skipped (already exist):** ${skippedFiles.length}`;
      markdown += `\n\nSkipped files:\n${skippedRelative.map((f) => `- ${f}`).join('\n')}`;
    }

    if (copiedFiles.length > 0) {
      markdown += `\n\nCopied files:\n${copiedRelative.map((f) => `- ${f}`).join('\n')}`;
    }

    // Knowledge Base section
    markdown += `\n\n## Knowledge Base

**KB directory:** \`${seedResult.kbDir}\`
**Files seeded:** ${seedResult.seeded.length}`;

    if (seedResult.skipped.length > 0) {
      markdown += `\n**Files skipped (already exist):** ${seedResult.skipped.length}`;
      markdown += `\n\nSkipped seed files:\n${seedResult.skipped.map((f) => `- ${f}`).join('\n')}`;
    }

    if (seedResult.seeded.length > 0) {
      markdown += `\n\nSeeded files:\n${seedResult.seeded.map((f) => `- ${f}`).join('\n')}`;
    }

    // Onboarding section - adaptive based on context status (Phase 4)
    markdown += '\n\n## Next Steps\n\n';
    markdown += buildOnboardingSection(contextStatus);

    return markdownResponse(markdown);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return markdownResponse(
      `Failed to initialize: ${errorMessage}\n\n<hints>\n- Check that the target path is accessible\n</hints>`,
      true
    );
  }
}

/**
 * Export the tool definition and handler together.
 */
export const initializeTool = {
  definition: initializeToolDefinition,
  handler: initializeToolHandler,
};

// =============================================================================
// EXPORTED UTILITIES (for testing)
// =============================================================================

export { checkContextFileExists, checkContextStatus, MIN_CONTEXT_FILE_SIZE };
