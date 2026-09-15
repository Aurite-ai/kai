/**
 * create command - Set up a test project from a scenario
 *
 * Creates a project folder in `projects/` with scenario content:
 * 1. project-context.md (copilot-visible project context)
 * 2. knowledge-base/ (copilot-visible business context, if present)
 * 3. Hidden metadata for the collect command
 *
 * VCK templates (framework, copilot config, etc.) are handled
 * separately by the init tool — this command only sets up the
 * scenario-specific content that makes the test unique.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { findRepoRoot } from '../utils.js';

/**
 * Copy a directory recursively
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    return;
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copy a single file, creating parent directories as needed
 */
function copyFile(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    return;
  }
  const destDir = path.dirname(dest);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * List available scenarios from the scenarios/ directory
 */
function listAvailableScenarios(repoRoot: string): string[] {
  const scenariosDir = path.join(repoRoot, 'packages', 'testing', 'scenarios');
  if (!fs.existsSync(scenariosDir)) {
    return [];
  }

  return fs
    .readdirSync(scenariosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Execute the create command.
 *
 * Creates a project folder with scenario content (project-context.md,
 * knowledge-base/, metadata). VCK templates are applied separately
 * via the init tool.
 */
export async function createCommand(options: {
  scenario?: string;
  name?: string;
}): Promise<void> {
  console.log('');
  console.log('📦 Creating test project...');
  console.log('');

  const repoRoot = findRepoRoot();

  // Get available scenarios
  const availableScenarios = listAvailableScenarios(repoRoot);

  // Determine scenario
  let scenario = options.scenario;
  if (!scenario) {
    if (availableScenarios.length > 0) {
      scenario = availableScenarios[0];
    } else {
      console.error('❌ No scenarios available');
      console.error('   Scenarios should be in packages/testing/scenarios/');
      process.exit(1);
    }
  }

  // Validate scenario exists
  if (!availableScenarios.includes(scenario)) {
    console.error(`❌ Scenario not found: ${scenario}`);
    console.error('');
    console.error('Available scenarios:');
    for (const s of availableScenarios) {
      console.error(`  - ${s}`);
    }
    console.error('');
    process.exit(1);
  }

  // Use scenario name directly as project name (or custom name if provided)
  const projectName = options.name || scenario;

  // Define paths
  const scenariosDir = path.join(repoRoot, 'packages', 'testing', 'scenarios');
  const projectsDir = path.join(repoRoot, 'projects');
  const projectPath = path.join(projectsDir, projectName);

  // Check if project already exists
  if (fs.existsSync(projectPath)) {
    console.error(`❌ Project '${projectName}' already exists. Delete it or use a different name.`);
    process.exit(1);
  }

  console.log(`  Scenario: ${scenario}`);
  console.log(`  Project:  ${projectName}`);
  console.log('');

  // Create the project directory
  fs.mkdirSync(projectPath, { recursive: true });

  const scenarioDir = path.join(scenariosDir, scenario);

  // 1. Copy scenario project-context.md (copilot-visible project context)
  const projectContextSrc = path.join(scenarioDir, 'project-context.md');
  const projectContextDest = path.join(projectPath, 'project-context.md');
  if (fs.existsSync(projectContextSrc)) {
    console.log('  Copying scenario context...');
    copyFile(projectContextSrc, projectContextDest);
    console.log('    ✓ project-context.md');
  } else {
    console.warn(`  ⚠ Scenario project-context.md not found: ${projectContextSrc}`);
  }

  // 2. Copy scenario knowledge-base/ (copilot-visible business context)
  const knowledgeBaseSrc = path.join(scenarioDir, 'knowledge-base');
  const knowledgeBaseDest = path.join(projectPath, 'knowledge-base');
  if (fs.existsSync(knowledgeBaseSrc)) {
    console.log('  Copying knowledge base...');
    copyDirRecursive(knowledgeBaseSrc, knowledgeBaseDest);
    console.log('    ✓ knowledge-base/');
  } else {
    console.log('    (No knowledge-base for this scenario)');
  }

  // 3. Write a hidden metadata file for the collect command to use later
  const metadataPath = path.join(projectPath, '.kai-test.json');
  const metadata = {
    scenario,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  // Report success
  console.log('');
  console.log('✅ Test project created!');
  console.log('');
  console.log(`📁 projects/${projectName}/`);
  console.log('');
  console.log('Next steps:');
  console.log(
    `  1. Read the scenario prompts: packages/testing/scenarios/${scenario}/user-prompts.md`
  );
  console.log(`  2. cd projects/${projectName}`);
  console.log('  3. Open Claude Code (or your copilot) and follow the user prompts');
  console.log(`  4. When done: pnpm kai-test collect ${projectName}`);
  console.log('');
}
