/**
 * Integration Storage
 *
 * Stores and retrieves integration descriptors from ~/.kai/integrations/
 * Each integration is stored as a JSON file with its descriptor.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { IntegrationDescriptor, IntegrationSummary } from './types.js';

/**
 * Default path for integration storage
 */
const DEFAULT_INTEGRATIONS_DIR = join(homedir(), '.kai', 'integrations');

/**
 * Get the integrations directory path
 */
export function getIntegrationsDir(customPath?: string): string {
  return customPath ?? DEFAULT_INTEGRATIONS_DIR;
}

/**
 * Ensure the integrations directory exists
 */
export async function ensureIntegrationsDir(customPath?: string): Promise<string> {
  const dir = getIntegrationsDir(customPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get the file path for an integration
 */
function getIntegrationPath(id: string, customDir?: string): string {
  const dir = getIntegrationsDir(customDir);
  return join(dir, `${id}.json`);
}

/**
 * Save an integration descriptor
 */
export async function saveIntegration(
  integration: IntegrationDescriptor,
  customDir?: string
): Promise<void> {
  await ensureIntegrationsDir(customDir);
  const filePath = getIntegrationPath(integration.id, customDir);

  // Update the updatedAt timestamp
  const updatedIntegration: IntegrationDescriptor = {
    ...integration,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(updatedIntegration, null, 2), 'utf-8');
}

/**
 * Load an integration descriptor by ID
 */
export async function loadIntegration(
  id: string,
  customDir?: string
): Promise<IntegrationDescriptor | null> {
  const filePath = getIntegrationPath(id, customDir);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as IntegrationDescriptor;
  } catch {
    return null;
  }
}

/**
 * List all integration IDs
 */
export async function listIntegrationIds(customDir?: string): Promise<string[]> {
  const dir = getIntegrationsDir(customDir);

  if (!existsSync(dir)) {
    return [];
  }

  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * List all integrations (full descriptors)
 */
export async function listIntegrations(customDir?: string): Promise<IntegrationDescriptor[]> {
  const ids = await listIntegrationIds(customDir);
  const integrations: IntegrationDescriptor[] = [];

  for (const id of ids) {
    const integration = await loadIntegration(id, customDir);
    if (integration) {
      integrations.push(integration);
    }
  }

  return integrations;
}

/**
 * List integration summaries (lighter weight for context surfacing)
 */
export async function listIntegrationSummaries(customDir?: string): Promise<IntegrationSummary[]> {
  const integrations = await listIntegrations(customDir);

  return integrations.map((i) => ({
    id: i.id,
    displayName: i.displayName,
    type: i.type,
    description: i.description,
    operationNames: i.operations.map((op) => op.name),
    authMethod: i.authentication.method,
    status: i.status,
  }));
}

/**
 * Delete an integration
 */
export async function deleteIntegration(id: string, customDir?: string): Promise<boolean> {
  const filePath = getIntegrationPath(id, customDir);

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an integration exists
 */
export function integrationExists(id: string, customDir?: string): boolean {
  const filePath = getIntegrationPath(id, customDir);
  return existsSync(filePath);
}

/**
 * Update an integration's status
 */
export async function updateIntegrationStatus(
  id: string,
  status: IntegrationDescriptor['status'],
  customDir?: string
): Promise<boolean> {
  const integration = await loadIntegration(id, customDir);
  if (!integration) {
    return false;
  }

  integration.status = status;
  await saveIntegration(integration, customDir);
  return true;
}

/**
 * Find integrations by type
 */
export async function findIntegrationsByType(
  type: IntegrationDescriptor['type'],
  customDir?: string
): Promise<IntegrationDescriptor[]> {
  const all = await listIntegrations(customDir);
  return all.filter((i) => i.type === type);
}

/**
 * Find integrations by source file
 */
export async function findIntegrationsBySource(
  sourceFile: string,
  customDir?: string
): Promise<IntegrationDescriptor[]> {
  const all = await listIntegrations(customDir);
  return all.filter((i) => i.source.learnedFrom === sourceFile);
}

/**
 * Merge a new integration with an existing one
 *
 * Used when learning from multiple files mentions the same integration.
 * Newer information takes precedence, but we preserve operations from both.
 */
export async function mergeIntegration(
  newIntegration: IntegrationDescriptor,
  customDir?: string
): Promise<IntegrationDescriptor> {
  const existing = await loadIntegration(newIntegration.id, customDir);

  if (!existing) {
    await saveIntegration(newIntegration, customDir);
    return newIntegration;
  }

  // Merge operations (keep unique by name)
  const operationNames = new Set(existing.operations.map((op) => op.name));
  const mergedOperations = [...existing.operations];
  for (const op of newIntegration.operations) {
    if (!operationNames.has(op.name)) {
      mergedOperations.push(op);
    }
  }

  // Merge examples
  const mergedExamples = [...existing.examples, ...newIntegration.examples];

  // Merge notes (keep unique)
  const noteSet = new Set([...existing.notes, ...newIntegration.notes]);

  // Merge vault refs (new takes precedence)
  const mergedVaultRefs = {
    ...existing.authentication.vaultRefs,
    ...newIntegration.authentication.vaultRefs,
  };

  // Use higher confidence
  const confidence = Math.max(existing.source.confidence, newIntegration.source.confidence);

  const merged: IntegrationDescriptor = {
    ...existing,
    ...newIntegration,
    operations: mergedOperations,
    examples: mergedExamples,
    notes: Array.from(noteSet),
    authentication: {
      ...existing.authentication,
      ...newIntegration.authentication,
      vaultRefs: mergedVaultRefs,
    },
    source: {
      ...newIntegration.source,
      confidence,
    },
    // Preserve original creation time
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await saveIntegration(merged, customDir);
  return merged;
}

/**
 * Generate markdown summary of integrations
 *
 * Used for surfacing to project context.
 *
 * @param integrationsOrDir - Either a pre-filtered array of integrations, or a custom directory path
 */
export async function generateIntegrationsSummaryMarkdown(
  integrationsOrDir?: IntegrationDescriptor[] | string
): Promise<string> {
  // If it's an array, use it directly; otherwise treat as customDir and fetch all
  const integrations = Array.isArray(integrationsOrDir)
    ? integrationsOrDir
    : await listIntegrations(integrationsOrDir);

  if (integrations.length === 0) {
    return `# Available Integrations

*No integrations discovered yet.*

To add integrations, use \`kai_learn\` on files that describe your external services, APIs, or databases.
`;
  }

  // Group by type
  const byType = new Map<string, IntegrationDescriptor[]>();
  for (const integration of integrations) {
    const group = byType.get(integration.type) ?? [];
    group.push(integration);
    byType.set(integration.type, group);
  }

  let markdown = `# Available Integrations

*Auto-generated by Kai. Do not edit.*

## Summary

| Name | Type | Operations | Auth | Status |
|------|------|------------|------|--------|
`;

  for (const integration of integrations) {
    const ops = integration.operations.map((op) => op.name).join(', ');
    const statusIcon =
      integration.status === 'verified' ? '✅' : integration.status === 'configured' ? '🔧' : '🔍';
    markdown += `| ${integration.displayName} | ${integration.type} | ${ops} | ${integration.authentication.method} | ${statusIcon} ${integration.status} |\n`;
  }

  markdown += `
## Integration Details

`;

  // Add details for each type
  for (const [type, typeIntegrations] of byType) {
    markdown += `### ${type.charAt(0).toUpperCase() + type.slice(1)}

`;
    for (const integration of typeIntegrations) {
      markdown += `#### ${integration.displayName}

${integration.description}

**Operations:**
`;
      for (const op of integration.operations) {
        markdown += `- \`${op.name}\`: ${op.description}\n`;
      }

      if (integration.notes.length > 0) {
        markdown += `
**Notes:**
`;
        for (const note of integration.notes) {
          markdown += `- ${note}\n`;
        }
      }

      markdown += '\n';
    }
  }

  markdown += `
## Usage

Use \`kai_use_integration\` to interact with these services:

\`\`\`python
# Example: Query a database
result = kai_use_integration(
    integration="postgresql",
    operation="query",
    params={"sql": "SELECT * FROM customers WHERE status='active'"}
)

# Example: Send an email
kai_use_integration(
    integration="gmail",
    operation="send-email",
    params={"to": "user@example.com", "subject": "Hello", "body": "..."}
)
\`\`\`

Credentials are automatically resolved from your configured vault.
**Never hardcode credentials** - always use the integration tools.

---
*Generated by Kai | Last updated: ${new Date().toISOString()}*
`;

  return markdown;
}
