/**
 * Shared utilities for @aurite-ai/kai-testing
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Find the repository root by looking for package.json with workspaces
 * or pnpm-workspace.yaml.
 */
export function findRepoRoot(): string {
  let current = process.cwd();

  while (current !== '/') {
    const packageJsonPath = path.join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.workspaces || pkg.name === 'kai') {
          return current;
        }
      } catch {
        // Continue searching
      }
    }
    // Also check for pnpm-workspace.yaml
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }

  return process.cwd();
}

/**
 * Get the path to the scenarios directory
 */
export function getScenariosDir(repoRoot: string): string {
  return path.join(repoRoot, 'packages', 'testing', 'scenarios');
}

/**
 * Get the path to the projects directory
 */
export function getProjectsDir(repoRoot: string): string {
  return path.join(repoRoot, 'projects');
}
