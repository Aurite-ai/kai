/**
 * collect command - Gather results from a completed test project
 *
 * After the copilot session ends, this command:
 * 1. Creates a results/ directory inside the project
 * 2. Generates metadata.json with run information
 * 3. Captures conversation logs from .claude/ (if present)
 * 4. Snapshots built artifacts (src/ and any new files)
 * 5. Copies the evaluation template from the scenario
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestMetadata } from '../types.js';
import { findRepoRoot, getProjectsDir, getScenariosDir } from '../utils.js';

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
      // Skip directories we don't want to snapshot
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '__pycache__' ||
        entry.name === '.venv' ||
        entry.name === 'results'
      ) {
        continue;
      }
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Find conversation log files from Claude Code's .claude/ directory.
 *
 * Claude Code stores conversation data in the project's .claude/ directory.
 * We look for JSONL conversation files.
 */
function findConversationLogs(projectPath: string): string[] {
  const claudeDir = path.join(projectPath, '.claude');
  if (!fs.existsSync(claudeDir)) {
    return [];
  }

  const logs: string[] = [];

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (
        entry.name.endsWith('.jsonl') ||
        entry.name.endsWith('.json') ||
        entry.name.includes('conversation') ||
        entry.name.includes('messages')
      ) {
        logs.push(fullPath);
      }
    }
  }

  walkDir(claudeDir);
  return logs;
}

/**
 * Detect which scenario a project was created from.
 *
 * Reads the hidden .kai-test.json metadata file that
 * the create command writes.
 */
function detectScenario(projectPath: string): {
  scenario: string;
  createdAt: string;
} {
  const metadataPath = path.join(projectPath, '.kai-test.json');

  if (fs.existsSync(metadataPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      return {
        scenario: data.scenario || 'unknown',
        createdAt: data.createdAt || new Date().toISOString(),
      };
    } catch {
      // Fall through
    }
  }

  // If no metadata, use project folder name as scenario name
  const projectName = path.basename(projectPath);

  return {
    scenario: projectName,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Execute the collect command.
 *
 * Gathers conversation logs, built artifacts, and evaluation template
 * into a results/ directory inside the project folder.
 */
export async function collectCommand(options: {
  project: string;
  tester: string;
}): Promise<void> {
  console.log('');
  console.log('📋 Collecting test results...');
  console.log('');

  const repoRoot = findRepoRoot();
  const projectsDir = getProjectsDir(repoRoot);
  const projectPath = path.join(projectsDir, options.project);

  // Validate project exists
  if (!fs.existsSync(projectPath)) {
    console.error(`❌ Project not found: projects/${options.project}`);
    console.error('');
    console.error('Use `kai-test list` to see available projects.');
    process.exit(1);
  }

  // Check if already collected
  const resultsDir = path.join(projectPath, 'results');
  if (fs.existsSync(resultsDir)) {
    console.error(`⚠ Results already collected for: ${options.project}`);
    console.error(`  Results at: projects/${options.project}/results/`);
    console.error('');
    console.error('  To re-collect, delete the results/ directory first.');
    process.exit(1);
  }

  // Detect project metadata
  const projectInfo = detectScenario(projectPath);

  console.log(`  Project:   ${options.project}`);
  console.log(`  Scenario:  ${projectInfo.scenario}`);
  console.log(`  Tester:    ${options.tester}`);
  console.log('');

  // Create results directory
  fs.mkdirSync(resultsDir, { recursive: true });

  // 1. Generate metadata.json
  console.log('  Writing metadata...');
  const metadata: TestMetadata = {
    scenario: projectInfo.scenario,
    tester: options.tester,
    createdAt: projectInfo.createdAt,
    collectedAt: new Date().toISOString(),
    projectPath: `projects/${options.project}`,
  };
  fs.writeFileSync(path.join(resultsDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  console.log('    ✓ metadata.json');

  // 2. Capture conversation logs from .claude/
  console.log('  Looking for conversation logs...');
  const conversationLogs = findConversationLogs(projectPath);

  if (conversationLogs.length > 0) {
    // Copy all conversation-related files into results/
    for (const logFile of conversationLogs) {
      const relativePath = path.relative(projectPath, logFile);
      const destPath = path.join(resultsDir, relativePath);
      const destDir = path.dirname(destPath);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(logFile, destPath);
    }
    console.log(`    ✓ ${conversationLogs.length} conversation log(s)`);
  } else {
    console.log('    (no conversation logs found in .claude/)');
  }

  // 3. Snapshot built artifacts
  console.log('  Snapshotting built artifacts...');
  const artifactsDir = path.join(resultsDir, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });

  // Copy src/ directory (where the copilot builds code)
  const srcDir = path.join(projectPath, 'src');
  if (fs.existsSync(srcDir)) {
    copyDirRecursive(srcDir, path.join(artifactsDir, 'src'));
    console.log('    ✓ src/');
  }

  // Copy any Python files in root (main.py, etc.)
  const rootFiles = fs.readdirSync(projectPath, { withFileTypes: true });
  let copiedRootFiles = 0;
  for (const entry of rootFiles) {
    if (
      entry.isFile() &&
      (entry.name.endsWith('.py') || entry.name.endsWith('.toml') || entry.name.endsWith('.cfg'))
    ) {
      // Skip the hidden metadata file
      if (entry.name.startsWith('.')) continue;
      fs.copyFileSync(path.join(projectPath, entry.name), path.join(artifactsDir, entry.name));
      copiedRootFiles++;
    }
  }
  if (copiedRootFiles > 0) {
    console.log(`    ✓ ${copiedRootFiles} root file(s) (*.py, *.toml, etc.)`);
  }

  // Copy tests/ if present
  const testsDir = path.join(projectPath, 'tests');
  if (fs.existsSync(testsDir)) {
    copyDirRecursive(testsDir, path.join(artifactsDir, 'tests'));
    console.log('    ✓ tests/');
  }

  // Copy docs/ if present (copilot-generated docs)
  const docsDir = path.join(projectPath, 'docs');
  if (fs.existsSync(docsDir)) {
    copyDirRecursive(docsDir, path.join(artifactsDir, 'docs'));
    console.log('    ✓ docs/');
  }

  // 4. Copy evaluation template
  console.log('  Setting up evaluation...');
  const scenariosDir = getScenariosDir(repoRoot);
  const evalSrc = path.join(scenariosDir, projectInfo.scenario, 'evaluation-criteria.md');

  if (fs.existsSync(evalSrc)) {
    // Read the evaluation criteria and prepend a header for the evaluator
    const evalContent = fs.readFileSync(evalSrc, 'utf-8');
    const evalHeader = `<!--
  EVALUATION TEMPLATE

  Fill in scores and notes below based on the copilot's performance.
  See the rubric in each section for scoring guidance.

  Project: ${options.project}
  Scenario: ${projectInfo.scenario}
  Tester: ${options.tester}
  Date: ${new Date().toISOString().split('T')[0]}
-->

`;
    fs.writeFileSync(path.join(resultsDir, 'evaluation.md'), evalHeader + evalContent);
    console.log('    ✓ evaluation.md (template from scenario)');
  } else {
    console.log('    ⚠ No evaluation criteria found for this scenario');
  }

  // Report success
  console.log('');
  console.log('✅ Results collected!');
  console.log('');
  console.log(`📁 projects/${options.project}/results/`);

  // List what was created
  const resultFiles = fs.readdirSync(resultsDir, { withFileTypes: true });
  for (const entry of resultFiles) {
    const suffix = entry.isDirectory() ? '/' : '';
    console.log(`   ${entry.name}${suffix}`);
  }

  console.log('');
  console.log('Next steps:');
  console.log(`  1. Open projects/${options.project}/results/evaluation.md`);
  console.log('  2. Score the copilot using the rubric');
  console.log('  3. Add notes on strengths and weaknesses');
  console.log('');
}
