/**
 * Kai Home Directory & Environment Resolution
 *
 * Kai was previously named "Kahuna". Existing installs keep their data in
 * ~/.kahuna and their config in KAHUNA_* env vars, so both are still honored:
 * - ~/.kai is used when it exists (or when neither exists)
 * - ~/.kahuna is used when only it exists
 * - KAI_* env vars take precedence over their KAHUNA_* equivalents
 */

import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const KAI_DIR_NAME = '.kai';
export const LEGACY_DIR_NAME = '.kahuna';
export const ENV_PREFIX = 'KAI_';
export const LEGACY_ENV_PREFIX = 'KAHUNA_';

let warnedLegacyHome = false;

/**
 * Get the Kai home directory (~/.kai, or legacy ~/.kahuna if only it exists).
 */
export function getKaiHomeDir(): string {
  const home = os.homedir();
  const kaiDir = path.join(home, KAI_DIR_NAME);
  const legacyDir = path.join(home, LEGACY_DIR_NAME);

  if (!existsSync(kaiDir) && existsSync(legacyDir)) {
    if (!warnedLegacyHome) {
      warnedLegacyHome = true;
      console.error(
        `[kai] Using legacy data directory ${legacyDir}. Rename it to ${kaiDir} to complete the migration.`
      );
    }
    return legacyDir;
  }

  return kaiDir;
}

/**
 * Convert a KAI_* env var name to its legacy KAHUNA_* name.
 */
export function toLegacyEnvName(name: string): string {
  return name.startsWith(ENV_PREFIX) ? LEGACY_ENV_PREFIX + name.slice(ENV_PREFIX.length) : name;
}

/**
 * Read a KAI_* env var, falling back to its legacy KAHUNA_* name.
 */
export function readEnv(name: string): string | undefined {
  return process.env[name] ?? process.env[toLegacyEnvName(name)];
}

/**
 * Get the knowledge base directory.
 * Uses KAI_KNOWLEDGE_DIR if set, otherwise <kai home>/knowledge.
 */
export function getKnowledgeDir(): string {
  return readEnv('KAI_KNOWLEDGE_DIR') || path.join(getKaiHomeDir(), 'knowledge');
}
