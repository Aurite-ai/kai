/**
 * Tests for the usage tracker module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageTracker, createUsageTrackerFromEnv, extractTokenUsage } from '../tracker.js';
import type { RecordCallInput, TokenUsage } from '../types.js';

// Mock global fetch for remote reporting tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Helper to create a basic record call input
 */
function createRecordInput(overrides?: Partial<RecordCallInput>): RecordCallInput {
  return {
    model: 'claude-3-haiku-20240307',
    toolName: 'kai_ask',
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
    },
    latencyMs: 250,
    ...overrides,
  };
}

describe('UsageTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  describe('constructor', () => {
    it('creates a tracker with unique session ID', () => {
      const tracker1 = new UsageTracker();
      const tracker2 = new UsageTracker();

      expect(tracker1.getSessionId()).toBeDefined();
      expect(tracker2.getSessionId()).toBeDefined();
      expect(tracker1.getSessionId()).not.toBe(tracker2.getSessionId());
    });

    it('defaults includeInResponses to true', () => {
      const tracker = new UsageTracker();
      expect(tracker.shouldIncludeInResponses()).toBe(true);
    });

    it('respects includeInResponses config', () => {
      const tracker = new UsageTracker({ includeInResponses: false });
      expect(tracker.shouldIncludeInResponses()).toBe(false);
    });

    it('stores user identity when provided', () => {
      const tracker = new UsageTracker({
        userIdentity: {
          userId: 'user-123',
          organizationId: 'org-456',
          permissions: ['read', 'write'],
        },
      });

      expect(tracker.getUserIdentity()).toEqual({
        userId: 'user-123',
        organizationId: 'org-456',
        permissions: ['read', 'write'],
      });
    });

    it('returns undefined for user identity when not configured', () => {
      const tracker = new UsageTracker();
      expect(tracker.getUserIdentity()).toBeUndefined();
    });
  });

  describe('record()', () => {
    it('records a call and returns LLMCall with calculated costs', () => {
      const tracker = new UsageTracker();
      const input = createRecordInput();

      const call = tracker.record(input);

      expect(call.id).toBeDefined();
      expect(call.timestamp).toBeInstanceOf(Date);
      expect(call.model).toBe('claude-3-haiku-20240307');
      expect(call.toolName).toBe('kai_ask');
      expect(call.usage).toEqual(input.usage);
      expect(call.latencyMs).toBe(250);
      expect(call.success).toBe(true);
      expect(call.cost.totalCost).toBeGreaterThan(0);
    });

    it('records success as true by default', () => {
      const tracker = new UsageTracker();
      const call = tracker.record(createRecordInput());

      expect(call.success).toBe(true);
    });

    it('records success as false when specified', () => {
      const tracker = new UsageTracker();
      const call = tracker.record(createRecordInput({ success: false, errorMessage: 'API error' }));

      expect(call.success).toBe(false);
      expect(call.errorMessage).toBe('API error');
    });

    it('increments call count', () => {
      const tracker = new UsageTracker();

      expect(tracker.getCallCount()).toBe(0);
      tracker.record(createRecordInput());
      expect(tracker.getCallCount()).toBe(1);
      tracker.record(createRecordInput());
      expect(tracker.getCallCount()).toBe(2);
    });

    it('updates lastCall', () => {
      const tracker = new UsageTracker();

      expect(tracker.getLastCall()).toBeNull();

      const call1 = tracker.record(createRecordInput({ toolName: 'tool1' }));
      expect(tracker.getLastCall()).toBe(call1);

      const call2 = tracker.record(createRecordInput({ toolName: 'tool2' }));
      expect(tracker.getLastCall()).toBe(call2);
    });
  });

  describe('getTotals()', () => {
    it('returns zeros for empty tracker', () => {
      const tracker = new UsageTracker();
      const totals = tracker.getTotals();

      expect(totals.inputTokens).toBe(0);
      expect(totals.outputTokens).toBe(0);
      expect(totals.estimatedCost).toBe(0);
      expect(totals.callCount).toBe(0);
    });

    it('accumulates totals across multiple calls', () => {
      const tracker = new UsageTracker();

      tracker.record(
        createRecordInput({
          usage: { inputTokens: 1000, outputTokens: 500 },
        })
      );
      tracker.record(
        createRecordInput({
          usage: { inputTokens: 2000, outputTokens: 1000 },
        })
      );

      const totals = tracker.getTotals();
      expect(totals.inputTokens).toBe(3000);
      expect(totals.outputTokens).toBe(1500);
      expect(totals.callCount).toBe(2);
    });

    it('returns a copy of totals (not reference)', () => {
      const tracker = new UsageTracker();
      tracker.record(createRecordInput());

      const totals1 = tracker.getTotals();
      const totals2 = tracker.getTotals();

      expect(totals1).not.toBe(totals2);
      expect(totals1).toEqual(totals2);
    });
  });

  describe('getByModel()', () => {
    it('returns empty object for empty tracker', () => {
      const tracker = new UsageTracker();
      expect(tracker.getByModel()).toEqual({});
    });

    it('groups usage by model', () => {
      const tracker = new UsageTracker();

      tracker.record(
        createRecordInput({
          model: 'claude-3-haiku-20240307',
          usage: { inputTokens: 1000, outputTokens: 500 },
        })
      );
      tracker.record(
        createRecordInput({
          model: 'claude-sonnet-4-20250514',
          usage: { inputTokens: 2000, outputTokens: 1000 },
        })
      );
      tracker.record(
        createRecordInput({
          model: 'claude-3-haiku-20240307',
          usage: { inputTokens: 500, outputTokens: 250 },
        })
      );

      const byModel = tracker.getByModel();

      expect(byModel['claude-3-haiku-20240307'].inputTokens).toBe(1500);
      expect(byModel['claude-3-haiku-20240307'].outputTokens).toBe(750);
      expect(byModel['claude-3-haiku-20240307'].callCount).toBe(2);
      expect(byModel['claude-3-haiku-20240307'].model).toBe('claude-3-haiku-20240307');

      expect(byModel['claude-sonnet-4-20250514'].inputTokens).toBe(2000);
      expect(byModel['claude-sonnet-4-20250514'].outputTokens).toBe(1000);
      expect(byModel['claude-sonnet-4-20250514'].callCount).toBe(1);
    });
  });

  describe('getByTool()', () => {
    it('returns empty object for empty tracker', () => {
      const tracker = new UsageTracker();
      expect(tracker.getByTool()).toEqual({});
    });

    it('groups usage by tool', () => {
      const tracker = new UsageTracker();

      tracker.record(
        createRecordInput({
          toolName: 'kai_ask',
          usage: { inputTokens: 1000, outputTokens: 500 },
        })
      );
      tracker.record(
        createRecordInput({
          toolName: 'kai_learn',
          usage: { inputTokens: 2000, outputTokens: 1000 },
        })
      );
      tracker.record(
        createRecordInput({
          toolName: 'kai_ask',
          usage: { inputTokens: 500, outputTokens: 250 },
        })
      );

      const byTool = tracker.getByTool();

      expect(byTool.kai_ask.inputTokens).toBe(1500);
      expect(byTool.kai_ask.outputTokens).toBe(750);
      expect(byTool.kai_ask.callCount).toBe(2);
      expect(byTool.kai_ask.toolName).toBe('kai_ask');

      expect(byTool.kai_learn.inputTokens).toBe(2000);
      expect(byTool.kai_learn.callCount).toBe(1);
    });
  });

  describe('reset()', () => {
    it('clears all recorded calls', () => {
      const tracker = new UsageTracker();

      tracker.record(createRecordInput());
      tracker.record(createRecordInput({ model: 'claude-sonnet-4-20250514' }));
      tracker.record(createRecordInput({ toolName: 'kai_learn' }));

      expect(tracker.getCallCount()).toBe(3);

      tracker.reset();

      expect(tracker.getCallCount()).toBe(0);
      expect(tracker.getLastCall()).toBeNull();
      expect(tracker.getTotals().inputTokens).toBe(0);
      expect(tracker.getTotals().callCount).toBe(0);
      expect(tracker.getByModel()).toEqual({});
      expect(tracker.getByTool()).toEqual({});
    });

    it('allows recording new calls after reset', () => {
      const tracker = new UsageTracker();

      tracker.record(createRecordInput());
      tracker.reset();
      tracker.record(createRecordInput({ usage: { inputTokens: 100, outputTokens: 50 } }));

      expect(tracker.getCallCount()).toBe(1);
      expect(tracker.getTotals().inputTokens).toBe(100);
    });
  });

  describe('getSessionSummary()', () => {
    it('returns complete session summary', () => {
      const tracker = new UsageTracker({
        userIdentity: {
          userId: 'user-123',
          organizationId: 'org-456',
          permissions: [],
        },
      });

      tracker.record(createRecordInput({ toolName: 'kai_ask' }));
      tracker.record(
        createRecordInput({ model: 'claude-sonnet-4-20250514', toolName: 'kai_learn' })
      );

      const summary = tracker.getSessionSummary();

      expect(summary.sessionId).toBe(tracker.getSessionId());
      expect(summary.startTime).toBeInstanceOf(Date);
      expect(summary.endTime).toBeNull(); // Active session
      expect(summary.userId).toBe('user-123');
      expect(summary.organizationId).toBe('org-456');
      expect(summary.calls).toHaveLength(2);
      expect(summary.totals.callCount).toBe(2);
      expect(Object.keys(summary.byModel)).toHaveLength(2);
      expect(Object.keys(summary.byTool)).toHaveLength(2);
    });
  });

  describe('getLastCallDisplay()', () => {
    it('returns null when no calls recorded', () => {
      const tracker = new UsageTracker();
      expect(tracker.getLastCallDisplay()).toBeNull();
    });

    it('returns display for last call', () => {
      const tracker = new UsageTracker();
      tracker.record(createRecordInput());

      const display = tracker.getLastCallDisplay();

      expect(display).not.toBeNull();
      expect(display?.markdown).toContain('Haiku');
      expect(display?.data).toBeDefined();
    });
  });

  describe('getCallDisplay()', () => {
    it('generates display for a specific call', () => {
      const tracker = new UsageTracker();
      const call = tracker.record(createRecordInput());

      const display = tracker.getCallDisplay(call);

      expect(display.markdown).toContain('Haiku');
      expect(display.data.thisCall.model).toBe('claude-3-haiku-20240307');
    });
  });

  describe('remote reporting', () => {
    it('does not send to remote when disabled', () => {
      const tracker = new UsageTracker({ enableRemoteReporting: false });
      tracker.record(createRecordInput());

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends to remote when enabled with endpoint and key', async () => {
      const tracker = new UsageTracker({
        enableRemoteReporting: true,
        apiEndpoint: 'https://api.example.com',
        apiKey: 'test-key',
      });

      tracker.record(createRecordInput());

      // Wait for async fetch
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledOnce();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/usage/record',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('handles remote API errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const tracker = new UsageTracker({
        enableRemoteReporting: true,
        apiEndpoint: 'https://api.example.com',
        apiKey: 'test-key',
      });

      tracker.record(createRecordInput());

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[UsageTracker] Remote API returned 500')
        );
      });

      consoleSpy.mockRestore();
    });
  });
});

describe('extractTokenUsage()', () => {
  it('extracts basic token usage', () => {
    const response = {
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
      },
    };

    const usage = extractTokenUsage(response);

    expect(usage.inputTokens).toBe(1000);
    expect(usage.outputTokens).toBe(500);
    expect(usage.cacheReadTokens).toBeUndefined();
    expect(usage.cacheCreationTokens).toBeUndefined();
  });

  it('extracts cache tokens when present', () => {
    const response = {
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 100,
      },
    };

    const usage = extractTokenUsage(response);

    expect(usage.inputTokens).toBe(1000);
    expect(usage.outputTokens).toBe(500);
    expect(usage.cacheReadTokens).toBe(200);
    expect(usage.cacheCreationTokens).toBe(100);
  });

  it('returns zeros for missing usage', () => {
    const response = {};

    const usage = extractTokenUsage(response);

    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });

  it('returns zeros for undefined usage fields', () => {
    const response = { usage: undefined };

    const usage = extractTokenUsage(
      response as { usage?: { input_tokens: number; output_tokens: number } }
    );

    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });
});

describe('createUsageTrackerFromEnv()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates tracker with default config when no env vars set', () => {
    process.env.KAI_USAGE_API_ENDPOINT = undefined;
    process.env.KAI_USAGE_API_KEY = undefined;
    process.env.KAI_USER_ID = undefined;
    process.env.KAI_ORG_ID = undefined;
    process.env.KAI_INCLUDE_USAGE_IN_RESPONSES = undefined;

    const tracker = createUsageTrackerFromEnv();

    expect(tracker.shouldIncludeInResponses()).toBe(true);
    expect(tracker.getUserIdentity()).toBeUndefined();
  });

  it('respects KAI_INCLUDE_USAGE_IN_RESPONSES=false', () => {
    process.env.KAI_INCLUDE_USAGE_IN_RESPONSES = 'false';

    const tracker = createUsageTrackerFromEnv();

    expect(tracker.shouldIncludeInResponses()).toBe(false);
  });

  it('configures user identity from env vars', () => {
    process.env.KAI_USER_ID = 'env-user';
    process.env.KAI_ORG_ID = 'env-org';
    process.env.KAI_TEAM_ID = 'env-team';

    const tracker = createUsageTrackerFromEnv();

    expect(tracker.getUserIdentity()).toEqual({
      userId: 'env-user',
      organizationId: 'env-org',
      teamId: 'env-team',
      permissions: [],
    });
  });

  it('does not set user identity if userId missing', () => {
    process.env.KAI_USER_ID = undefined;
    process.env.KAI_ORG_ID = 'env-org';

    const tracker = createUsageTrackerFromEnv();

    expect(tracker.getUserIdentity()).toBeUndefined();
  });

  it('does not set user identity if orgId missing', () => {
    process.env.KAI_USER_ID = 'env-user';
    process.env.KAI_ORG_ID = undefined;

    const tracker = createUsageTrackerFromEnv();

    expect(tracker.getUserIdentity()).toBeUndefined();
  });
});
