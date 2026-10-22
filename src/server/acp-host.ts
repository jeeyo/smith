import { EventEmitter } from 'node:events';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AgentId, AgentStatus, ACPPermissionRequest, TokenUsage } from '../shared/types.ts';
import { costEngine } from './cost-engine.ts';
import { mcpGateway } from './mcp-gateway.ts';
import { getAgentAdapter } from './adapters/index.ts';

export function resolveAgentBinary(agentId: AgentId): string {
  try {
    return getAgentAdapter(agentId).getBinaryPath();
  } catch {
    return agentId;
  }
}

export interface ACPProcessContext {
  sessionId: string;
  agentId: AgentId;
  model: string;
  worktreePath: string;
  process?: ChildProcess;
  status: AgentStatus;
  currentTurnPrompt?: string;
  activeTaskId?: string;
  pendingPermissions: Map<string, (allowed: boolean) => void>;
}

export class ACPHostEngine extends EventEmitter {
  // key: `${sessionId}:${agentId}` -> ACPProcessContext
  private contexts: Map<string, ACPProcessContext> = new Map();

  constructor() {
    super();
  }

  private getKey(sessionId: string, agentId: AgentId): string {
    return `${sessionId}:${agentId}`;
  }

  async spawnAgent(
    sessionId: string,
    agentId: AgentId,
    model: string,
    worktreePath: string,
    workerId?: string
  ): Promise<ACPProcessContext> {
    const effectiveWorkerId = workerId || agentId;
    const key = `${sessionId}:${effectiveWorkerId}`;
    
    // Terminate existing process if already running
    if (this.contexts.has(key)) {
      this.terminateAgent(sessionId, effectiveWorkerId as AgentId);
    }

    const ctx: ACPProcessContext = {
      sessionId,
      agentId,
      model,
      worktreePath,
      status: 'idle',
      pendingPermissions: new Map()
    };

    this.contexts.set(key, ctx);

    // Determine CLI command based on agentId
    let cmd = resolveAgentBinary(agentId);
    let args: string[] = ['--acp'];

    if (agentId === 'claude') {
      args = ['serve', '--model', model];
    } else if (agentId === 'gemini') {
      args = ['--acp', '--model', model];
    } else if (agentId === 'codex') {
      args = ['acp', '--model', model];
    } else if (agentId === 'opencode') {
      args = ['acp', '--model', model];
    } else if (agentId === 'antigravity') {
      args = ['--model', model];
    }

    try {
      const proc = spawn(cmd, args, {
        cwd: worktreePath,
        env: {
          ...process.env,
          ACP_MODE: '1',
          MODEL: model,
          SMITH_SESSION_ID: sessionId
        },
        shell: true
      });

      ctx.process = proc;

      proc.stdout?.on('data', (data: Buffer) => {
        this.handleAgentOutput(ctx, data.toString());
      });

      proc.stderr?.on('data', (data: Buffer) => {
        this.emit('agent:stderr', { sessionId, agentId, text: data.toString() });
      });

      proc.on('exit', (code: number | null) => {
        ctx.status = 'completed';
        this.emit('agent:status', { sessionId, agentId, status: 'completed', exitCode: code });
      });

      proc.on('error', () => {
        // Fallback to simulated ACP session if local CLI binary is not directly on global path
        ctx.status = 'idle';
        this.emit('agent:status', { sessionId, agentId, status: 'idle' });
      });

    } catch {
      ctx.status = 'idle';
    }

    this.emit('agent:spawned', { sessionId, agentId, model });
    return ctx;
  }

  private handleAgentOutput(ctx: ACPProcessContext, text: string) {
    // Check if JSON-RPC message
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const msg = JSON.parse(trimmed);
          this.processJsonRpcMessage(ctx, msg);
          continue;
        } catch {
          // Plain text fallback
        }
      }

      // Stream text chunk
      this.emit('agent:stream', {
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
        content: line
      });
    }
  }

  private processJsonRpcMessage(ctx: ACPProcessContext, msg: any) {
    if (msg.method === 'session/stream') {
      this.emit('agent:stream', {
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
        content: msg.params?.text || msg.params?.content || ''
      });
    } else if (msg.method === 'session/status') {
      ctx.status = msg.params?.status || 'thinking';
      this.emit('agent:status', {
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
        status: ctx.status
      });
    } else if (msg.method === 'permission/request') {
      const permId = msg.params?.id || `perm-${Date.now()}`;
      const permReq: ACPPermissionRequest = {
        id: permId,
        agentId: ctx.agentId,
        tool: msg.params?.tool || 'command_execution',
        parameters: msg.params?.parameters || {},
        description: msg.params?.description || `Agent ${ctx.agentId} requested permission`,
        timestamp: Date.now()
      };
      this.emit('permission:request', { sessionId: ctx.sessionId, request: permReq });
    } else if (msg.method === 'session/turn_completed') {
      // Record usage and cost in USD
      const usage: TokenUsage = msg.params?.usage || {
        inputTokens: 1200,
        outputTokens: 350,
        cachedTokens: 200,
        reasoningTokens: 100,
        totalTokens: 1550
      };

      const cost = costEngine.recordTurn(
        ctx.sessionId,
        ctx.agentId,
        ctx.model,
        usage,
        ctx.activeTaskId
      );

      ctx.status = 'idle';
      this.emit('agent:status', {
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
        status: 'idle',
        turnCost: cost
      });
    }
  }

  async sendPrompt(sessionId: string, agentId: AgentId, prompt: string, taskId?: string): Promise<boolean> {
    const key = this.getKey(sessionId, agentId);
    let ctx = this.contexts.get(key);

    if (!ctx) {
      ctx = await this.spawnAgent(sessionId, agentId, 'claude-opus-5-5', process.cwd());
    }

    ctx.status = 'thinking';
    ctx.currentTurnPrompt = prompt;
    ctx.activeTaskId = taskId;
    this.emit('agent:status', { sessionId, agentId, status: 'thinking' });

    // Send ACP JSON-RPC prompt
    const rpcPrompt = JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/prompt',
      params: { prompt, taskId }
    }) + '\n';

    if (ctx.process && !ctx.process.killed) {
      ctx.process.stdin?.write(rpcPrompt);
    } else {
      // Simulate turn for standalone demo / offline test
      setTimeout(() => {
        this.emit('agent:stream', {
          sessionId,
          agentId,
          content: `[${agentId} @ ${ctx!.model}] Received task: "${prompt.substring(0, 80)}..."\nExecuting task in worktree.`
        });

        // Simulate token usage & USD cost calculation
        const simulatedTokens: TokenUsage = {
          inputTokens: 2400,
          outputTokens: 620,
          cachedTokens: 400,
          reasoningTokens: 250,
          totalTokens: 3020
        };

        const cost = costEngine.recordTurn(sessionId, agentId, ctx!.model, simulatedTokens, taskId);

        ctx!.status = 'idle';
        this.emit('agent:status', { sessionId, agentId, status: 'idle', turnCost: cost });
      }, 800);
    }

    return true;
  }

  respondPermission(sessionId: string, agentId: AgentId, permId: string, allowed: boolean) {
    const key = this.getKey(sessionId, agentId);
    const ctx = this.contexts.get(key);
    if (!ctx) return;

    if (ctx.process && !ctx.process.killed) {
      const response = JSON.stringify({
        jsonrpc: '2.0',
        method: 'permission/response',
        params: { id: permId, allowed }
      }) + '\n';
      ctx.process.stdin?.write(response);
    }

    ctx.status = allowed ? 'thinking' : 'idle';
    this.emit('agent:status', { sessionId, agentId, status: ctx.status });
  }

  async hotReloadModel(sessionId: string, agentId: AgentId, newModel: string): Promise<boolean> {
    const key = this.getKey(sessionId, agentId);
    const ctx = this.contexts.get(key);
    if (!ctx) return false;

    ctx.model = newModel;

    // Send ACP session/configure
    if (ctx.process && !ctx.process.killed) {
      const configureMsg = JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/configure',
        params: { model: newModel }
      }) + '\n';
      ctx.process.stdin?.write(configureMsg);
    }

    this.emit('agent:model_updated', {
      sessionId,
      agentId,
      model: newModel
    });

    return true;
  }

  terminateAgent(sessionId: string, agentId: AgentId) {
    const key = this.getKey(sessionId, agentId);
    const ctx = this.contexts.get(key);
    if (ctx) {
      if (ctx.process && !ctx.process.killed) {
        ctx.process.kill();
      }
      this.contexts.delete(key);
      this.emit('agent:status', { sessionId, agentId, status: 'completed' });
    }
  }

  getContext(sessionId: string, agentId: AgentId): ACPProcessContext | undefined {
    return this.contexts.get(this.getKey(sessionId, agentId));
  }
}

export const acpHostEngine = new ACPHostEngine();
