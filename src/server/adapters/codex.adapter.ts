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
   * Not yet verified against a real Codex install: the MCP override keys follow Codex's
   * documented config.toml layout for HTTP servers.
   */
  async runTurn(request: TurnRequest): Promise<TurnResult> {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '-m', request.model,
      '-c', `mcp_servers.board.url=${JSON.stringify(request.mcp.url)}`,
      '-c', 'mcp_servers.board.bearer_token_env_var="SMITH_BOARD_TOKEN"',
      request.prompt
    ];
    const res = await runCli(this.getBinaryPath(), args, {
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      env: { SMITH_BOARD_TOKEN: request.mcp.token }
    });
    return plainResult('Codex', res);
  }
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
