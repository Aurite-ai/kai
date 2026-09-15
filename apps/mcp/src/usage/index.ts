/**
 * Usage Tracking Module
 *
 * Exports all usage tracking functionality for LLM cost and token tracking.
 *
 * Usage:
 * ```typescript
 * import { UsageTracker, extractTokenUsage } from './usage/index.js';
 *
 * const tracker = new UsageTracker();
 *
 * // After an LLM call
 * const usage = extractTokenUsage(response);
 * tracker.record({
 *   model: 'claude-3-haiku-20240307',
 *   toolName: 'kai_ask',
 *   usage,
 *   latencyMs: 500,
 * });
 *
 * // Get session summary
 * const summary = tracker.getSessionSummary();
 *
 * // Get display for tool response
 * const display = tracker.getLastCallDisplay();
 * ```
 */

// Types
export type {
  CompactUsageLine,
  CostBreakdown,
  LLMCall,
  ModelUsage,
  ProjectToolUsage,
  ProjectUsageData,
  ProjectUsageTotals,
  RecordCallInput,
  SessionSummary,
  TokenUsage,
  ToolUsage,
  UsageDisplay,
  UsageSummary,
  UsageTrackerConfig,
  UserIdentity,
} from './types.js';

// Pricing
export {
  DEFAULT_PRICING,
  getKnownModels,
  getModelPricing,
  getShortModelName,
  isKnownModel,
  MODEL_REGISTRY,
  type ModelPricing,
} from './pricing.js';

// Calculator
export {
  addToSummary,
  calculateCost,
  createEmptySummary,
  formatCost,
  formatLatency,
  formatTokens,
  generateCompactSummary,
  generateUsageDisplay,
} from './calculator.js';

// Tracker
export {
  createUsageTrackerFromEnv,
  extractTokenUsage,
  generateAgentUsageLine,
  generateCompactUsageLine,
  getProjectStorage,
  getProjectUsageData,
  getProjectUsageTotals,
  recordProjectUsage,
  UsageTracker,
} from './tracker.js';

// Project Storage
export { createProjectUsageStorage, ProjectUsageStorage } from './project-storage.js';
