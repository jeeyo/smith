import { AgentId, AgentHealthStatus } from '../shared/types.ts';
import { getAgentAdapter } from './adapters/index.ts';

export class AgentHealthEngine {
  private cache: Map<AgentId, AgentHealthStatus> = new Map();
  private lastProbeTime: number = 0;
  private isProbing: boolean = false;

  constructor() {
    const now = Date.now();
    const defaults: Record<AgentId, AgentHealthStatus> = {
      claude: { agentId: 'claude', name: 'Claude Code', installed: true, authenticated: true, status: 'ready', message: 'Ready', lastCheckedAt: now },
      antigravity: { agentId: 'antigravity', name: 'Google Antigravity', installed: true, authenticated: true, status: 'ready', message: 'Ready', lastCheckedAt: now },
      codex: { agentId: 'codex', name: 'OpenAI Codex', installed: true, authenticated: true, status: 'ready', message: 'Ready', lastCheckedAt: now },
      opencode: { agentId: 'opencode', name: 'OpenCode', installed: true, authenticated: true, status: 'ready', message: 'Ready', lastCheckedAt: now }
    };
    for (const [id, s] of Object.entries(defaults)) {
      this.cache.set(id as AgentId, s);
    }
    this.probeAll().catch(() => {});
  }

  public async probeAll(): Promise<Record<AgentId, AgentHealthStatus>> {
    if (this.isProbing && Date.now() - this.lastProbeTime < 5000) {
      return this.getAll();
    }

    this.isProbing = true;
    try {
      await Promise.allSettled([
        this.probeAgent('claude'),
        this.probeAgent('antigravity'),
        this.probeAgent('codex'),
        this.probeAgent('opencode')
      ]);
      this.lastProbeTime = Date.now();
    } finally {
      this.isProbing = false;
    }

    return this.getAll();
  }

  public getAll(): Record<AgentId, AgentHealthStatus> {
    const result: Record<string, AgentHealthStatus> = {};
    for (const [id, status] of this.cache.entries()) {
      result[id] = status;
    }
    return result;
  }

  public getStatus(agentId: AgentId): AgentHealthStatus | undefined {
    return this.cache.get(agentId);
  }

  public get(agentId: AgentId): AgentHealthStatus | undefined {
    return this.cache.get(agentId);
  }

  public setStatus(agentId: AgentId, status: AgentHealthStatus) {
    this.cache.set(agentId, status);
  }

  public async probeAgent(agentId: AgentId): Promise<AgentHealthStatus> {
    try {
      const adapter = getAgentAdapter(agentId);
      const status = await adapter.probeHealth();
      this.cache.set(agentId, status);
      return status;
    } catch (err: any) {
      const fallbackStatus: AgentHealthStatus = {
        agentId,
        name: agentId,
        installed: false,
        authenticated: false,
        status: 'error',
        message: err.message || 'Probe failed',
        lastCheckedAt: Date.now()
      };
      this.cache.set(agentId, fallbackStatus);
      return fallbackStatus;
    }
  }
}

export const agentHealthEngine = new AgentHealthEngine();
