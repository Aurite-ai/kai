/**
 * Project Usage Storage
 *
 * Persists usage data to .kai/usage.json in the project directory.
 * Enables tracking of cumulative costs across sessions.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CostBreakdown, ProjectUsageData, ProjectUsageTotals, TokenUsage } from './types.js';

/** Default path for usage data relative to project root */
const USAGE_DIR = '.kai';
const USAGE_FILE = 'usage.json';

/**
 * Creates an empty project usage data structure.
 */
function createEmptyProjectUsage(): ProjectUsageData {
  return {
    totalUsage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUSD: 0,
      callCount: 0,
    },
    byTool: {},
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Round to 6 decimal places (micro-dollars precision).
 */
function roundToMicros(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Project Usage Storage class.
 *
 * Handles reading and writing usage data to .kai/usage.json.
 * Thread-safe through atomic write operations.
 */
export class ProjectUsageStorage {
  private readonly projectDir: string;
  private readonly usagePath: string;
  private cachedData: ProjectUsageData | null = null;

  /**
   * Create a new ProjectUsageStorage instance.
   *
   * @param projectDir - Project directory path (default: process.cwd())
   */
  constructor(projectDir?: string) {
    this.projectDir = projectDir ?? process.cwd();
    this.usagePath = path.join(this.projectDir, USAGE_DIR, USAGE_FILE);
  }

  /**
   * Get the path to the usage file.
   */
  getUsagePath(): string {
    return this.usagePath;
  }

  /**
   * Load usage data from disk.
   * Returns empty data if file doesn't exist.
   */
  async load(): Promise<ProjectUsageData> {
    try {
      const content = await fs.readFile(this.usagePath, 'utf-8');
      const data = JSON.parse(content) as ProjectUsageData;
      this.cachedData = data;
      return data;
    } catch (error) {
      // File doesn't exist or is invalid - return empty data
      const emptyData = createEmptyProjectUsage();
      this.cachedData = emptyData;
      return emptyData;
    }
  }

  /**
   * Save usage data to disk.
   * Creates .kai directory if it doesn't exist.
   */
  async save(data: ProjectUsageData): Promise<void> {
    // Ensure .kai directory exists
    const dir = path.dirname(this.usagePath);
    await fs.mkdir(dir, { recursive: true });

    // Update timestamp
    data.lastUpdated = new Date().toISOString();

    // Write atomically (write to temp file then rename)
    const tempPath = `${this.usagePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, this.usagePath);

    this.cachedData = data;
  }

  /**
   * Record usage from an LLM call.
   *
   * @param toolName - Name of the tool that made the call
   * @param usage - Token usage from the call
   * @param cost - Cost breakdown from the call
   */
  async recordUsage(toolName: string, usage: TokenUsage, cost: CostBreakdown): Promise<void> {
    const data = this.cachedData ?? (await this.load());

    // Update total usage
    data.totalUsage.inputTokens += usage.inputTokens;
    data.totalUsage.outputTokens += usage.outputTokens;
    data.totalUsage.estimatedCostUSD = roundToMicros(
      data.totalUsage.estimatedCostUSD + cost.totalCost
    );
    data.totalUsage.callCount += 1;

    // Update per-tool usage
    if (!data.byTool[toolName]) {
      data.byTool[toolName] = {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUSD: 0,
        callCount: 0,
      };
    }
    data.byTool[toolName].inputTokens += usage.inputTokens;
    data.byTool[toolName].outputTokens += usage.outputTokens;
    data.byTool[toolName].estimatedCostUSD = roundToMicros(
      data.byTool[toolName].estimatedCostUSD + cost.totalCost
    );
    data.byTool[toolName].callCount += 1;

    await this.save(data);
  }

  /**
   * Get the current project usage totals.
   * Uses cached data if available.
   */
  async getTotals(): Promise<ProjectUsageTotals> {
    const data = this.cachedData ?? (await this.load());
    return { ...data.totalUsage };
  }

  /**
   * Get the full usage data.
   * Uses cached data if available.
   */
  async getData(): Promise<ProjectUsageData> {
    return this.cachedData ?? (await this.load());
  }

  /**
   * Reset all usage data (useful for testing).
   */
  async reset(): Promise<void> {
    const emptyData = createEmptyProjectUsage();
    await this.save(emptyData);
  }

  /**
   * Check if usage file exists.
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.usagePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a ProjectUsageStorage instance for the current working directory.
 */
export function createProjectUsageStorage(): ProjectUsageStorage {
  return new ProjectUsageStorage(process.cwd());
}
