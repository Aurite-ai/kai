/**
 * Environment Variable Vault Provider
 *
 * Default vault provider that stores secrets as environment variables.
 * Secrets are stored in ~/.kai/.env and accessed via process.env.
 *
 * See: docs/design/secure-integrations.md
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { VaultProvider } from './types.js';

/**
 * Get the path to the Kai env file
 */
function getEnvFilePath(): string {
  return path.join(os.homedir(), '.kai', '.env');
}

/**
 * Parse an env file into a key-value map
 */
function parseEnvFile(content: string): Map<string, string> {
  const env = new Map<string, string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=VALUE (with optional quotes)
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      // Remove surrounding quotes if present
      let value = rawValue;
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env.set(key, value);
    }
  }

  return env;
}

/**
 * Serialize a key-value map to env file format
 */
function serializeEnvFile(env: Map<string, string>): string {
  const lines: string[] = [
    '# Kai Integration Secrets',
    '# This file is auto-generated. Do not edit manually.',
    '# Secrets are stored here for env var-based vault provider.',
    '',
  ];

  for (const [key, value] of env.entries()) {
    // Quote values that contain spaces or special characters
    const needsQuotes = /[\s"'$`\\]/.test(value);
    const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
    lines.push(`${key}=${formattedValue}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Convert a path to an environment variable name
 * e.g., "gmail/client_secret" -> "KAI_GMAIL_CLIENT_SECRET"
 */
function pathToEnvKey(secretPath: string): string {
  const normalized = secretPath
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `KAI_${normalized}`;
}

/**
 * Convert an environment variable name back to a path
 * e.g., "KAI_GMAIL_CLIENT_SECRET" -> "gmail/client_secret"
 */
function envKeyToPath(envKey: string): string {
  if (!envKey.startsWith('KAI_')) return envKey;
  return envKey.replace(/^KAI_/, '').toLowerCase().replace(/_/g, '/');
}

/**
 * Environment Variable Vault Provider
 *
 * Stores secrets in ~/.kai/.env and retrieves them from process.env.
 * This is the default provider when no external vault is configured.
 */
export class EnvVaultProvider implements VaultProvider {
  name = 'env' as const;

  /**
   * Check if the provider is available.
   * Env provider is always available.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Get a secret value from environment variables.
   *
   * First checks process.env, then falls back to the .env file.
   * IMPORTANT: The returned value should never be logged or stored.
   */
  async getSecret(secretPath: string): Promise<string | null> {
    const envKey = pathToEnvKey(secretPath);

    // First check process.env (already loaded environment)
    if (process.env[envKey]) {
      return process.env[envKey] ?? null;
    }

    // Fall back to reading from file
    try {
      const envPath = getEnvFilePath();
      const content = await fs.readFile(envPath, 'utf-8');
      const env = parseEnvFile(content);
      return env.get(envKey) ?? null;
    } catch {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Store a secret in the .env file.
   *
   * NOTE: This writes to ~/.kai/.env, not process.env.
   * The user/process must reload environment to pick up changes.
   */
  async setSecret(secretPath: string, value: string): Promise<void> {
    const envPath = getEnvFilePath();
    const envKey = pathToEnvKey(secretPath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(envPath), { recursive: true });

    // Read existing content
    let env = new Map<string, string>();
    try {
      const content = await fs.readFile(envPath, 'utf-8');
      env = parseEnvFile(content);
    } catch {
      // File doesn't exist yet, start fresh
    }

    // Update/add the secret
    env.set(envKey, value);

    // Write back
    await fs.writeFile(envPath, serializeEnvFile(env), 'utf-8');
  }

  /**
   * List available secrets (paths only, no values).
   */
  async listSecrets(prefix?: string): Promise<string[]> {
    const secrets: string[] = [];

    // Check process.env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('KAI_')) {
        const secretPath = envKeyToPath(key);
        if (!prefix || secretPath.startsWith(prefix)) {
          secrets.push(secretPath);
        }
      }
    }

    // Also check the .env file
    try {
      const envPath = getEnvFilePath();
      const content = await fs.readFile(envPath, 'utf-8');
      const env = parseEnvFile(content);

      for (const key of env.keys()) {
        if (key.startsWith('KAI_')) {
          const secretPath = envKeyToPath(key);
          if (!prefix || secretPath.startsWith(prefix)) {
            if (!secrets.includes(secretPath)) {
              secrets.push(secretPath);
            }
          }
        }
      }
    } catch {
      // File doesn't exist
    }

    return secrets.sort();
  }

  /**
   * Delete a secret from the .env file.
   */
  async deleteSecret(secretPath: string): Promise<void> {
    const envPath = getEnvFilePath();
    const envKey = pathToEnvKey(secretPath);

    try {
      const content = await fs.readFile(envPath, 'utf-8');
      const env = parseEnvFile(content);

      if (env.has(envKey)) {
        env.delete(envKey);
        await fs.writeFile(envPath, serializeEnvFile(env), 'utf-8');
      }
    } catch {
      // File doesn't exist, nothing to delete
    }
  }
}

/**
 * Singleton instance of the EnvVaultProvider
 */
export const envVaultProvider = new EnvVaultProvider();
