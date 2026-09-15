/**
 * JSON File-Based Connector Registry
 *
 * Stores connector manifests as JSON files in ~/.kai/connectors/
 * This is the initial implementation; can be swapped for SQLite/PostgreSQL later.
 *
 * Directory structure:
 *   ~/.kai/connectors/
 *     ├── native/       - Built-in 26 connectors
 *     ├── discovered/   - Agent-generated connectors
 *     └── custom/       - User-defined connectors
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type ConnectorInstallation,
  type ConnectorManifest,
  ConnectorManifestSchema,
  type ConnectorRegistry,
  type RegistryContext,
} from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONNECTORS_DIR = join(homedir(), '.kai', 'connectors');

const TIER_DIRECTORIES: Record<ConnectorManifest['metadata']['tier'], string> = {
  native: 'native',
  verified: 'verified',
  custom: 'custom',
  discovered: 'discovered',
};

// Resolution priority (higher index = higher priority)
const TIER_PRIORITY: ConnectorManifest['metadata']['tier'][] = [
  'native',
  'verified',
  'discovered',
  'custom',
];

// =============================================================================
// JSON REGISTRY IMPLEMENTATION
// =============================================================================

export class JsonConnectorRegistry implements ConnectorRegistry {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_CONNECTORS_DIR;
  }

  /**
   * Ensure all tier directories exist
   */
  async ensureDirectories(): Promise<void> {
    for (const tierDir of Object.values(TIER_DIRECTORIES)) {
      const dir = join(this.baseDir, tierDir);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
  }

  /**
   * Get file path for a connector
   */
  private getConnectorPath(id: string, tier: ConnectorManifest['metadata']['tier']): string {
    const tierDir = TIER_DIRECTORIES[tier];
    return join(this.baseDir, tierDir, `${id}.json`);
  }

  /**
   * Resolve a connector by ID (respects tier priority)
   */
  async resolve(connectorId: string, _ctx?: RegistryContext): Promise<ConnectorManifest | null> {
    await this.ensureDirectories();

    // Check tiers in priority order (custom > discovered > verified > native)
    for (let i = TIER_PRIORITY.length - 1; i >= 0; i--) {
      const tier = TIER_PRIORITY[i];
      const filePath = this.getConnectorPath(connectorId, tier);

      if (existsSync(filePath)) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const parsed = JSON.parse(content);
          return ConnectorManifestSchema.parse(parsed);
        } catch {
          // Invalid file, try next tier
        }
      }
    }

    return null;
  }

  /**
   * Register a new connector manifest
   */
  async register(manifest: ConnectorManifest, _ctx?: RegistryContext): Promise<void> {
    await this.ensureDirectories();

    // Validate manifest
    const validated = ConnectorManifestSchema.parse(manifest);

    // Determine tier (default to 'custom' if not specified)
    const tier = validated.metadata.tier || 'custom';
    const filePath = this.getConnectorPath(validated.metadata.id, tier);

    // Save to file
    await writeFile(filePath, JSON.stringify(validated, null, 2), 'utf-8');
  }

  /**
   * Unregister a connector
   */
  async unregister(connectorId: string, _ctx?: RegistryContext): Promise<boolean> {
    await this.ensureDirectories();

    let deleted = false;

    // Try to delete from all tiers (in case of duplicates)
    for (const tier of TIER_PRIORITY) {
      const filePath = this.getConnectorPath(connectorId, tier);
      if (existsSync(filePath)) {
        await unlink(filePath);
        deleted = true;
      }
    }

    return deleted;
  }

  /**
   * Update an existing connector
   */
  async update(
    connectorId: string,
    updates: Partial<ConnectorManifest>,
    ctx?: RegistryContext
  ): Promise<void> {
    const existing = await this.resolve(connectorId, ctx);
    if (!existing) {
      throw new Error(`Connector "${connectorId}" not found`);
    }

    // Merge updates
    const updated: ConnectorManifest = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...(updates.metadata || {}),
      },
      spec: {
        ...existing.spec,
        ...(updates.spec || {}),
      },
      source: {
        ...existing.source,
        ...(updates.source || {}),
        updatedAt: new Date().toISOString(),
      } as ConnectorManifest['source'],
    };

    await this.register(updated, ctx);
  }

  /**
   * List all connectors
   */
  async list(
    _ctx?: RegistryContext,
    filter?: {
      tier?: ConnectorManifest['metadata']['tier'];
      type?: ConnectorManifest['metadata']['type'];
      tags?: string[];
      status?: ConnectorManifest['status'];
    }
  ): Promise<ConnectorManifest[]> {
    await this.ensureDirectories();

    const connectors: ConnectorManifest[] = [];
    const seenIds = new Set<string>();

    // Read from all tiers (or filtered tier)
    const tiersToRead = filter?.tier ? [filter.tier] : TIER_PRIORITY;

    for (const tier of tiersToRead) {
      const tierDir = join(this.baseDir, TIER_DIRECTORIES[tier]);

      if (!existsSync(tierDir)) {
        continue;
      }

      try {
        const files = await readdir(tierDir);

        for (const file of files) {
          if (!file.endsWith('.json')) {
            continue;
          }

          const filePath = join(tierDir, file);

          try {
            const content = await readFile(filePath, 'utf-8');
            const parsed = JSON.parse(content);
            const manifest = ConnectorManifestSchema.parse(parsed);

            // Skip if already seen (higher priority tier wins)
            if (seenIds.has(manifest.metadata.id)) {
              continue;
            }

            // Apply filters
            if (filter?.type && manifest.metadata.type !== filter.type) {
              continue;
            }
            if (filter?.status && manifest.status !== filter.status) {
              continue;
            }
            if (filter?.tags && filter.tags.length > 0) {
              const hasAllTags = filter.tags.every((tag) => manifest.metadata.tags.includes(tag));
              if (!hasAllTags) {
                continue;
              }
            }

            connectors.push(manifest);
            seenIds.add(manifest.metadata.id);
          } catch {
            // Invalid file, skip
          }
        }
      } catch {
        // Directory read failed, skip
      }
    }

    // Sort by display name
    return connectors.sort((a, b) => a.metadata.displayName.localeCompare(b.metadata.displayName));
  }

  /**
   * Check if a connector exists
   */
  async exists(connectorId: string, ctx?: RegistryContext): Promise<boolean> {
    const connector = await this.resolve(connectorId, ctx);
    return connector !== null;
  }

  /**
   * Get installation record (simplified for JSON registry)
   */
  async getInstallation(
    connectorId: string,
    ctx?: RegistryContext
  ): Promise<ConnectorInstallation | null> {
    const manifest = await this.resolve(connectorId, ctx);
    if (!manifest) {
      return null;
    }

    return {
      manifest,
      installedAt: manifest.source?.createdAt || new Date().toISOString(),
      status: manifest.status === 'error' ? 'error' : 'active',
    };
  }

  /**
   * Update connector status
   */
  async updateStatus(
    connectorId: string,
    status: ConnectorManifest['status'],
    ctx?: RegistryContext
  ): Promise<void> {
    await this.update(connectorId, { status }, ctx);
  }

  // =============================================================================
  // ADDITIONAL UTILITY METHODS
  // =============================================================================

  /**
   * Get connector counts by tier
   */
  async getStats(): Promise<Record<string, number>> {
    await this.ensureDirectories();

    const stats: Record<string, number> = {};

    for (const tier of TIER_PRIORITY) {
      const tierDir = join(this.baseDir, TIER_DIRECTORIES[tier]);
      if (existsSync(tierDir)) {
        try {
          const files = await readdir(tierDir);
          stats[tier] = files.filter((f) => f.endsWith('.json')).length;
        } catch {
          stats[tier] = 0;
        }
      } else {
        stats[tier] = 0;
      }
    }

    return stats;
  }

  /**
   * Import a connector from YAML (for user-defined connectors)
   */
  async importFromYaml(yamlContent: string): Promise<ConnectorManifest> {
    // Dynamic import yaml
    const yaml = await import('yaml');
    const parsed = yaml.parse(yamlContent);
    const manifest = ConnectorManifestSchema.parse(parsed);

    // Set tier to custom if not specified
    if (!manifest.metadata.tier) {
      manifest.metadata.tier = 'custom';
    }

    await this.register(manifest);
    return manifest;
  }

  /**
   * Export all connectors as a summary
   */
  async exportSummary(): Promise<string> {
    const connectors = await this.list();
    const stats = await this.getStats();

    let summary = '# Kai Connector Registry\n\n';
    summary += `Total connectors: ${connectors.length}\n\n`;
    summary += '## By Tier\n\n';

    for (const [tier, count] of Object.entries(stats)) {
      summary += `- **${tier}**: ${count}\n`;
    }

    summary += '\n## Connectors\n\n';

    // Group by type
    const byType = new Map<string, ConnectorManifest[]>();
    for (const c of connectors) {
      const type = c.metadata.type;
      const existing = byType.get(type);
      if (existing) {
        existing.push(c);
      } else {
        byType.set(type, [c]);
      }
    }

    for (const [type, typeConnectors] of byType) {
      summary += `### ${type}\n\n`;
      for (const c of typeConnectors) {
        summary += `- **${c.metadata.displayName}** (\`${c.metadata.id}\`) - ${c.metadata.description}\n`;
      }
      summary += '\n';
    }

    return summary;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let _registryInstance: JsonConnectorRegistry | null = null;

/**
 * Get the singleton registry instance
 */
export function getConnectorRegistry(baseDir?: string): JsonConnectorRegistry {
  if (!_registryInstance || baseDir) {
    _registryInstance = new JsonConnectorRegistry(baseDir);
  }
  return _registryInstance;
}

/**
 * Reset the registry instance (for testing)
 */
export function resetConnectorRegistry(): void {
  _registryInstance = null;
}
