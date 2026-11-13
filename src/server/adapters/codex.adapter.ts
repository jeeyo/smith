import type { ResolvedServer } from '../catalog.ts';
import { AgentAdapter, TurnRequest, TurnResult } from './types.ts';
import { AgentHealthStatus } from '../../shared/types.ts';
import { HarnessId } from '../../shared/board.ts';
import { runCli } from '../process-utils.ts';
import { binaryInstalled, configuredBinary, detectNotLoggedIn, detectUsageLimit, versionProbe } from './shared.ts';

export class CodexAdapter implements AgentAdapter {
  readonly agentId: HarnessId = 'codex';
  readonly name = 'OpenAI Codex';

  getBinaryPath(): string {
    return configuredBinary('codex');
  }

  isInstalled(): boolean {
    return binaryInstalled(this.getBinaryPath());
  }

  probeHealth(): Promise<AgentHealthStatus> {
    return versionProbe('codex', this.name, this.getBinaryPath(), 'Install the Codex CLI, or set its path in App Settings.');
  }

  /**
   * `codex exec` with the board attached through per-run config overrides. The bearer token is
   * passed in an environment variable so it never appears in the process arguments.
   *
   * Managed approval keeps the worker inside Codex's workspace sandbox and honors local
   * requirements instead of asking to disable protections for the whole machine.
   */
  async runTurn(request: TurnRequest): Promise<TurnResult> {
    const env: Record<string, string> = {};
    const name = request.mcp.name || 'board';
    if (request.mcp.token) env.SMITH_BOARD_TOKEN = request.mcp.token;
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--approve-for-me',
      '-m', request.model,
      '-c', `mcp_servers.${name}.url=${JSON.stringify(request.mcp.url)}`,
      ...(request.mcp.token ? ['-c', `mcp_servers.${name}.bearer_token_env_var="SMITH_BOARD_TOKEN"`] : []),
      ...extraServerOverrides((request.extraMcpServers || []).filter(s => s.id !== name), env),
      request.prompt
    ];
    const res = await runCli(this.getBinaryPath(), args, {
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      env
    });
    return plainResult('Codex', res);
  }
}

/**
 * Codex reads MCP servers from config.toml; `-c key=value` overrides take TOML values. JSON
 * strings and string arrays are valid TOML, and an inline table carries the environment.
 * Values passed this way are visible in the process list, like the rest of the arguments.
 */
export function extraServerOverrides(servers: ResolvedServer[], environment: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (const s of servers) {
    if (s.id === 'board' || !/^[A-Za-z0-9_-]+$/.test(s.id)) continue;
    if (s.transport === 'http') {
      out.push('-c', `mcp_servers.${s.id}.url=${JSON.stringify(s.url)}`);
      const headers = Object.entries(s.headers || {}).map(([key, value], index) => {
        const variable = `SMITH_MCP_${s.id.replace(/-/g, '_')}_${index}`;
        environment[variable] = value;
        return `${JSON.stringify(key)}=${JSON.stringify(variable)}`;
      });
      if (headers.length) out.push('-c', `mcp_servers.${s.id}.env_http_headers={${headers.join(',')}}`);
      continue;
    }
    out.push('-c', `mcp_servers.${s.id}.command=${JSON.stringify(s.command)}`);
    out.push('-c', `mcp_servers.${s.id}.args=${JSON.stringify(s.args || [])}`);
    if (s.env && Object.keys(s.env).length > 0) {
      const table = Object.entries(s.env).map(([k, v]) => `${JSON.stringify(k)}=${JSON.stringify(v)}`).join(',');
      out.push('-c', `mcp_servers.${s.id}.env={${table}}`);
    }
  }
  return out;
}

export function plainResult(name: string, res: { stdout: string; stderr: string; code: number; timedOut: boolean; spawnError?: string }): TurnResult {
  const text = res.stdout.trim();
  if (res.code === 0) return { ok: true, text };
  if (res.timedOut) return { ok: false, text, timedOut: true, error: `${name} turn timed out` };
  const combined = `${res.stdout}\n${res.stderr}`;
  const usageLimit = detectUsageLimit(combined);
  return {
    ok: false,
    text,
    usageLimit,
    notLoggedIn: !usageLimit && detectNotLoggedIn(combined),
    error: (res.spawnError || res.stderr.trim() || text || `${name} exited with code ${res.code}`).slice(0, 600)
  };
}

export const codexAdapter = new CodexAdapter();
