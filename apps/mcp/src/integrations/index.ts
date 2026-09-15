/**
 * Integrations Module
 *
 * Discovers, stores, and manages integration descriptors for external tools,
 * APIs, databases, and services.
 *
 * Key concepts:
 * - IntegrationDescriptor: Complete description of an integration's capabilities
 * - Extraction: Discovering integrations from content (patterns + LLM)
 * - Storage: Persisting descriptors to ~/.kai/integrations/
 *
 * This module works alongside the vault module:
 * - Vault stores CREDENTIALS (secrets)
 * - Integrations stores CAPABILITIES (what the service can do)
 */

// Types
export type {
  AuthMethod,
  IntegrationAuth,
  IntegrationDescriptor,
  IntegrationExtractionResult,
  IntegrationLimits,
  IntegrationMention,
  IntegrationOperation,
  IntegrationSource,
  IntegrationSummary,
  IntegrationType,
  OperationParam,
  UsageExample,
  UseIntegrationRequest,
  UseIntegrationResult,
} from './types.js';

// Extraction
export {
  analyze1PasswordReference,
  createCustomIntegration,
  extractIntegrationsFrom1PasswordRefs,
  extractIntegrationsFromPatterns,
  find1PasswordReferences,
  generateIntegrationId,
  inferIntegrationFromOpItem,
  INTEGRATION_EXTRACTION_PROMPT,
  mergeSecretsWithIntegrations,
} from './extraction.js';

// Re-export the 1Password integration ref type
export type { OnePasswordIntegrationRef } from './extraction.js';

// Storage
export {
  deleteIntegration,
  ensureIntegrationsDir,
  findIntegrationsBySource,
  findIntegrationsByType,
  generateIntegrationsSummaryMarkdown,
  getIntegrationsDir,
  integrationExists,
  listIntegrationIds,
  listIntegrations,
  listIntegrationSummaries,
  loadIntegration,
  mergeIntegration,
  saveIntegration,
  updateIntegrationStatus,
} from './storage.js';

// Execution - Re-export from execution module
export * from './execution/index.js';

// Verification - Re-export from verification module
export * from './verification/index.js';

// Credential Prompting
export {
  checkMissingCredentials,
  generateCredentialPrompt,
  generateCredentialStatusSummary,
  getCredentialRequirements,
} from './credential-prompts.js';

// Integration Templates (credential configuration data)
export { CREDENTIAL_INFO } from './integration-templates.js';
export type { CredentialRequirement } from './integration-templates.js';
