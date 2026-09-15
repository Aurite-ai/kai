/**
 * Connector Types
 *
 * Extended types for the dynamic connector system.
 * Builds on IntegrationDescriptor to add versioning, capabilities,
 * and registry metadata for unlimited integrations.
 */

import { z } from 'zod';
import type {
  AuthMethod,
  IntegrationDescriptor,
  IntegrationOperation,
  IntegrationType,
} from '../integrations/types.js';

// =============================================================================
// CONNECTOR MANIFEST SCHEMA (Zod for validation)
// =============================================================================

/**
 * Authentication types supported by connectors
 */
export const AuthTypeSchema = z.enum([
  'none',
  'api_key',
  'bearer_token',
  'basic_auth',
  'oauth2',
  'oauth2_client_credentials',
  'custom',
]);

export type ConnectorAuthType = z.infer<typeof AuthTypeSchema>;

/**
 * Credential requirement for a connector
 */
export const CredentialSchema = z.object({
  /** Credential key name (e.g., 'api_key', 'bot_token') */
  name: z.string(),
  /** Display name for user */
  displayName: z.string().optional(),
  /** Type of credential */
  type: z.enum(['string', 'secret', 'url', 'email']).default('secret'),
  /** Whether this credential is required */
  required: z.boolean().default(true),
  /** Description of what this credential is */
  description: z.string().optional(),
  /** Suggested environment variable name */
  envVar: z.string().optional(),
  /** URL or instructions for obtaining this credential */
  obtainFrom: z.string().optional(),
  /** Example format (redacted) */
  exampleFormat: z.string().optional(),
});

export type CredentialRequirement = z.infer<typeof CredentialSchema>;

/**
 * Capability flags for a connector
 */
export const CapabilitiesSchema = z.object({
  read: z.boolean().default(true),
  write: z.boolean().default(false),
  delete: z.boolean().default(false),
  stream: z.boolean().default(false),
  webhook: z.boolean().default(false),
  batch: z.boolean().default(false),
  search: z.boolean().default(false),
  sync: z.boolean().default(false),
});

export type ConnectorCapabilities = z.infer<typeof CapabilitiesSchema>;

/**
 * HTTP configuration for an operation
 */
export const HttpConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string(),
  pathParams: z.array(z.string()).optional(),
  queryParams: z.array(z.string()).optional(),
  bodyParams: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type HttpConfig = z.infer<typeof HttpConfigSchema>;

/**
 * Operation parameter schema
 */
export const OperationParamSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
  example: z.unknown().optional(),
  in: z.enum(['path', 'query', 'body', 'header']).optional(),
});

export type OperationParam = z.infer<typeof OperationParamSchema>;

/**
 * Enhanced operation definition with HTTP details
 */
export const ConnectorOperationSchema = z.object({
  /** Operation name (kebab-case) */
  name: z.string(),
  /** Human-readable description */
  description: z.string(),
  /** HTTP configuration */
  http: HttpConfigSchema.optional(),
  /** Input parameters */
  params: z.array(OperationParamSchema).default([]),
  /** Output description */
  returns: z
    .object({
      type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'void']),
      description: z.string(),
    })
    .optional(),
  /** Is this operation idempotent? */
  idempotent: z.boolean().default(false),
  /** Can this operation be retried? */
  retryable: z.boolean().default(true),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
  /** Example usage */
  example: z
    .object({
      params: z.record(z.string(), z.unknown()),
      result: z.unknown().optional(),
    })
    .optional(),
});

export type ConnectorOperation = z.infer<typeof ConnectorOperationSchema>;

/**
 * Rate limit configuration
 */
export const RateLimitSchema = z.object({
  /** Number of requests allowed */
  requests: z.number(),
  /** Time window (e.g., "60s", "1m", "1h") */
  window: z.string(),
  /** Optional description */
  description: z.string().optional(),
});

export type RateLimitConfig = z.infer<typeof RateLimitSchema>;

/**
 * Retry policy configuration
 */
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().default(3),
  backoff: z.enum(['linear', 'exponential']).default('exponential'),
  initialDelay: z.string().default('100ms'),
  maxDelay: z.string().default('10s'),
  retryOn: z.array(z.number()).default([429, 500, 502, 503, 504]),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

/**
 * Connection configuration for a connector
 */
export const ConnectionConfigSchema = z.object({
  /** Authentication type */
  authType: AuthTypeSchema,
  /** Required credentials */
  credentials: z.array(CredentialSchema),
  /** Base URL for API calls */
  baseUrl: z.string().optional(),
  /** Whether the base URL can be configured by user */
  baseUrlConfigurable: z.boolean().default(false),
  /** Health check configuration */
  healthCheck: z
    .object({
      operation: z.string(),
      expectedStatus: z.number().default(200),
    })
    .optional(),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

/**
 * Connector metadata
 */
export const ConnectorMetadataSchema = z.object({
  /** Unique identifier (kebab-case) */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Semantic version */
  version: z.string().default('1.0.0'),
  /** Human-readable display name */
  displayName: z.string(),
  /** Brief description */
  description: z.string(),
  /** Vendor/creator */
  vendor: z.string().default('custom'),
  /** Tier: native (built-in), verified (marketplace), custom (user-defined), discovered (agent-generated) */
  tier: z.enum(['native', 'verified', 'custom', 'discovered']).default('custom'),
  /** Integration type category */
  type: z.enum([
    'database',
    'api',
    'messaging',
    'storage',
    'crm',
    'analytics',
    'payment',
    'ai',
    'social',
    'developer',
    'productivity',
    'project_management',
    'custom',
  ]),
  /** Tags for discovery */
  tags: z.array(z.string()).default([]),
  /** Icon URL */
  iconUrl: z.string().optional(),
  /** Documentation URL */
  documentationUrl: z.string().optional(),
});

export type ConnectorMetadata = z.infer<typeof ConnectorMetadataSchema>;

/**
 * Full Connector Manifest Schema
 *
 * This is the complete definition of a connector that can be:
 * - Generated by the research agent
 * - Defined by users in YAML
 * - Imported from OpenAPI specs
 * - Converted from existing IntegrationDescriptor
 */
export const ConnectorManifestSchema = z.object({
  /** API version for schema evolution */
  apiVersion: z.literal('kai.io/v1').default('kai.io/v1'),
  /** Kind identifier */
  kind: z.literal('Connector').default('Connector'),

  /** Connector metadata */
  metadata: ConnectorMetadataSchema,

  /** Connector specification */
  spec: z.object({
    /** Connection configuration */
    connection: ConnectionConfigSchema,
    /** Capability flags */
    capabilities: CapabilitiesSchema,
    /** Available operations */
    operations: z.array(ConnectorOperationSchema),
    /** Rate limit configuration */
    rateLimits: RateLimitSchema.optional(),
    /** Retry policy */
    retryPolicy: RetryPolicySchema.optional(),
  }),

  /** Source information (how this manifest was created) */
  source: z
    .object({
      /** How it was created */
      method: z.enum([
        'research-agent',
        'openapi-import',
        'yaml-definition',
        'manual',
        'migration',
      ]),
      /** Original source URL or file */
      origin: z.string().optional(),
      /** When it was created */
      createdAt: z.string(),
      /** When it was last updated */
      updatedAt: z.string(),
      /** Confidence score (0-1) for agent-generated */
      confidence: z.number().min(0).max(1).optional(),
    })
    .optional(),

  /** Status of the connector */
  status: z.enum(['draft', 'active', 'verified', 'deprecated', 'error']).default('draft'),
});

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;

// =============================================================================
// REGISTRY TYPES
// =============================================================================

/**
 * Context for registry operations (tenant-aware)
 */
export interface RegistryContext {
  /** Tenant ID (undefined = global/default) */
  tenantId?: string;
  /** User ID for audit */
  userId?: string;
}

/**
 * Installation record for a connector
 */
export interface ConnectorInstallation {
  /** The connector manifest */
  manifest: ConnectorManifest;
  /** When it was installed */
  installedAt: string;
  /** Who installed it */
  installedBy?: string;
  /** Current status */
  status: 'active' | 'paused' | 'error' | 'pending_approval';
  /** Tenant-specific configuration overrides */
  config?: Record<string, unknown>;
  /** Last health check result */
  lastHealthCheck?: {
    success: boolean;
    timestamp: string;
    message?: string;
  };
}

/**
 * Registry interface - implementations can be SQLite, PostgreSQL, etc.
 */
export interface ConnectorRegistry {
  /**
   * Resolve a connector by ID (respects tier priority)
   * Priority: custom > discovered > verified > native
   */
  resolve(connectorId: string, ctx?: RegistryContext): Promise<ConnectorManifest | null>;

  /**
   * Register a new connector manifest
   */
  register(manifest: ConnectorManifest, ctx?: RegistryContext): Promise<void>;

  /**
   * Unregister a connector
   */
  unregister(connectorId: string, ctx?: RegistryContext): Promise<boolean>;

  /**
   * Update an existing connector
   */
  update(
    connectorId: string,
    manifest: Partial<ConnectorManifest>,
    ctx?: RegistryContext
  ): Promise<void>;

  /**
   * List all connectors
   */
  list(
    ctx?: RegistryContext,
    filter?: {
      tier?: ConnectorManifest['metadata']['tier'];
      type?: ConnectorManifest['metadata']['type'];
      tags?: string[];
      status?: ConnectorManifest['status'];
    }
  ): Promise<ConnectorManifest[]>;

  /**
   * Check if a connector exists
   */
  exists(connectorId: string, ctx?: RegistryContext): Promise<boolean>;

  /**
   * Get installation record
   */
  getInstallation(
    connectorId: string,
    ctx?: RegistryContext
  ): Promise<ConnectorInstallation | null>;

  /**
   * Update connector status
   */
  updateStatus(
    connectorId: string,
    status: ConnectorManifest['status'],
    ctx?: RegistryContext
  ): Promise<void>;
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert an existing IntegrationDescriptor to ConnectorManifest
 */
export function integrationToManifest(
  integration: IntegrationDescriptor,
  tier: ConnectorManifest['metadata']['tier'] = 'native'
): ConnectorManifest {
  const now = new Date().toISOString();

  // Map auth method
  const authMethodMap: Record<AuthMethod, ConnectorAuthType> = {
    api_key: 'api_key',
    bearer_token: 'bearer_token',
    basic_auth: 'basic_auth',
    oauth2: 'oauth2',
    custom: 'custom',
    none: 'none',
  };

  // Convert credentials
  const credentials: CredentialRequirement[] = integration.authentication.requiredCredentials.map(
    (key) => ({
      name: key,
      type: 'secret' as const,
      required: true,
      envVar: integration.authentication.vaultRefs[key]
        ?.replace('vault://env/', '')
        .toUpperCase()
        .replace(/[/-]/g, '_'),
    })
  );

  // Convert operations
  const operations: ConnectorOperation[] = integration.operations.map((op) => ({
    name: op.name,
    description: op.description,
    params: op.params.map((p) => ({
      name: p.name,
      description: p.description,
      type: p.type,
      required: p.required,
      default: p.default,
      example: p.example,
    })),
    returns: op.returns,
    idempotent: false,
    retryable: true,
  }));

  // Infer capabilities from operations
  const capabilities: ConnectorCapabilities = {
    read: operations.some((op) =>
      ['query', 'get', 'list', 'read', 'fetch', 'search'].some((v) =>
        op.name.toLowerCase().includes(v)
      )
    ),
    write: operations.some((op) =>
      ['create', 'insert', 'post', 'send', 'write', 'update', 'put'].some((v) =>
        op.name.toLowerCase().includes(v)
      )
    ),
    delete: operations.some((op) => op.name.toLowerCase().includes('delete')),
    stream: false,
    webhook: false,
    batch: false,
    search: operations.some((op) => op.name.toLowerCase().includes('search')),
    sync: false,
  };

  return {
    apiVersion: 'kai.io/v1',
    kind: 'Connector',
    metadata: {
      id: integration.id,
      version: '1.0.0',
      displayName: integration.displayName,
      description: integration.description,
      vendor: tier === 'native' ? 'Kai' : 'custom',
      tier,
      type: integration.type as ConnectorManifest['metadata']['type'],
      tags: [],
    },
    spec: {
      connection: {
        authType: authMethodMap[integration.authentication.method] || 'custom',
        credentials,
        baseUrlConfigurable: false,
      },
      capabilities,
      operations,
      rateLimits: integration.limits?.rateLimit
        ? {
            requests: Number.parseInt(integration.limits.rateLimit.split('/')[0]) || 100,
            window: '1m',
          }
        : undefined,
    },
    source: {
      method: 'migration',
      origin: integration.source.learnedFrom,
      createdAt: integration.createdAt,
      updatedAt: now,
      confidence: integration.source.confidence,
    },
    status: integration.status === 'verified' ? 'verified' : 'active',
  };
}

/**
 * Convert ConnectorManifest back to IntegrationDescriptor
 * (for backwards compatibility with existing executor)
 */
export function manifestToIntegration(manifest: ConnectorManifest): IntegrationDescriptor {
  const now = new Date().toISOString();

  // Build vault refs from credentials
  const vaultRefs: Record<string, string> = {};
  for (const cred of manifest.spec.connection.credentials) {
    vaultRefs[cred.name] = cred.envVar
      ? `vault://env/${cred.envVar}`
      : `vault://env/${manifest.metadata.id}/${cred.name}`;
  }

  // Map auth type back
  const authMethodMap: Record<ConnectorAuthType, AuthMethod> = {
    api_key: 'api_key',
    bearer_token: 'bearer_token',
    basic_auth: 'basic_auth',
    oauth2: 'oauth2',
    oauth2_client_credentials: 'oauth2',
    custom: 'custom',
    none: 'none',
  };

  // Convert operations
  const operations: IntegrationOperation[] = manifest.spec.operations.map((op) => ({
    name: op.name,
    description: op.description,
    params: op.params.map((p) => ({
      name: p.name,
      description: p.description,
      type: p.type,
      required: p.required,
      default: p.default,
      example: p.example,
    })),
    returns: op.returns || { type: 'object', description: 'Operation result' },
    example: op.example,
  }));

  return {
    id: manifest.metadata.id,
    displayName: manifest.metadata.displayName,
    type: manifest.metadata.type as IntegrationType,
    description: manifest.metadata.description,
    operations,
    authentication: {
      method: authMethodMap[manifest.spec.connection.authType],
      requiredCredentials: manifest.spec.connection.credentials.map((c) => c.name),
      vaultRefs,
    },
    limits: manifest.spec.rateLimits
      ? {
          rateLimit: `${manifest.spec.rateLimits.requests}/${manifest.spec.rateLimits.window}`,
        }
      : undefined,
    examples: [],
    notes: manifest.metadata.tags,
    source: {
      learnedFrom: manifest.source?.origin || 'connector-registry',
      learnedAt: manifest.source?.createdAt || now,
      confidence: manifest.source?.confidence || 0.9,
      extractionMethod: manifest.source?.method === 'research-agent' ? 'llm' : 'manual',
    },
    status:
      manifest.status === 'verified'
        ? 'verified'
        : manifest.status === 'active'
          ? 'configured'
          : 'discovered',
    createdAt: manifest.source?.createdAt || now,
    updatedAt: manifest.source?.updatedAt || now,
  };
}
