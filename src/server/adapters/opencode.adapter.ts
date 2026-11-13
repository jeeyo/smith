import { AgentAdapter, TurnRequest, TurnResult } from './types.ts';
import { AgentHealthStatus } from '../../shared/types.ts';
import { HarnessId } from '../../shared/board.ts';
import { runCli } from '../process-utils.ts';
import { binaryInstalled, configuredBinary, versionProbe } from './shared.ts';
import { plainResult } from './codex.adapter.ts';

export class OpencodeAdapter implements AgentAdapter {
  readonly agentId: HarnessId = 'opencode';
  readonly name = 'OpenCode';

  getBinaryPath(): string {
    return configuredBinary('opencode');
  }

  isInstalled(): boolean {
    return binaryInstalled(this.getBinaryPath());
  }

  probeHealth(): Promise<AgentHealthStatus> {
    return versionProbe('opencode', this.name, this.getBinaryPath(), 'Install OpenCode, or set its path in App Settings.');
  }

  /**
   * `opencode run` with the board attached through inline config (OPENCODE_CONFIG_CONTENT),
   * which is merged over the user's own config for this run only.
   */
  async runTurn(request: TurnRequest): Promise<TurnResult> {
    const binary = this.getBinaryPath();
    const version = await runCli(binary, ['--version'], { timeoutMs: 8000 });
    const major = Number(version.stdout.match(/(?:^|\s)v?(\d+)\./)?.[1] || 1);
    const inlineConfig = {
      mcp: {
        ...Object.fromEntries(
          (request.extraMcpServers || [])
            .filter(s => s.id !== (request.mcp.name || 'board'))
            .map(s => [s.id, s.transport === 'http' ? { type: 'remote', url: s.url, headers: s.headers || {}, oauth: false, enabled: true } : { type: 'local', command: [s.command, ...s.args], environment: s.env || {}, enabled: true }])
        ),
        [request.mcp.name || 'board']: {
          type: 'remote',
          url: request.mcp.url,
          enabled: true,
          oauth: false,
          headers: request.mcp.token ? { Authorization: `Bearer ${request.mcp.token}` } : {}
        }
      },
      permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' }
    };
    // V2 normally reuses a background service, whose environment cannot receive this
    // turn's inline config or board token. A private server keeps concurrent turns apart.
    const flags = major >= 2 ? ['--standalone', '--auto'] : [];
    const res = await runCli(binary, ['run', ...flags, '--model', request.model, request.prompt], {
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(inlineConfig) }
    });
    return plainResult('OpenCode', res);
  }
}

export const opencodeAdapter = new OpencodeAdapter();
