/**
 * Testing-specific type definitions for @aurite-ai/kai-testing
 *
 * Minimal types for test metadata, project configuration,
 * and the CLI commands (create, list, collect).
 */

/**
 * Metadata about a test run, written to results/metadata.json
 * after the collect phase.
 */
export interface TestMetadata {
  /** Which scenario was used (e.g., "customer-support-agent") */
  scenario: string;
  /** Name of the person running the test */
  tester: string;
  /** ISO timestamp when the project was created */
  createdAt: string;
  /** ISO timestamp when results were collected */
  collectedAt: string;
  /** Relative path to the project folder */
  projectPath: string;
}

/**
 * Scenario info parsed from a scenario directory.
 */
export interface ScenarioInfo {
  /** Directory name (e.g., "customer-support-agent") */
  name: string;
  /** Whether the scenario has a CLAUDE.md */
  hasClaude: boolean;
  /** Whether the scenario has a knowledge-base/ directory */
  hasKnowledgeBase: boolean;
  /** Whether the scenario has evaluation-criteria.md */
  hasEvaluation: boolean;
}

/**
 * Project info parsed from a project directory.
 */
export interface ProjectInfo {
  /** Directory name */
  name: string;
  /** ISO timestamp of directory creation (from metadata or stat) */
  createdAt: string;
  /** Whether results have been collected */
  collected: boolean;
}
