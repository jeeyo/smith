import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentAdapter, TurnRequest, TurnResult } from './types.ts';
import { AgentHealthStatus } from '../../shared/types.ts';
import { HarnessId } from '../../shared/board.ts';
import { runCli } from '../process-utils.ts';
import { binaryInstalled, configuredBinary, versionProbe } from './shared.ts';
import { plainResult } from './codex.adapter.ts';

export class CursorAdapter implements AgentAdapter {
  readonly agentId: HarnessId = 'cursor';
  readonly name = 'Cursor CLI';

  getBinaryPath(): string {
    return configuredBinary('cursor');
  }

  isInstalled(): boolean {
    return binaryInstalled(this.getBinaryPath());
  }

  probeHealth(): Promise<AgentHealthStatus> {
    return versionProbe('cursor', this.name, this.getBinaryPath(), 'Install the Cursor CLI (curl https://cursor.com/install -fsS | bash), or set its path in App Settings.');
  }

  /**
   * `cursor-agent -p` with the board attached through a throwaway local plugin (--plugin-dir).
   * The CLI has no per-run MCP flag, and writing .cursor/mcp.json would race between workers
   * sharing a worktree. Secrets are referenced as ${env:NAME}, so the file holds none.
   */
  async runTurn(request: TurnRequest): Promise<TurnResult> {
    const env: Record<string, string> = {};
    const pluginDir = writeTurnPlugin(request, env);
    try {
      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--model', request.model,
        '--force',
        '--trust',
        '--approve-mcps',
        '--workspace', request.cwd,
        '--plugin-dir', pluginDir,
        '--',
        request.prompt
      ];
      const res = await runCli(this.getBinaryPath(), args, {
        cwd: request.cwd,
        timeoutMs: request.timeoutMs,
        env,
        signal: request.signal
      });
      return parseResult(res);
    } finally {
      try { fs.rmSync(pluginDir, { recursive: true, force: true }); } catch {}
    }
  }
}

/** Writes a plugin whose .mcp.json carries the board and the session's extra servers. */
export function writeTurnPlugin(request: TurnRequest, env: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-cursor-'));
  const name = request.mcp.name || 'board';
  const secret = (variable: string, value: string) => {
    env[variable] = value;
    return `\${env:${variable}}`;
  };

  const servers: Record<string, unknown> = {};
  for (const [n, s] of (request.extraMcpServers || []).entries()) {
    if (s.id === name) continue;
    if (s.transport === 'http') {
      servers[s.id] = {
        url: s.url,
        headers: Object.fromEntries(Object.entries(s.headers || {}).map(([key, value], i) => [key, secret(`SMITH_MCP_${n}_H${i}`, value)]))
      };
    } else {
      servers[s.id] = {
        command: s.command,
        args: s.args || [],
        env: Object.fromEntries(Object.entries(s.env || {}).map(([key, value], i) => [key, secret(`SMITH_MCP_${n}_E${i}`, value)]))
      };
    }
  }
  servers[name] = {
    url: request.mcp.url,
    headers: request.mcp.token ? { Authorization: `Bearer ${secret('SMITH_BOARD_TOKEN', request.mcp.token)}` } : {}
  };

  fs.mkdirSync(path.join(dir, '.cursor-plugin'));
  fs.writeFileSync(path.join(dir, '.cursor-plugin', 'plugin.json'), JSON.stringify({ name: 'smith-turn' }), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: servers }), { mode: 0o600 });
  return dir;
}

/**
 * stream-json prints one event per line and ends with a result event on success. The result's
 * text joins every assistant message, so the last assistant message is kept instead.
 */
export function parseResult(res: Parameters<typeof plainResult>[1]): TurnResult {
  let result: any;
  let last = '';
  for (const line of res.stdout.split('\n')) {
    let event: any;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'assistant') {
      const text = (event.message?.content || []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('').trim();
      if (text) last = text;
    } else if (event?.type === 'result') {
      result = event;
    }
  }
  if (!result) return plainResult('Cursor CLI', { ...res, stdout: last || res.stdout });
  const text = last || String(result.result ?? '').trim();
  if (res.code === 0 && result.is_error !== true) return { ok: true, text };
  return plainResult('Cursor CLI', { ...res, stdout: text, code: res.code || 1 });
}

export const cursorAdapter = new CursorAdapter();
