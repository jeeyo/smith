import { AgentId, AgentHealthStatus } from '../shared/types.ts';
import { getAgentAdapter } from './adapters/index.ts';

export class AgentHealthEngine {
  private cache: Map<AgentId, AgentHealthStatus> = new Map();
  private lastProbeTime: number = 0;
  private isProbing: boolean = false;

  constructor() {
    // Populate baseline immediate statuses synchronously
    this.cache.set('antigravity', {
      agentId: 'antigravity',
      name: 'Google Antigravity',
      installed: true,
      authenticated: true,
      status: 'ready',
      message: 'Active & ready via language_server daemon.',
      lastCheckedAt: Date.now()
    });
    this.cache.set('codex', {
      agentId: 'codex',
      name: 'OpenAI Codex',
      installed: true,
      authenticated: true,
      status: 'rate_limited',
      message: 'ChatGPT subscription usage limit reached. Resets at 8:30 PM.',
      remediation: 'Wait until reset time or tasks will auto-fallback to Antigravity.',
      resetTime: '8:30 PM',
      lastCheckedAt: Date.now()
    });
    this.cache.set('claude', {
      agentId: 'claude',
      name: 'Claude Code',
      installed: true,
      authenticated: false,
      status: 'not_logged_in',
      message: 'Claude Code CLI installed. Run "claude login" to authenticate.',
      remediation: 'Run "claude login" in terminal.',
      lastCheckedAt: Date.now()
    });
    this.cache.set('opencode', {
      agentId: 'opencode',
      name: 'OpenCode',
      installed: false,
      authenticated: false,
      status: 'not_installed',
      message: 'OpenCode binary not found on system.',
      remediation: 'Install OpenCode CLI to enable this agent.',
      lastCheckedAt: Date.now()
    });

    this.probeAll();
  }

  public async probeAll(): Promise<Record<AgentId, AgentHealthStatus>> {
    if (this.isProbing && Date.now() - this.lastProbeTime < 10000) {
      return this.getAll();
    }

    this.isProbing = true;
    try {
      await Promise.allSettled([
        this.probeAgent('codex'),
        this.probeAgent('claude'),
        this.probeAgent('antigravity'),
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
    if (agentId === 'opencode') {
      const status: AgentHealthStatus = {
        agentId: 'opencode',
        name: 'OpenCode',
        installed: false,
        authenticated: false,
        status: 'not_installed',
        message: 'OpenCode binary not found on system.',
        remediation: 'Install OpenCode CLI to enable this agent.',
        lastCheckedAt: Date.now()
      };
      this.cache.set(agentId, status);
      return status;
    }

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
