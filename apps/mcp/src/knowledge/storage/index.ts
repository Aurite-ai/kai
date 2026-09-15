/**
 * Knowledge storage module
 *
 * Provides types, utilities, and services for managing .mdc files in ~/.kai/knowledge/
 */

// Types
export type {
  KnowledgeCategory,
  KnowledgeStatus,
  KnowledgeClassification,
  KnowledgeSource,
  KnowledgeEntryFrontmatter,
  KnowledgeEntry,
  SaveKnowledgeEntryInput,
  KnowledgeEntryFilter,
  HealthCheckResult,
  KnowledgeStorageErrorCode,
  KnowledgeStorageService,
} from './types.js';

export { KnowledgeStorageError, FILE_SIZE_LIMIT } from './types.js';

// Utilities
export {
  generateSlug,
  validateCategory,
  parseMdcFile,
  generateMdcFile,
  stripFrontmatter,
  type ParsedMdcFile,
} from './utils.js';

// Storage Service
export { FileKnowledgeStorageService } from './knowledge-storage.js';
