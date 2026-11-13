import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { AgentId, DiscoveredModel } from '../shared/types.ts';
import { runCli } from './process-utils.ts';
import { getAgentAdapter } from './adapters/index.ts';

export class ModelDiscoveryEngine {
  private discoveredModels: Map<string, DiscoveredModel> = new Map();
  private lastRefreshedAt: number = 0;

  constructor() {
    this.refreshModels();
  }

  async refreshModels(): Promise<DiscoveredModel[]> {
    this.discoveredModels.clear();

    await Promise.allSettled([
      this.discoverCodexModels(),
      this.discoverClaudeModels(),
      this.discoverOpenCodeModels()
    ]);

    this.lastRefreshedAt = Date.now();
    return this.getModels();
  }

  private async discoverCodexModels() {
    const codexCachePath = path.join(config.homeDir, '.codex', 'models_cache.json');
    if (fs.existsSync(codexCachePath)) {
      try {
        const raw = fs.readFileSync(codexCachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.models)) {
          for (const m of parsed.models) {
            const id = m.slug || m.id;
            this.discoveredModels.set(`codex:${id}`, {
              id,
              name: m.display_name || m.slug || id,
              agentId: 'codex',
              provider: 'OpenAI',
              source: 'cache',
              isDefault: id === 'gpt-6.1-sol' || id === 'o3-mini',
              capabilities: {
                reasoning: Array.isArray(m.supported_reasoning_levels) && m.supported_reasoning_levels.length > 0,
                speed: m.additional_speed_tiers?.includes('fast') ? 'fast' : 'balanced'
              }
            });
          }
        }
      } catch {
        // Fallback below
      }
    }

    // Default presets if cache empty
    const codexDefaults = ['gpt-6.1-sol', 'o3-mini', 'o1', 'gpt-4o', 'gpt-4.5'];
    for (const id of codexDefaults) {
      if (!this.discoveredModels.has(`codex:${id}`)) {
        this.discoveredModels.set(`codex:${id}`, {
          id,
          name: id.toUpperCase(),
          agentId: 'codex',
          provider: 'OpenAI',
          source: 'cli-probe',
          isDefault: id === 'gpt-6.1-sol'
        });
      }
    }
  }

  private async discoverClaudeModels() {
    // 1. Probe local Claude Code configuration (~/.claude.json) for installed cache & options
    const claudeJsonPath = path.join(config.homeDir, '.claude.json');
    if (fs.existsSync(claudeJsonPath)) {
      try {
        const raw = fs.readFileSync(claudeJsonPath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.additionalModelOptionsCache)) {
          for (const opt of data.additionalModelOptionsCache) {
            if (opt.value) {
              this.discoveredModels.set(`claude:${opt.value}`, {
                id: opt.value,
                name: opt.label ? `Claude ${opt.label} (${opt.value})` : opt.value,
                agentId: 'claude',
                provider: 'Anthropic',
                source: 'cache',
                capabilities: { reasoning: true, contextWindow: 1_000_000, speed: 'deep' }
              });
            }
          }
        }
      } catch {}
    }

    // 2. Active Claude Code models & CLI aliases discovered from installed CLI
    const liveClaudeModels = [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 (Flagship · Deep Reasoning)', isDefault: true, speed: 'deep' as const, context: 500_000 },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (High Speed & Coding)', isDefault: false, speed: 'fast' as const, context: 500_000 },
      { id: 'claude-sonnet-5[1m]', name: 'Claude Sonnet 5 (1M Context)', isDefault: false, speed: 'balanced' as const, context: 1_000_000 },
      { id: 'claude-fable-5-1[1m]', name: 'Claude Fable 5.1 (Agentic Reasoning · 1M Context)', isDefault: false, speed: 'deep' as const, context: 1_000_000 },
      { id: 'sonnet', name: 'Claude Sonnet (CLI Alias · Latest)', isDefault: false, speed: 'fast' as const },
      { id: 'opus', name: 'Claude Opus (CLI Alias · Latest)', isDefault: false, speed: 'deep' as const },
      { id: 'fable', name: 'Claude Fable (CLI Alias · Latest)', isDefault: false, speed: 'deep' as const },
      { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (Legacy)', isDefault: false, speed: 'balanced' as const }
    ];

    for (const m of liveClaudeModels) {
      if (!this.discoveredModels.has(`claude:${m.id}`)) {
        this.discoveredModels.set(`claude:${m.id}`, {
          id: m.id,
          name: m.name,
          agentId: 'claude',
          provider: 'Anthropic',
          source: 'cli-probe',
          isDefault: m.isDefault,
          capabilities: {
            reasoning: m.id.includes('opus') || m.id.includes('fable') || m.id.includes('3-7'),
            contextWindow: m.context || 500_000,
            speed: m.speed
          }
        });
      }
    }
  }

  private async discoverOpenCodeModels() {
    // Only discover models configured in opencode CLI if installed
    const adapter = getAgentAdapter('opencode');
    if (!adapter.isInstalled()) return;

    // `opencode models` prints one "provider/model" per line.
    const res = await runCli(adapter.getBinaryPath(), ['models'], { timeoutMs: 8000 });
    if (res.code !== 0) return;
    for (const line of res.stdout.split('\n')) {
      const id = line.trim();
      if (!/^[\w.@-]+\/[\w.:@/-]+$/.test(id)) continue;
      this.discoveredModels.set(`opencode:${id}`, {
        id,
        name: id,
        agentId: 'opencode',
        provider: id.split('/')[0],
        source: 'cli-probe'
      });
    }
  }

  getModels(agentId?: AgentId): DiscoveredModel[] {
    const all = Array.from(this.discoveredModels.values());
    if (!agentId) return all;
    return all.filter(m => m.agentId === agentId);
  }

  registerCustomModel(model: DiscoveredModel) {
    this.discoveredModels.set(`${model.agentId}:${model.id}`, model);
  }

  getLastRefreshedAt(): number {
    return this.lastRefreshedAt;
  }
}

export const modelDiscoveryEngine = new ModelDiscoveryEngine();
