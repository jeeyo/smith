import { describe, it, expect, beforeEach } from 'vitest';
import { CostEngine } from '../src/server/cost-engine.ts';
import { TokenUsage } from '../src/shared/types.ts';

describe('CostEngine (USD Cost Accounting)', () => {
  let costEngine: CostEngine;

  beforeEach(() => {
    costEngine = new CostEngine();
  });

  it('calculates correct cost in USD for Claude 3.7 Sonnet', () => {
    const usage: TokenUsage = {
      inputTokens: 10_000,
      outputTokens: 2_000,
      cachedTokens: 1_000,
      reasoningTokens: 500,
      totalTokens: 12_000
    };

    // Claude 3.7: $3/1M input, $15/1M output, $0.30/1M cached
    // Input: (10,000 / 1e6) * 3 = $0.03
    // Output: (2,000 / 1e6) * 15 = $0.03
    // Cached: (1,000 / 1e6) * 0.30 = $0.0003
    // Total = 0.0603 -> formatted $0.06
    const breakdown = costEngine.recordTurn('test-session', 'claude', 'claude-3-7-sonnet', usage);

    expect(breakdown.currency).toBe('USD');
    expect(breakdown.totalCostUsd).toBeCloseTo(0.0603, 3);
    expect(breakdown.formattedTotal).toBe('$0.06');
  });

  it('calculates free cost for local Ollama models', () => {
    const usage: TokenUsage = {
      inputTokens: 50_000,
      outputTokens: 10_000,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: 60_000
    };

    const breakdown = costEngine.recordTurn('test-session', 'opencode', 'ollama', usage);

    expect(breakdown.totalCostUsd).toBe(0);
    expect(breakdown.formattedTotal).toBe('$0.00');
  });

  it('accumulates multiple turns across agents into session summary', () => {
    costEngine.recordTurn('sess-1', 'claude', 'claude-3-7-sonnet', {
      inputTokens: 5_000,
      outputTokens: 1_000,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: 6_000
    }, 'task-1');

    costEngine.recordTurn('sess-1', 'codex', 'o3-mini', {
      inputTokens: 10_000,
      outputTokens: 2_000,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: 12_000
    }, 'task-2');

    const summary = costEngine.getSessionCost('sess-1');

    expect(summary.sessionId).toBe('sess-1');
    expect(summary.currency).toBe('USD');
    expect(summary.totalCostUsd).toBeGreaterThan(0);
    expect(summary.totalTokens).toBe(18_000);
    expect(summary.byAgent['claude']).toBeDefined();
    expect(summary.byAgent['codex']).toBeDefined();
    expect(summary.byTask.length).toBe(2);
  });
});
