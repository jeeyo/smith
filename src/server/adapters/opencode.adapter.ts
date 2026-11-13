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
    const inlineConfig = {
      mcp: {
        ...Object.fromEntries(
          (request.extraMcpServers || [])
            .filter(s => s.id !== 'board')
            .map(s => [s.id, { type: 'local', command: [s.command, ...s.args], environment: s.env || {}, enabled: true }])
        ),
        board: {
          type: 'remote',
          url: request.mcp.url,
          enabled: true,
          headers: { Authorization: `Bearer ${request.mcp.token}` }
        }
      },
      permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' }
    };
    const res = await runCli(this.getBinaryPath(), ['run', '--model', request.model, request.prompt], {
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(inlineConfig) }
    });
    return plainResult('OpenCode', res);
  }
}

export const opencodeAdapter = new OpencodeAdapter();
