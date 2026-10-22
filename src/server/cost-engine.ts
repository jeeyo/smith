import { EventEmitter } from 'node:events';
import { AgentId, AgentMetrics, CostBreakdown, SessionCostSummary, TokenUsage } from '../shared/types.ts';
import { calculateCost, DEFAULT_MODEL_PRICING, formatUsd, ModelPricing } from '../shared/pricing.ts';

export interface TurnCostRecord {
  sessionId: string;
  agentId: AgentId;
  model: string;
  usage: TokenUsage;
  cost: CostBreakdown;
  taskId?: string;
  timestamp: number;
}

export class CostEngine extends EventEmitter {
  private pricingOverrides: Map<string, ModelPricing> = new Map();
  // sessionId -> agentId -> AgentMetrics
  private sessionAgentMetrics: Map<string, Map<string, AgentMetrics>> = new Map();
  // sessionId -> taskId -> costUsd
  private sessionTaskCosts: Map<string, Map<string, number>> = new Map();
  // Turn history
  private turnHistory: TurnCostRecord[] = [];

  constructor() {
    super();
  }

  recordTurn(
    sessionId: string,
    agentId: AgentId,
    model: string,
    usage: TokenUsage,
    taskId?: string
  ): CostBreakdown {
    const cost = calculateCost(model, usage);

    // Initialize session maps
    if (!this.sessionAgentMetrics.has(sessionId)) {
      this.sessionAgentMetrics.set(sessionId, new Map());
    }
    const agentMap = this.sessionAgentMetrics.get(sessionId)!;

    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, {
        agentId,
        model,
        usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0 },
        cost: { currency: 'USD', inputCostUsd: 0, outputCostUsd: 0, cachedCostUsd: 0, totalCostUsd: 0, formattedTotal: '$0.00' },
        turnCount: 0,
        startTime: Date.now(),
        lastActiveTime: Date.now()
      });
    }

    const metrics = agentMap.get(agentId)!;
    metrics.model = model;
    metrics.turnCount += 1;
    metrics.lastActiveTime = Date.now();

    // Accumulate tokens
    metrics.usage.inputTokens += usage.inputTokens;
    metrics.usage.outputTokens += usage.outputTokens;
    metrics.usage.cachedTokens += (usage.cachedTokens || 0);
    metrics.usage.reasoningTokens += (usage.reasoningTokens || 0);
    metrics.usage.totalTokens += usage.totalTokens;

    // Recompute cumulative agent cost
    metrics.cost = calculateCost(model, metrics.usage);

    // Accumulate task cost if applicable
    if (taskId) {
      if (!this.sessionTaskCosts.has(sessionId)) {
        this.sessionTaskCosts.set(sessionId, new Map());
      }
      const taskMap = this.sessionTaskCosts.get(sessionId)!;
      const currentTaskCost = taskMap.get(taskId) || 0;
      taskMap.set(taskId, Number((currentTaskCost + cost.totalCostUsd).toFixed(4)));
    }

    const record: TurnCostRecord = {
      sessionId,
      agentId,
      model,
      usage,
      cost,
      taskId,
      timestamp: Date.now()
    };
    this.turnHistory.push(record);

    // Emit event for real-time WebSocket push
    this.emit('cost:updated', {
      sessionId,
      agentId,
      model,
      turnCost: cost,
      sessionSummary: this.getSessionCost(sessionId)
    });

    return cost;
  }

  getSessionCost(sessionId: string): SessionCostSummary {
    const agentMap = this.sessionAgentMetrics.get(sessionId) || new Map();
    const taskMap = this.sessionTaskCosts.get(sessionId) || new Map();

    let totalCostUsd = 0;
    let totalTokens = 0;
    const byAgent: Record<string, any> = {};

    for (const [agentId, metrics] of agentMap.entries()) {
      totalCostUsd += metrics.cost.totalCostUsd;
      totalTokens += metrics.usage.totalTokens;
      byAgent[agentId] = {
        agentId,
        model: metrics.model,
        usage: metrics.usage,
        costUsd: metrics.cost.totalCostUsd,
        formattedCost: metrics.cost.formattedTotal,
        turnCount: metrics.turnCount
      };
    }

    const byTask = Array.from(taskMap.entries()).map(([taskId, costUsd]) => ({
      taskId,
      title: `Task ${taskId}`,
      agentId: 'system',
      costUsd,
      formattedCost: formatUsd(costUsd)
    }));

    return {
      sessionId,
      currency: 'USD',
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      formattedTotal: formatUsd(totalCostUsd),
      totalTokens,
      byAgent,
      byTask
    };
  }

  getAgentMetrics(sessionId: string, agentId: AgentId): AgentMetrics | undefined {
    return this.sessionAgentMetrics.get(sessionId)?.get(agentId);
  }

  getPricing(): Record<string, ModelPricing> {
    return {
      ...DEFAULT_MODEL_PRICING,
      ...Object.fromEntries(this.pricingOverrides)
    };
  }

  setPricingOverride(model: string, pricing: ModelPricing) {
    this.pricingOverrides.set(model.toLowerCase().trim(), pricing);
  }
}

export const costEngine = new CostEngine();
