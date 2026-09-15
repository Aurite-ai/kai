/**
 * Vault types for secure credential management
 *
 * Provides types and interfaces for vault providers that store
 * sensitive integration credentials securely.
 *
 * See: docs/design/secure-integrations.md
 */

import { join } from 'node:path';
import { ENV_PREFIX, getKaiHomeDir } from '../kai-home.js';

/**
 * Supported vault providers
 */
export type VaultProviderType = 'env' | '1password' | 'hashicorp' | 'aws' | 'gcp';

/**
 * Secret reference format: vault://[provider]/[path]
 * Examples:
 *   vault://env/GMAIL_API_KEY
 *   vault://1password/kai/gmail-oauth
 *   vault://hashicorp/secret/integrations/gmail
 */
export interface SecretReference {
  provider: VaultProviderType;
  path: string;
}

/**
 * Parse a vault:// URI into a SecretReference
 */
export function parseVaultReference(uri: string): SecretReference | null {
  const match = uri.match(/^vault:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const [, provider, path] = match;
  if (!isValidProvider(provider)) return null;

  return { provider, path };
}

/**
 * Create a vault:// URI from a SecretReference
 */
export function formatVaultReference(ref: SecretReference): string {
  return `vault://${ref.provider}/${ref.path}`;
}

/**
 * Check if a string is a valid vault provider type
 */
export function isValidProvider(provider: string): provider is VaultProviderType {
  return ['env', '1password', 'hashicorp', 'aws', 'gcp'].includes(provider);
}

/**
 * Check if a value is a vault reference object
 */
export function isVaultReference(value: unknown): value is { $ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$ref' in value &&
    typeof (value as { $ref: unknown }).$ref === 'string' &&
    (value as { $ref: string }).$ref.startsWith('vault://')
  );
}

/**
 * Vault provider interface
 *
 * Implementations handle secure storage and retrieval of secrets
 * from different backend systems.
 */
export interface VaultProvider {
  /** Provider name */
  name: VaultProviderType;

  /** Check if provider is available and configured */
  isAvailable(): Promise<boolean>;

  /**
   * Get a secret value.
   * IMPORTANT: The returned value should never be logged or stored.
   */
  getSecret(path: string): Promise<string | null>;

  /**
   * Store a secret.
   * Used during initial setup when extracting secrets from files.
   */
  setSecret(path: string, value: string): Promise<void>;

  /** List available secrets (paths only, no values) */
  listSecrets(prefix?: string): Promise<string[]>;

  /** Delete a secret */
  deleteSecret(path: string): Promise<void>;
}

/**
 * Vault configuration
 */
export interface VaultConfig {
  defaultProvider: VaultProviderType;
  fallbackProviders: VaultProviderType[];
  providerConfig: {
    env?: {
      filePath: string;
      prefix: string;
    };
    '1password'?: {
      vaultName: string;
      autoCreateItems: boolean;
    };
    hashicorp?: {
      addr: string;
      mountPath: string;
    };
  };
}

/**
 * Default vault configuration
 */
export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  defaultProvider: 'env',
  fallbackProviders: [],
  providerConfig: {
    env: {
      filePath: join(getKaiHomeDir(), '.env'),
      prefix: ENV_PREFIX,
    },
  },
};

/**
 * Vault operation result
 */
export interface VaultOperationResult {
  success: boolean;
  provider: VaultProviderType;
  path: string;
  error?: string;
}

/**
 * Audit log entry for vault operations
 */
export interface VaultAuditEntry {
  timestamp: string;
  action: 'secret_stored' | 'secret_retrieved' | 'secret_deleted' | 'secret_listed';
  service?: string;
  path: string;
  provider: VaultProviderType;
  sourceFile?: string;
}
