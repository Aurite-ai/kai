/**
 * Usage Tracking Types
 *
 * Core interfaces for tracking LLM usage, costs, and session management.
 * Designed for enterprise-level multi-tenant tracking.
 */

/**
 * Token usage from a single LLM API call.
 */
export interface TokenUsage {
  /** Number of tokens in the input/prompt */
  inputTokens: number;
  /** Number of tokens in the output/completion */
  outputTokens: number;
  /** Tokens read from cache (if applicable) */
  cacheReadTokens?: number;
  /** Tokens written to cache (if applicable) */
  cacheCreationTokens?: number;
}

/**
 * Cost breakdown for a single LLM call.
 * All costs are in USD.
 */
export interface CostBreakdown {
  /** Cost for input tokens */
  inputCost: number;
  /** Cost for output tokens */
  outputCost: number;
  /** Cost for cache operations (read + creation) */
  cacheCost: number;
  /** Total cost for this call */
  totalCost: number;
  /** Currency (always USD for now) */
  currency: 'USD';
}

/**
 * Record of a single LLM API call.
 */
export interface LLMCall {
  /** Unique identifier for this call */
  id: string;
  /** When the call was made */
  timestamp: Date;
  /** Model identifier used */
  model: string;
  /** Which Kai tool triggered this call */
  toolName: string;
  /** Token usage from the API response */
  usage: TokenUsage;
  /** Calculated cost breakdown */
  cost: CostBreakdown;
  /** Response latency in milliseconds */
  latencyMs: number;
  /** Whether the call succeeded */
  success: boolean;
  /** Error message if call failed */
  errorMessage?: string;
}

/**
 * Aggregated usage summary.
 * Can represent a session, user, team, or organization.
 */
export interface UsageSummary {
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Total cache read tokens */
  cacheReadTokens: number;
  /** Total cache creation tokens */
  cacheCreationTokens: number;
  /** Total estimated cost in USD */
  estimatedCost: number;
  /** Number of LLM calls */
  callCount: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
}

/**
 * Per-model usage breakdown.
 */
export interface ModelUsage extends UsageSummary {
  /** Model identifier */
  model: string;
}

/**
 * Per-tool usage breakdown.
 */
export interface ToolUsage extends UsageSummary {
  /** Tool name */
  toolName: string;
}

/**
 * Complete session summary with all breakdowns.
 */
export interface SessionSummary {
  /** Unique session identifier */
  sessionId: string;
  /** When the session started */
  startTime: Date;
  /** When the session ended (null if still active) */
  endTime: Date | null;
  /** User identifier (for enterprise tracking) */
  userId?: string;
  /** Organization identifier (for enterprise tracking) */
  organizationId?: string;
  /** All individual calls in this session */
  calls: LLMCall[];
  /** Aggregated totals */
  totals: UsageSummary;
  /** Breakdown by model */
  byModel: Record<string, ModelUsage>;
  /** Breakdown by tool */
  byTool: Record<string, ToolUsage>;
}

/**
 * User identity for enterprise tracking.
 */
export interface UserIdentity {
  /** Unique user identifier */
  userId: string;
  /** Organization/enterprise identifier */
  organizationId: string;
  /** Team identifier (optional) */
  teamId?: string;
  /** User's email (optional) */
  email?: string;
  /** User's permissions */
  permissions: string[];
}

/**
 * Configuration for the usage tracker.
 */
export interface UsageTrackerConfig {
  /** User identity for enterprise tracking (optional) */
  userIdentity?: UserIdentity;
  /** API endpoint for remote usage reporting (optional) */
  apiEndpoint?: string;
  /** API key for remote reporting (optional) */
  apiKey?: string;
  /** Whether to include usage summary in tool responses */
  includeInResponses: boolean;
  /** Whether to send usage to remote API */
  enableRemoteReporting: boolean;
}

/**
 * Data required to record a new LLM call.
 */
export interface RecordCallInput {
  /** Model identifier */
  model: string;
  /** Tool that triggered the call */
  toolName: string;
  /** Token usage from API response */
  usage: TokenUsage;
  /** Response latency in milliseconds */
  latencyMs: number;
  /** Whether the call succeeded */
  success?: boolean;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Formatted usage summary for display in tool responses.
 */
export interface UsageDisplay {
  /** Markdown-formatted usage summary */
  markdown: string;
  /** Structured data for programmatic access */
  data: {
    thisCall: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      latencyMs: number;
    };
    sessionTotal: {
      inputTokens: number;
      outputTokens: number;
      cost: number;
      callCount: number;
    };
  };
}

// =============================================================================
// PROJECT-LEVEL USAGE TYPES
// =============================================================================

/**
 * Usage totals for project-level tracking.
 */
export interface ProjectUsageTotals {
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Total estimated cost in USD */
  estimatedCostUSD: number;
  /** Total number of LLM calls */
  callCount: number;
}

/**
 * Per-tool usage breakdown for project tracking.
 */
export interface ProjectToolUsage {
  /** Input tokens for this tool */
  inputTokens: number;
  /** Output tokens for this tool */
  outputTokens: number;
  /** Estimated cost in USD for this tool */
  estimatedCostUSD: number;
  /** Number of calls for this tool */
  callCount: number;
}

/**
 * Complete project usage data stored in .kai/usage.json
 */
export interface ProjectUsageData {
  /** Total usage across all tools and time */
  totalUsage: ProjectUsageTotals;
  /** Usage breakdown by tool name */
  byTool: Record<string, ProjectToolUsage>;
  /** ISO timestamp of last update */
  lastUpdated: string;
}

/**
 * Compact usage line for tool responses.
 * Format: 📊 This call: 1.2K tokens | $0.0023 | Project total: $1.23 (47 calls)
 */
export interface CompactUsageLine {
  /** This call's token count (input + output) */
  thisCallTokens: number;
  /** This call's cost */
  thisCallCost: number;
  /** Project total cost */
  projectTotalCost: number;
  /** Project total call count */
  projectCallCount: number;
}
