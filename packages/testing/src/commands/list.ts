/**
 * list command - Show available scenarios and existing test projects
 *
 * Scans:
 * - packages/testing/scenarios/ for available test scenarios
 * - projects/ for existing test projects and their status
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { findRepoRoot, getProjectsDir, getScenariosDir } from '../utils.js';

/**
 * Format a scenario directory name for display.
 * Converts kebab-case to Title Case.
 * e.g., "customer-support-agent" → "Customer Support Agent"
 */
function getScenarioDescription(scenarioName: string): string {
  return scenarioName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if a project has been collected (has results/ directory)
 */
function isProjectCollected(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, 'results'));
}

/**
 * Get the creation date of a project from its metadata file or directory stat
 */
function getProjectCreatedDate(projectPath: string): string {
  // Try to read from .kai-test.json metadata
  const metadataPath = path.join(projectPath, '.kai-test.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      if (metadata.createdAt) {
        return new Date(metadata.createdAt).toISOString().split('T')[0];
      }
    } catch {
      // Fall through to stat
    }
  }

  // Fallback to directory stat
  try {
    const stat = fs.statSync(projectPath);
    return stat.birthtime.toISOString().split('T')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * Execute the list command.
 *
 * Shows available scenarios and any existing test projects.
 */
export async function listCommand(): Promise<void> {
  const repoRoot = findRepoRoot();
  const scenariosDir = getScenariosDir(repoRoot);
  const projectsDir = getProjectsDir(repoRoot);

  // List scenarios
  console.log('');
  console.log('Scenarios:');

  if (fs.existsSync(scenariosDir)) {
    const scenarios = fs
      .readdirSync(scenariosDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    if (scenarios.length === 0) {
      console.log('  (none found)');
    } else {
      // Calculate padding for alignment
      const maxLen = Math.max(...scenarios.map((s) => s.length));
      for (const scenario of scenarios) {
        const desc = getScenarioDescription(scenario);
        const padding = ' '.repeat(maxLen - scenario.length + 3);
        console.log(`  ${scenario}${padding}${desc}`);
      }
    }
  } else {
    console.log('  (scenarios directory not found)');
  }

  // List projects
  console.log('');
  console.log('Projects:');

  if (fs.existsSync(projectsDir)) {
    const projects = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    if (projects.length === 0) {
      console.log('  (none — use `kai-test create <scenario>` to create one)');
    } else {
      const maxLen = Math.max(...projects.map((p) => p.length));
      for (const project of projects) {
        const projectPath = path.join(projectsDir, project);
        const createdDate = getProjectCreatedDate(projectPath);
        const collected = isProjectCollected(projectPath);
        const status = collected ? '[collected]' : '[pending]';
        const padding = ' '.repeat(maxLen - project.length + 3);
        console.log(`  ${project}${padding}Created ${createdDate}   ${status}`);
      }
    }
  } else {
    console.log('  (none — use `kai-test create <scenario>` to create one)');
  }

  console.log('');
}
