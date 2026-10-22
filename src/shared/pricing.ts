import { CostBreakdown, TokenUsage } from './types.ts';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedPerMillion?: number;
  reasoningPerMillion?: number;
}

export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude (Active 2026 Models & Aliases)
  'claude-opus-5-5': { inputPerMillion: 15.00, outputPerMillion: 75.00, cachedPerMillion: 1.50 },
  'claude-sonnet-5-5': { inputPerMillion: 3.00, outputPerMillion: 15.00, cachedPerMillion: 0.30 },
  'claude-sonnet-5[1m]': { inputPerMillion: 3.00, outputPerMillion: 15.00, cachedPerMillion: 0.30 },
  'claude-fable-5-1[1m]': { inputPerMillion: 6.00, outputPerMillion: 30.00, cachedPerMillion: 0.60 },
  'sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00, cachedPerMillion: 0.30 },
  'opus': { inputPerMillion: 15.00, outputPerMillion: 75.00, cachedPerMillion: 1.50 },
  'fable': { inputPerMillion: 6.00, outputPerMillion: 30.00, cachedPerMillion: 0.60 },

  // Anthropic Claude (Legacy)
  'claude-3-7-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00, cachedPerMillion: 0.30 },
  'claude-3-7-sonnet-thought': { inputPerMillion: 3.00, outputPerMillion: 15.00, cachedPerMillion: 0.30 },
  'claude-3-5-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00, cachedPerMillion: 0.30 },
  'claude-3-5-haiku': { inputPerMillion: 0.80, outputPerMillion: 4.00, cachedPerMillion: 0.08 },
  'claude-3-opus': { inputPerMillion: 15.00, outputPerMillion: 75.00, cachedPerMillion: 1.50 },

  // Google Gemini & Antigravity (Active 2026 Models & Aliases)
  'gemini-4-argon': { inputPerMillion: 2.00, outputPerMillion: 8.00, cachedPerMillion: 0.50 },
  'gemini-3.1-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00, cachedPerMillion: 0.3125 },
  'gemini-3.1-ultra': { inputPerMillion: 5.00, outputPerMillion: 20.00, cachedPerMillion: 1.25 },
  'gemini-3.8-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40, cachedPerMillion: 0.025 },
  'gemini-3.1-flash-lite': { inputPerMillion: 0.05, outputPerMillion: 0.20, cachedPerMillion: 0.0125 },
  'pro': { inputPerMillion: 2.00, outputPerMillion: 8.00, cachedPerMillion: 0.50 },
  'flash': { inputPerMillion: 0.10, outputPerMillion: 0.40, cachedPerMillion: 0.025 },
  'flash_lite': { inputPerMillion: 0.05, outputPerMillion: 0.20, cachedPerMillion: 0.0125 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00, cachedPerMillion: 0.3125 },
  'gemini-2.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30, cachedPerMillion: 0.01875 },
  'antigravity': { inputPerMillion: 2.00, outputPerMillion: 8.00, cachedPerMillion: 0.50 },

  // OpenAI Codex
  'o3-mini': { inputPerMillion: 1.10, outputPerMillion: 4.40, cachedPerMillion: 0.55 },
  'o1': { inputPerMillion: 15.00, outputPerMillion: 60.00, cachedPerMillion: 7.50 },
  'gpt-4.5': { inputPerMillion: 75.00, outputPerMillion: 150.00, cachedPerMillion: 37.50 },
  'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00, cachedPerMillion: 1.25 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60, cachedPerMillion: 0.075 },
  'gpt-6.1-sol': { inputPerMillion: 2.50, outputPerMillion: 10.00, cachedPerMillion: 1.25 }
};

export function getPricingForModel(modelName: string): ModelPricing {
  const normalized = modelName.toLowerCase().trim();
  if (normalized.includes('ollama') || normalized.includes('local') || normalized.includes('free') || normalized.includes('deepseek') || normalized.includes('qwen')) {
    return { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 };
  }
  for (const [key, pricing] of Object.entries(DEFAULT_MODEL_PRICING)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return pricing;
    }
  }
  // Default fallback rate (standard balanced rate)
  return { inputPerMillion: 2.00, outputPerMillion: 8.00, cachedPerMillion: 0.50 };
}

export function calculateCost(model: string, usage: TokenUsage): CostBreakdown {
  const pricing = getPricingForModel(model);
  
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;
  const cachedCost = ((usage.cachedTokens || 0) / 1_000_000) * (pricing.cachedPerMillion || 0);
  
  const totalCost = inputCost + outputCost + cachedCost;

  return {
    currency: 'USD',
    inputCostUsd: Number(inputCost.toFixed(6)),
    outputCostUsd: Number(outputCost.toFixed(6)),
    cachedCostUsd: Number(cachedCost.toFixed(6)),
    totalCostUsd: Number(totalCost.toFixed(4)),
    formattedTotal: formatUsd(totalCost)
  };
}

export function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(2)}`;
}
