/**
 * @aurite-ai/kai-testing - VCK quality testing infrastructure
 *
 * This package provides:
 * - CLI tools for test project management (create, list, collect)
 * - Type definitions for test metadata and project info
 * - Utilities for working with scenarios and projects
 */

// Types
export * from './types.js';

// Utilities
export { findRepoRoot, getScenariosDir, getProjectsDir } from './utils.js';
