import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentAdapter, TurnRequest, TurnResult } from './types.ts';
import { AgentHealthStatus } from '../../shared/types.ts';
import { HarnessId } from '../../shared/board.ts';
import { spawnCli } from '../process-utils.ts';
import { binaryInstalled, configuredBinary, detectNotLoggedIn, detectUsageLimit, versionProbe } from './shared.ts';

export class ClaudeAdapter implements AgentAdapter {
  readonly agentId: HarnessId = 'claude';
  readonly name = 'Claude Code';

  getBinaryPath(): string {
    return configuredBinary('claude');
  }

  isInstalled(): boolean {
    return binaryInstalled(this.getBinaryPath());
  }

  probeHealth(): Promise<AgentHealthStatus> {
    return versionProbe('claude', this.name, this.getBinaryPath(), 'Install Claude Code, or set its path in App Settings.');
  }

  /**
   * `claude -p` with the board attached through --mcp-config. The prompt goes in on stdin:
   * --mcp-config takes several values, so a positional prompt after it would be read as one.
   */
  runTurn(request: TurnRequest): Promise<TurnResult> {
    const configFile = path.join(os.tmpdir(), `smith-mcp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        mcpServers: {
          ...Object.fromEntries(
            (request.extraMcpServers || []).filter(s => s.id !== 'board').map(s => [s.id, { command: s.command, args: s.args, env: s.env || {} }])
          ),
          board: { type: 'http', url: request.mcp.url, headers: { Authorization: `Bearer ${request.mcp.token}` } }
        }
      }),
      { mode: 0o600 }
    );

    const args = [
      '-p',
      '--model', request.model,
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
      '--mcp-config', configFile
    ];

    return new Promise<TurnResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result: TurnResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { fs.rmSync(configFile, { force: true }); } catch {}
        resolve(result);
      };

      const proc = spawnCli(this.getBinaryPath(), args, { cwd: request.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        finish({ ok: false, text: stdout, timedOut: true, error: `Claude Code turn timed out after ${Math.round(request.timeoutMs / 1000)}s` });
      }, request.timeoutMs);

      proc.stdout?.on('data', d => { stdout += d.toString(); });
      proc.stderr?.on('data', d => { stderr += d.toString(); });
      proc.stdin?.on('error', () => {});
      proc.stdin?.end(request.prompt);

      proc.on('error', err => finish({ ok: false, text: '', error: err.message }));
      proc.on('close', code => finish(this.parse(code ?? 0, stdout, stderr)));
    });
  }

  private parse(code: number, stdout: string, stderr: string): TurnResult {
    let text = stdout.trim();
    let isError = code !== 0;
    let usage: TurnResult['usage'];
    let costUsd: number | undefined;

    try {
      const parsed = JSON.parse(stdout);
      // --output-format json prints one result object (or an array of events ending in it).
      const result = Array.isArray(parsed) ? parsed.reverse().find(e => e?.type === 'result') : parsed;
      if (result && typeof result === 'object') {
        text = String(result.result ?? result.error ?? text);
        isError = isError || result.is_error === true;
        if (typeof result.total_cost_usd === 'number') costUsd = result.total_cost_usd;
        const u = result.usage;
        if (u) {
          const input = Number(u.input_tokens || 0);
          const output = Number(u.output_tokens || 0);
          const cached = Number(u.cache_read_input_tokens || 0) + Number(u.cache_creation_input_tokens || 0);
          usage = { inputTokens: input, outputTokens: output, cachedTokens: cached, reasoningTokens: 0, totalTokens: input + output + cached };
        }
      }
    } catch {
      // Not JSON: the CLI failed before producing a result.
    }

    if (!isError) return { ok: true, text, usage, costUsd };

    const combined = `${text}\n${stderr}`;
    const usageLimit = detectUsageLimit(combined);
    return {
      ok: false,
      text,
      usage,
      costUsd,
      usageLimit,
      notLoggedIn: !usageLimit && detectNotLoggedIn(combined),
      error: (text || stderr || `Claude Code exited with code ${code}`).trim().slice(0, 600)
    };
  }
}

export const claudeAdapter = new ClaudeAdapter();
