/**
 * Tests for integration storage
 */

import { existsSync, rmSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteIntegration,
  findIntegrationsBySource,
  findIntegrationsByType,
  generateIntegrationsSummaryMarkdown,
  integrationExists,
  listIntegrationIds,
  listIntegrationSummaries,
  listIntegrations,
  loadIntegration,
  mergeIntegration,
  saveIntegration,
  updateIntegrationStatus,
} from '../storage.js';
import type { IntegrationDescriptor } from '../types.js';

// Use a temp directory for tests
const TEST_DIR = join(tmpdir(), `kai-integration-test-${Date.now()}`);

// Helper to create a test integration
function createTestIntegration(
  overrides: Partial<IntegrationDescriptor> = {}
): IntegrationDescriptor {
  const now = new Date().toISOString();
  return {
    id: 'test-integration',
    displayName: 'Test Integration',
    type: 'api',
    description: 'A test integration',
    operations: [
      {
        name: 'test-operation',
        description: 'A test operation',
        params: [{ name: 'input', description: 'Input param', type: 'string', required: true }],
        returns: { type: 'object', description: 'Result' },
      },
    ],
    authentication: {
      method: 'api_key',
      requiredCredentials: ['api_key'],
      vaultRefs: { api_key: 'vault://env/test/api_key' },
    },
    examples: [],
    notes: ['Test note'],
    source: {
      learnedFrom: 'test.md',
      learnedAt: now,
      confidence: 0.8,
      extractionMethod: 'pattern',
    },
    status: 'discovered',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('integration storage', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('saveIntegration and loadIntegration', () => {
    it('saves and loads an integration', async () => {
      const integration = createTestIntegration();

      await saveIntegration(integration, TEST_DIR);
      const loaded = await loadIntegration('test-integration', TEST_DIR);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe('test-integration');
      expect(loaded?.displayName).toBe('Test Integration');
      expect(loaded?.operations).toHaveLength(1);
    });

    it('updates the updatedAt timestamp on save', async () => {
      const integration = createTestIntegration({
        updatedAt: '2020-01-01T00:00:00Z',
      });

      await saveIntegration(integration, TEST_DIR);
      const loaded = await loadIntegration('test-integration', TEST_DIR);

      expect(loaded?.updatedAt).not.toBe('2020-01-01T00:00:00Z');
    });

    it('returns null for non-existent integration', async () => {
      const loaded = await loadIntegration('does-not-exist', TEST_DIR);
      expect(loaded).toBeNull();
    });
  });

  describe('listIntegrationIds', () => {
    it('lists all integration IDs', async () => {
      await saveIntegration(createTestIntegration({ id: 'integration-1' }), TEST_DIR);
      await saveIntegration(createTestIntegration({ id: 'integration-2' }), TEST_DIR);
      await saveIntegration(createTestIntegration({ id: 'integration-3' }), TEST_DIR);

      const ids = await listIntegrationIds(TEST_DIR);

      expect(ids).toHaveLength(3);
      expect(ids).toContain('integration-1');
      expect(ids).toContain('integration-2');
      expect(ids).toContain('integration-3');
    });

    it('returns empty array for empty directory', async () => {
      const ids = await listIntegrationIds(TEST_DIR);
      expect(ids).toHaveLength(0);
    });
  });

  describe('listIntegrations', () => {
    it('lists all integrations', async () => {
      await saveIntegration(createTestIntegration({ id: 'int-1', displayName: 'First' }), TEST_DIR);
      await saveIntegration(
        createTestIntegration({ id: 'int-2', displayName: 'Second' }),
        TEST_DIR
      );

      const integrations = await listIntegrations(TEST_DIR);

      expect(integrations).toHaveLength(2);
      expect(integrations.map((i) => i.displayName)).toContain('First');
      expect(integrations.map((i) => i.displayName)).toContain('Second');
    });
  });

  describe('listIntegrationSummaries', () => {
    it('returns summaries with essential info', async () => {
      await saveIntegration(
        createTestIntegration({
          id: 'my-api',
          displayName: 'My API',
          type: 'api',
          status: 'verified',
        }),
        TEST_DIR
      );

      const summaries = await listIntegrationSummaries(TEST_DIR);

      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('my-api');
      expect(summaries[0].displayName).toBe('My API');
      expect(summaries[0].type).toBe('api');
      expect(summaries[0].operationNames).toContain('test-operation');
      expect(summaries[0].authMethod).toBe('api_key');
      expect(summaries[0].status).toBe('verified');
    });
  });

  describe('deleteIntegration', () => {
    it('deletes an existing integration', async () => {
      await saveIntegration(createTestIntegration({ id: 'to-delete' }), TEST_DIR);
      expect(integrationExists('to-delete', TEST_DIR)).toBe(true);

      const deleted = await deleteIntegration('to-delete', TEST_DIR);

      expect(deleted).toBe(true);
      expect(integrationExists('to-delete', TEST_DIR)).toBe(false);
    });

    it('returns false for non-existent integration', async () => {
      const deleted = await deleteIntegration('does-not-exist', TEST_DIR);
      expect(deleted).toBe(false);
    });
  });

  describe('integrationExists', () => {
    it('returns true for existing integration', async () => {
      await saveIntegration(createTestIntegration({ id: 'exists' }), TEST_DIR);
      expect(integrationExists('exists', TEST_DIR)).toBe(true);
    });

    it('returns false for non-existent integration', () => {
      expect(integrationExists('does-not-exist', TEST_DIR)).toBe(false);
    });
  });

  describe('updateIntegrationStatus', () => {
    it('updates the status of an integration', async () => {
      await saveIntegration(
        createTestIntegration({ id: 'status-test', status: 'discovered' }),
        TEST_DIR
      );

      const updated = await updateIntegrationStatus('status-test', 'verified', TEST_DIR);

      expect(updated).toBe(true);
      const loaded = await loadIntegration('status-test', TEST_DIR);
      expect(loaded?.status).toBe('verified');
    });

    it('returns false for non-existent integration', async () => {
      const updated = await updateIntegrationStatus('does-not-exist', 'verified', TEST_DIR);
      expect(updated).toBe(false);
    });
  });

  describe('findIntegrationsByType', () => {
    it('finds integrations by type', async () => {
      await saveIntegration(createTestIntegration({ id: 'db-1', type: 'database' }), TEST_DIR);
      await saveIntegration(createTestIntegration({ id: 'db-2', type: 'database' }), TEST_DIR);
      await saveIntegration(createTestIntegration({ id: 'api-1', type: 'api' }), TEST_DIR);

      const databases = await findIntegrationsByType('database', TEST_DIR);

      expect(databases).toHaveLength(2);
      expect(databases.every((i) => i.type === 'database')).toBe(true);
    });
  });

  describe('findIntegrationsBySource', () => {
    it('finds integrations by source file', async () => {
      await saveIntegration(
        createTestIntegration({
          id: 'from-config',
          source: {
            learnedFrom: '/path/to/config.md',
            learnedAt: new Date().toISOString(),
            confidence: 0.8,
            extractionMethod: 'pattern',
          },
        }),
        TEST_DIR
      );
      await saveIntegration(
        createTestIntegration({
          id: 'from-other',
          source: {
            learnedFrom: '/path/to/other.md',
            learnedAt: new Date().toISOString(),
            confidence: 0.8,
            extractionMethod: 'pattern',
          },
        }),
        TEST_DIR
      );

      const fromConfig = await findIntegrationsBySource('/path/to/config.md', TEST_DIR);

      expect(fromConfig).toHaveLength(1);
      expect(fromConfig[0].id).toBe('from-config');
    });
  });

  describe('mergeIntegration', () => {
    it('saves new integration if none exists', async () => {
      const integration = createTestIntegration({ id: 'new-merge' });

      const merged = await mergeIntegration(integration, TEST_DIR);

      expect(merged.id).toBe('new-merge');
      expect(integrationExists('new-merge', TEST_DIR)).toBe(true);
    });

    it('merges operations from both integrations', async () => {
      const existing = createTestIntegration({
        id: 'merge-test',
        operations: [
          {
            name: 'op-1',
            description: 'First operation',
            params: [],
            returns: { type: 'void', description: 'Nothing' },
          },
        ],
      });
      await saveIntegration(existing, TEST_DIR);

      const newOne = createTestIntegration({
        id: 'merge-test',
        operations: [
          {
            name: 'op-2',
            description: 'Second operation',
            params: [],
            returns: { type: 'void', description: 'Nothing' },
          },
        ],
      });

      const merged = await mergeIntegration(newOne, TEST_DIR);

      expect(merged.operations).toHaveLength(2);
      expect(merged.operations.map((o) => o.name)).toContain('op-1');
      expect(merged.operations.map((o) => o.name)).toContain('op-2');
    });

    it('preserves original createdAt', async () => {
      const existing = createTestIntegration({
        id: 'merge-created',
        createdAt: '2020-01-01T00:00:00Z',
      });
      await saveIntegration(existing, TEST_DIR);

      const newOne = createTestIntegration({
        id: 'merge-created',
        createdAt: '2025-01-01T00:00:00Z',
      });

      const merged = await mergeIntegration(newOne, TEST_DIR);

      expect(merged.createdAt).toBe('2020-01-01T00:00:00Z');
    });

    it('uses higher confidence', async () => {
      const existing = createTestIntegration({
        id: 'merge-confidence',
        source: {
          learnedFrom: 'a.md',
          learnedAt: new Date().toISOString(),
          confidence: 0.5,
          extractionMethod: 'pattern',
        },
      });
      await saveIntegration(existing, TEST_DIR);

      const newOne = createTestIntegration({
        id: 'merge-confidence',
        source: {
          learnedFrom: 'b.md',
          learnedAt: new Date().toISOString(),
          confidence: 0.9,
          extractionMethod: 'llm',
        },
      });

      const merged = await mergeIntegration(newOne, TEST_DIR);

      expect(merged.source.confidence).toBe(0.9);
    });

    it('merges vault refs with new taking precedence', async () => {
      const existing = createTestIntegration({
        id: 'merge-vault',
        authentication: {
          method: 'api_key',
          requiredCredentials: ['api_key', 'secret'],
          vaultRefs: {
            api_key: 'vault://env/old/api_key',
            secret: 'vault://env/old/secret',
          },
        },
      });
      await saveIntegration(existing, TEST_DIR);

      const newOne = createTestIntegration({
        id: 'merge-vault',
        authentication: {
          method: 'api_key',
          requiredCredentials: ['api_key'],
          vaultRefs: {
            api_key: 'vault://env/new/api_key',
          },
        },
      });

      const merged = await mergeIntegration(newOne, TEST_DIR);

      // New api_key takes precedence
      expect(merged.authentication.vaultRefs.api_key).toBe('vault://env/new/api_key');
      // Old secret is preserved
      expect(merged.authentication.vaultRefs.secret).toBe('vault://env/old/secret');
    });
  });

  describe('generateIntegrationsSummaryMarkdown', () => {
    it('generates markdown for empty integrations', async () => {
      const markdown = await generateIntegrationsSummaryMarkdown(TEST_DIR);

      expect(markdown).toContain('# Available Integrations');
      expect(markdown).toContain('No integrations discovered yet');
    });

    it('generates markdown with integration details', async () => {
      await saveIntegration(
        createTestIntegration({
          id: 'postgresql',
          displayName: 'PostgreSQL Database',
          type: 'database',
          description: 'Customer database',
          status: 'verified',
          operations: [
            {
              name: 'query',
              description: 'Run SQL query',
              params: [],
              returns: { type: 'array', description: 'Results' },
            },
          ],
        }),
        TEST_DIR
      );
      await saveIntegration(
        createTestIntegration({
          id: 'gmail',
          displayName: 'Gmail',
          type: 'messaging',
          description: 'Email service',
          status: 'configured',
        }),
        TEST_DIR
      );

      const markdown = await generateIntegrationsSummaryMarkdown(TEST_DIR);

      expect(markdown).toContain('PostgreSQL Database');
      expect(markdown).toContain('Gmail');
      expect(markdown).toContain('database');
      expect(markdown).toContain('messaging');
      expect(markdown).toContain('✅');
      expect(markdown).toContain('🔧');
      expect(markdown).toContain('kai_use_integration');
    });
  });
});
