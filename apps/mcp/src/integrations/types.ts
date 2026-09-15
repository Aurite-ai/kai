/**
 * Integration Descriptor Types
 *
 * These types define how Kai understands and represents any external
 * tool, API, database, or service that a user's agent might need to use.
 *
 * Key principle: Store CAPABILITIES here, store CREDENTIALS in vault.
 */

/**
 * Type of integration - helps with routing and default behaviors
 */
export type IntegrationType =
  | 'database' // PostgreSQL, MySQL, MongoDB, etc.
  | 'api' // REST APIs, GraphQL endpoints
  | 'messaging' // Slack, Discord, email services
  | 'storage' // S3, GCS, local file systems
  | 'crm' // Salesforce, HubSpot
  | 'analytics' // Mixpanel, Amplitude, Google Analytics
  | 'payment' // Stripe, PayPal
  | 'ai' // OpenAI, Anthropic, custom ML services
  | 'social' // LinkedIn, Twitter/X
  | 'developer' // GitHub, GitLab, Bitbucket
  | 'productivity' // Notion, Airtable
  | 'project_management' // Jira, Asana, Linear
  | 'custom'; // Anything else

/**
 * Authentication method - type only, not actual credentials
 */
export type AuthMethod = 'api_key' | 'oauth2' | 'basic_auth' | 'bearer_token' | 'custom' | 'none';

/**
 * Parameter definition for an operation
 */
export interface OperationParam {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: unknown;
  example?: unknown;
}

/**
 * An operation that an integration supports
 */
export interface IntegrationOperation {
  /** Operation name (kebab-case, e.g., "send-email", "query-customers") */
  name: string;

  /** Human-readable description */
  description: string;

  /** Input parameters */
  params: OperationParam[];

  /** Description of what's returned */
  returns: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'void';
    description: string;
  };

  /** Example usage for agents */
  example?: {
    params: Record<string, unknown>;
    result?: unknown;
  };
}

/**
 * Authentication configuration (types and vault references, never actual values)
 */
export interface IntegrationAuth {
  /** How this integration authenticates */
  method: AuthMethod;

  /** What credentials are needed (e.g., ['api_key'] or ['client_id', 'client_secret']) */
  requiredCredentials: string[];

  /** Vault references for each credential (e.g., { api_key: 'vault://myapi/api_key' }) */
  vaultRefs: Record<string, string>;

  /** OAuth scopes if applicable */
  scopes?: string[];
}

/**
 * Rate limits and usage constraints
 */
export interface IntegrationLimits {
  /** Rate limit description (e.g., "100 requests/minute") */
  rateLimit?: string;

  /** Other quotas or constraints */
  quotas?: string[];

  /** Maximum payload size */
  maxPayloadSize?: string;

  /** Notes about limits */
  notes?: string[];
}

/**
 * Example usage for agents
 */
export interface UsageExample {
  /** What this example demonstrates */
  description: string;

  /** The operation being used */
  operation: string;

  /** Example parameters */
  params: Record<string, unknown>;

  /** Expected result (optional) */
  expectedResult?: unknown;
}

/**
 * Source information - where this descriptor was learned from
 */
export interface IntegrationSource {
  /** File path that described this integration */
  learnedFrom: string;

  /** When it was learned */
  learnedAt: string;

  /** Project it was learned in */
  project?: string;

  /** Confidence in the extraction (0-1) */
  confidence: number;

  /** How it was extracted */
  extractionMethod: 'pattern' | 'llm' | 'manual' | '1password';
}

/**
 * Full Integration Descriptor
 *
 * This is the complete description of an external tool/service that
 * Kai has learned about. It contains everything an agent needs to
 * know to use the integration, WITHOUT any actual credentials.
 */
export interface IntegrationDescriptor {
  /** Unique identifier (kebab-case, e.g., "customer-database", "gmail-sender") */
  id: string;

  /** Human-readable name */
  displayName: string;

  /** Type of integration */
  type: IntegrationType;

  /** Brief description of what this integration does */
  description: string;

  /** Operations this integration supports */
  operations: IntegrationOperation[];

  /** Authentication configuration (types only, not values) */
  authentication: IntegrationAuth;

  /** Rate limits and constraints */
  limits?: IntegrationLimits;

  /** Example usage patterns */
  examples: UsageExample[];

  /** Important notes for agents */
  notes: string[];

  /** Where this was learned from */
  source: IntegrationSource;

  /** Status of the integration */
  status: 'discovered' | 'configured' | 'verified' | 'error';

  /** When the descriptor was created */
  createdAt: string;

  /** When the descriptor was last updated */
  updatedAt: string;
}

/**
 * Simplified integration info for surfacing to context
 */
export interface IntegrationSummary {
  id: string;
  displayName: string;
  type: IntegrationType;
  description: string;
  operationNames: string[];
  authMethod: AuthMethod;
  status: 'discovered' | 'configured' | 'verified' | 'error';
}

/**
 * Result of extracting integrations from content
 */
export interface IntegrationExtractionResult {
  /** Discovered integrations */
  integrations: IntegrationDescriptor[];

  /** Raw mentions that couldn't be fully extracted */
  mentions: IntegrationMention[];

  /** Any warnings during extraction */
  warnings: string[];
}

/**
 * A mention of an integration that couldn't be fully extracted
 */
export interface IntegrationMention {
  /** What was mentioned (e.g., "PostgreSQL", "the customer API") */
  name: string;

  /** Context around the mention */
  context: string;

  /** Why it couldn't be fully extracted */
  reason: string;

  /** Position in the original content */
  position: { start: number; end: number };
}

/**
 * Request to use an integration
 */
export interface UseIntegrationRequest {
  /** Integration ID */
  integration: string;

  /** Operation to perform */
  operation: string;

  /** Parameters for the operation */
  params: Record<string, unknown>;
}

/**
 * Result of using an integration
 */
export interface UseIntegrationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Result data (if successful) */
  data?: unknown;

  /** Error message (if failed) */
  error?: string;

  /** Metadata about the call */
  meta: {
    integration: string;
    operation: string;
    duration: number;
    timestamp: string;
  };
}
