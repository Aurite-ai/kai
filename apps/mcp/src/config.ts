/**
 * Centralized configuration
 *
 * Model names, pricing, server constants, and other configuration values
 * that were previously scattered as string literals.
 *
 * Pricing reference: https://platform.claude.com/docs/en/about-claude/pricing
 * Last updated: 2026-02
 */

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Feature flags to control which features are enabled in the build.
 * In the future, these may be loaded from a plugin system.
 */
export const FEATURE_FLAGS = {
  /**
   * Enable Perplexity web search for integration discovery.
   * Default: false (disabled)
   *
   * To enable, set ENABLE_PERPLEXITY_INTEGRATION=true and PERPLEXITY_API_KEY.
   */
  ENABLE_PERPLEXITY_INTEGRATION: process.env.ENABLE_PERPLEXITY_INTEGRATION === 'true',
} as const;

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

/**
 * Pricing structure for a model (per 1 million tokens).
 */
export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  inputPer1M: number;
  /** Cost per 1M output tokens in USD */
  outputPer1M: number;
  /** Cost per 1M cache read tokens in USD */
  cacheReadPer1M: number;
  /** Cost per 1M cache write tokens (5-min TTL) in USD */
  cacheWritePer1M: number;
}

/**
 * Full model configuration including identity and pricing.
 */
export interface ModelConfig {
  /** Human-readable display name */
  displayName: string;
  /** Provider (e.g., "anthropic") */
  provider: string;
  /** Pricing information */
  pricing: ModelPricing;
  /** Whether this model is deprecated */
  deprecated?: boolean;
}

/**
 * Complete registry of all supported Anthropic models with pricing.
 *
 * Pricing reference: https://platform.claude.com/docs/en/about-claude/pricing
 *
 * Note: Prices are in USD per 1 million tokens.
 * Cache write pricing shown is for 5-minute TTL (default).
 * 1-hour cache TTL is 2x the base input price.
 */
export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  // ============================================
  // Claude Opus Models (Most Capable)
  // ============================================

  'claude-opus-4-6': {
    displayName: 'Claude Opus 4.6',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 5.0,
      outputPer1M: 25.0,
      cacheReadPer1M: 0.5,
      cacheWritePer1M: 6.25,
    },
  },

  'claude-opus-4-5': {
    displayName: 'Claude Opus 4.5',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 5.0,
      outputPer1M: 25.0,
      cacheReadPer1M: 0.5,
      cacheWritePer1M: 6.25,
    },
  },

  'claude-3-opus-20240229': {
    displayName: 'Claude 3 Opus',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 15.0,
      outputPer1M: 75.0,
      cacheReadPer1M: 1.5,
      cacheWritePer1M: 18.75,
    },
    deprecated: true,
  },

  // ============================================
  // Claude Sonnet Models (Balanced)
  // ============================================

  'claude-sonnet-4-5': {
    displayName: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
  },

  'claude-sonnet-4': {
    displayName: 'Claude Sonnet 4',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
  },

  // Dated version alias for Sonnet 4
  'claude-sonnet-4-20250514': {
    displayName: 'Claude Sonnet 4',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
  },

  'claude-3-7-sonnet-20250219': {
    displayName: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
    deprecated: true,
  },

  'claude-3-5-sonnet-20241022': {
    displayName: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
    deprecated: true,
  },

  'claude-3-5-sonnet-20240620': {
    displayName: 'Claude 3.5 Sonnet (June)',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
    deprecated: true,
  },

  'claude-3-sonnet-20240229': {
    displayName: 'Claude 3 Sonnet',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
    deprecated: true,
  },

  // ============================================
  // Claude Haiku Models (Fast & Economical)
  // ============================================

  'claude-haiku-4-5': {
    displayName: 'Claude Haiku 4.5',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 1.0,
      outputPer1M: 5.0,
      cacheReadPer1M: 0.1,
      cacheWritePer1M: 1.25,
    },
  },

  'claude-3-5-haiku-20241022': {
    displayName: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 0.8,
      outputPer1M: 4.0,
      cacheReadPer1M: 0.08,
      cacheWritePer1M: 1.0,
    },
  },

  'claude-3-haiku-20240307': {
    displayName: 'Claude 3 Haiku',
    provider: 'anthropic',
    pricing: {
      inputPer1M: 0.25,
      outputPer1M: 1.25,
      cacheReadPer1M: 0.03,
      cacheWritePer1M: 0.3,
    },
  },
} as const;

// =============================================================================
// MODEL SELECTION (Environment Variable Support)
// =============================================================================

/** Default models for each task */
const DEFAULT_MODELS = {
  categorization: 'claude-sonnet-4-20250514',
  retrieval: 'claude-sonnet-4-20250514',
  ask: 'claude-sonnet-4-20250514',
  contradiction: 'claude-sonnet-4-20250514',
  /** Model used for LLM-based secret verification (fast, cheap recommended) */
  llmVerification: 'claude-3-haiku-20240307',
} as const;

/**
 * Validates a model identifier against the registry.
 * Logs a warning if the model is unknown but still returns it.
 *
 * @param model - Model identifier to validate
 * @param taskName - Name of the task (for warning message)
 * @returns The model identifier (validated or not)
 */
function validateModel(model: string, taskName: string): string {
  if (!(model in MODEL_REGISTRY)) {
    console.warn(
      `[Kai Config] Warning: Unknown model "${model}" for ${taskName}. ` +
        `Available models: ${Object.keys(MODEL_REGISTRY).join(', ')}`
    );
  }
  return model;
}

/**
 * Gets a model from environment variable or falls back to default.
 *
 * @param envVar - Environment variable name
 * @param taskName - Task name for logging
 * @param defaultModel - Default model if env var not set
 * @returns Model identifier
 */
function getModelFromEnv(envVar: string, taskName: string, defaultModel: string): string {
  const envValue = process.env[envVar]?.trim();
  if (envValue) {
    return validateModel(envValue, taskName);
  }
  return defaultModel;
}

/**
 * Model identifiers for use throughout the application.
 * References models defined in MODEL_REGISTRY.
 *
 * Models can be overridden via environment variables:
 * - KAI_MODEL_CATEGORIZATION: Model for file categorization (fast, cheap)
 * - KAI_MODEL_RETRIEVAL: Model for KB retrieval agent (prepare_context tool)
 * - KAI_MODEL_ASK: Model for the ask tool's agentic Q&A loop
 * - KAI_MODEL_CONTRADICTION: Model for contradiction check during kai_learn
 *
 * Example .env:
 *   KAI_MODEL_ASK=claude-opus-4-6
 *   KAI_MODEL_CATEGORIZATION=claude-3-haiku-20240307
 */
export const MODELS = {
  /** Model used for file categorization (fast, cheap) */
  get categorization(): string {
    return getModelFromEnv(
      'KAI_MODEL_CATEGORIZATION',
      'categorization',
      DEFAULT_MODELS.categorization
    );
  },
  /** Model used for KB retrieval agent (prepare_context tool) */
  get retrieval(): string {
    return getModelFromEnv('KAI_MODEL_RETRIEVAL', 'retrieval', DEFAULT_MODELS.retrieval);
  },
  /** Model used for the ask tool's agentic Q&A loop */
  get ask(): string {
    return getModelFromEnv('KAI_MODEL_ASK', 'ask', DEFAULT_MODELS.ask);
  },
  /** Model used for contradiction check during kai_learn */
  get contradiction(): string {
    return getModelFromEnv(
      'KAI_MODEL_CONTRADICTION',
      'contradiction',
      DEFAULT_MODELS.contradiction
    );
  },
  /** Model used for LLM-based secret verification (fast, cheap recommended) */
  get llmVerification(): string {
    return getModelFromEnv(
      'KAI_MODEL_LLM_VERIFICATION',
      'llmVerification',
      DEFAULT_MODELS.llmVerification
    );
  },
};

/**
 * Get all default model assignments (ignoring env overrides).
 * Useful for documentation and testing.
 */
export function getDefaultModels(): Record<string, string> {
  return { ...DEFAULT_MODELS };
}

/**
 * Get current model assignments (including env overrides).
 * Useful for debugging and status display.
 */
export function getCurrentModels(): Record<string, string> {
  return {
    categorization: MODELS.categorization,
    retrieval: MODELS.retrieval,
    ask: MODELS.ask,
    contradiction: MODELS.contradiction,
    llmVerification: MODELS.llmVerification,
  };
}

/**
 * Get configuration for a specific model.
 *
 * @param model - Model identifier
 * @returns Model configuration or undefined if not found
 */
export function getModelConfig(model: string): ModelConfig | undefined {
  return MODEL_REGISTRY[model];
}

/**
 * Get all available model identifiers.
 *
 * @returns Array of model identifiers
 */
export function getAvailableModels(): string[] {
  return Object.keys(MODEL_REGISTRY);
}

/**
 * Get non-deprecated model identifiers.
 *
 * @returns Array of active model identifiers
 */
export function getActiveModels(): string[] {
  return Object.entries(MODEL_REGISTRY)
    .filter(([_, config]) => !config.deprecated)
    .map(([id]) => id);
}

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

/**
 * MCP server identity.
 */
export const SERVER_NAME = 'kai-mcp-server';

/**
 * Server version - injected at build time via esbuild `define`.
 * Falls back to 'dev' when running unbundled in development.
 *
 * The BUILD_VERSION constant is replaced by esbuild during bundling.
 * See scripts/bundle.ts for the injection logic.
 */
declare const BUILD_VERSION: string | undefined;
export const SERVER_VERSION = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev';

// =============================================================================
// FRAMEWORK CONFIGURATION
// =============================================================================

/**
 * Configuration for a supported framework scaffold.
 */
export interface FrameworkConfig {
  /** Framework identifier (matches template subdirectory name) */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** KB doc slug for prompt hints (agent should look for this doc) */
  kbDocSlug: string;
}

/**
 * Registry of supported frameworks for prepare_context.
 * The framework ID maps to the template subdirectory in the coding copilot templates folder.
 */
export const FRAMEWORKS: Record<string, FrameworkConfig> = {
  langgraph: {
    id: 'langgraph',
    displayName: 'LangGraph',
    kbDocSlug: 'langgraph-best-practices',
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI Agents SDK',
    kbDocSlug: 'openai-agents-overview',
  },
} as const;

/**
 * Get the list of valid framework IDs for tool schema enum.
 */
export function getFrameworkIds(): string[] {
  return Object.keys(FRAMEWORKS);
}
