import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';
import { detectNotLoggedIn, detectUsageLimit } from '../src/server/adapters/shared.ts';
import { issueTurnToken, revokeTurnToken } from '../src/server/mcp-server.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/server/config.ts';
import { OpencodeAdapter } from '../src/server/adapters/opencode.adapter.ts';
import { ClaudeAdapter } from '../src/server/adapters/claude.adapter.ts';
import { CodexAdapter } from '../src/server/adapters/codex.adapter.ts';
import { CursorAdapter, parseResult } from '../src/server/adapters/cursor.adapter.ts';

afterAll(() => {
  server.close();
});

describe('usage-limit detection', () => {
  const now = new Date('2026-11-13T10:00:00').getTime();

  it('reads an epoch reset time', () => {
    const hit = detectUsageLimit('Claude AI usage limit reached|1763049600', now)!;
    expect(hit.resetAt).toBe(1763049600 * 1000);
  });

  it('reads a clock time, rolling to tomorrow when it has passed', () => {
    const later = detectUsageLimit("You've hit your usage limit. Try again at 8:30 PM.", now)!;
    expect(new Date(later.resetAt!).getHours()).toBe(20);
    expect(new Date(later.resetAt!).getMinutes()).toBe(30);
    expect(later.resetAt!).toBeGreaterThan(now);

    const earlier = detectUsageLimit('5-hour limit reached ∙ resets 3am', now)!;
    expect(new Date(earlier.resetAt!).getHours()).toBe(3);
    expect(earlier.resetAt! - now).toBeGreaterThan(0);
    expect(earlier.resetAt! - now).toBeLessThan(24 * 3600_000);
  });

  it('reads a duration', () => {
    const hit = detectUsageLimit('Rate limit exceeded. Please try again in 2 hours 15 minutes.', now)!;
    expect(hit.resetAt).toBe(now + 135 * 60_000);
    expect(detectUsageLimit('usage limit reached, resets in 45 minutes', now)!.resetAt).toBe(now + 45 * 60_000);
    expect(detectUsageLimit('usage limit reached while working in src/', now)!.resetAt).toBeUndefined();
  });

  it('reports a limit without a reset time when none is given', () => {
    const hit = detectUsageLimit('Error: quota exceeded for this account', now)!;
    expect(hit.message).toContain('quota exceeded');
    expect(hit.resetAt).toBeUndefined();
  });

  it('does not mistake ordinary failures for limits', () => {
    expect(detectUsageLimit('TypeError: cannot read properties of undefined', now)).toBeUndefined();
    expect(detectUsageLimit('Tests failed: 3 of 10', now)).toBeUndefined();
  });

  it('recognises a logged-out CLI', () => {
    expect(detectNotLoggedIn('Not logged in · Please run /login')).toBe(true);
    expect(detectNotLoggedIn('OAuth token has expired')).toBe(true);
    expect(detectNotLoggedIn('wrote 3 files')).toBe(false);
  });
});

describe('MCP handshake', () => {
  const rpc = (token: string, body: unknown) => request(app).post('/mcp/board').set('Authorization', `Bearer ${token}`).send(body);

  it('initialises, lists tools, ignores notifications, and stops accepting a revoked token', async () => {
    const token = issueTurnToken({ sessionId: 'none', peerId: 'p' });

    const init = await rpc(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe('2025-03-26');
    expect(init.body.result.capabilities.tools).toBeDefined();

    const note = await rpc(token, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(note.status).toBe(202);

    const list = await rpc(token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const names = list.body.result.tools.map((t: any) => t.name);
    expect(names).toHaveLength(14);
    for (const tool of list.body.result.tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.description.length).toBeGreaterThan(10);
    }

    // A tool error comes back as a tool result the agent can read, not a transport failure.
    const call = await rpc(token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'board_read', arguments: {} } });
    expect(call.status).toBe(200);
    expect(call.body.result.isError).toBe(true);

    const unknown = await rpc(token, { jsonrpc: '2.0', id: 4, method: 'does/not/exist' });
    expect(unknown.body.error.code).toBe(-32601);

    expect((await request(app).get('/mcp/board')).status).toBe(405);

    revokeTurnToken(token);
    expect((await rpc(token, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).status).toBe(401);
  });
});

describe('OpenCode turns', () => {
  it('uses a private V2 server so each concurrent turn receives its own board credentials', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-opencode-'));
    const binary = path.join(dir, 'opencode');
    fs.writeFileSync(binary, `#!${process.execPath}
if (process.argv.includes('--version')) console.log('opencode v2.0.0');
else console.log(JSON.stringify({ args: process.argv.slice(2), config: JSON.parse(process.env.OPENCODE_CONFIG_CONTENT) }));
`, { mode: 0o700 });
    const previous = config.agentBinaries.opencode;
    config.agentBinaries.opencode = binary;
    try {
      const adapter = new OpencodeAdapter();
      const results = await Promise.all(['first', 'second'].map(token => adapter.runTurn({
        cwd: dir, model: 'agoda/glm-5.2', prompt: 'Use the board.', timeoutMs: 3000,
        mcp: { url: 'http://127.0.0.1:4100/mcp', token }
      })));
      for (const [index, result] of results.entries()) {
        expect(result.ok).toBe(true);
        const run = JSON.parse(result.text);
        expect(run.args).toContain('--standalone');
        expect(run.args).toContain('--auto');
        expect(run.args).toContain('agoda/glm-5.2');
        expect(run.config.mcp.board.headers.Authorization).toBe(`Bearer ${['first', 'second'][index]}`);
      }
    } finally {
      config.agentBinaries.opencode = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Codex turns', () => {
  it('uses managed approval and keeps the board token out of command arguments', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-codex-'));
    const binary = path.join(dir, 'codex');
    fs.writeFileSync(binary, `#!${process.execPath}
console.log(JSON.stringify({args: process.argv.slice(2), token: process.env.SMITH_BOARD_TOKEN}));
`, { mode: 0o700 });
    const previous = config.agentBinaries.codex;
    config.agentBinaries.codex = binary;
    try {
      const result = await new CodexAdapter().runTurn({
        cwd: dir, model: 'gpt-6.1-sol', prompt: 'Review.', timeoutMs: 3000,
        mcp: { url: 'http://127.0.0.1:4100/mcp', token: 'test-board-token' }
      });
      expect(result.ok).toBe(true);
      const run = JSON.parse(result.text);
      expect(run.args).toContain('--approve-for-me');
      expect(run.args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
      expect(JSON.stringify(run.args)).not.toContain('test-board-token');
      expect(run.token).toBe('test-board-token');
    } finally {
      config.agentBinaries.codex = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Cursor CLI turns', () => {
  // Stands in for cursor-agent: reads the plugin's .mcp.json and resolves ${env:NAME} like the CLI.
  const fake = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
if (process.env.FAKE_FAIL) { console.error('Error: not logged in. Please run cursor-agent login'); process.exit(1); }
const dir = args[args.indexOf('--plugin-dir') + 1];
const raw = fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8');
const resolved = JSON.parse(raw.replace(/\\$\\{env:([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_, n) => process.env[n] || ''));
const plugin = JSON.parse(fs.readFileSync(path.join(dir, '.cursor-plugin', 'plugin.json'), 'utf8'));
console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify({ args, raw, resolved, plugin, dir }) }));
`;

  async function withFake<T>(run: (dir: string) => Promise<T>): Promise<T> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-cursor-test-'));
    const binary = path.join(dir, 'cursor-agent');
    fs.writeFileSync(binary, fake, { mode: 0o700 });
    const previous = config.agentBinaries.cursor;
    config.agentBinaries.cursor = binary;
    try { return await run(dir); } finally {
      config.agentBinaries.cursor = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('attaches the board through a per-turn plugin and keeps secrets out of arguments and files', async () => {
    await withFake(async dir => {
      const result = await new CursorAdapter().runTurn({
        cwd: dir, model: 'auto', prompt: '-starts with a dash', timeoutMs: 5000,
        mcp: { url: 'http://127.0.0.1:4100/mcp', token: 'test-board-token' },
        extraMcpServers: [
          { id: 'remote', transport: 'http', command: '', args: [], url: 'http://127.0.0.1:4100/proxy', headers: { 'X-Test': 'private-header' } },
          { id: 'local', transport: 'stdio', command: 'node', args: ['server.js'], env: { API_KEY: 'private-env' } }
        ]
      });
      expect(result.ok).toBe(true);
      const run = JSON.parse(result.text);
      expect(run.args).toEqual(expect.arrayContaining(['-p', '--output-format', 'stream-json', '--force', '--trust', '--approve-mcps', '--workspace', dir]));
      expect(run.args.slice(-2)).toEqual(['--', '-starts with a dash']);
      expect(run.plugin.name).toBe('smith-turn');
      expect(run.resolved.mcpServers.board.headers.Authorization).toBe('Bearer test-board-token');
      expect(run.resolved.mcpServers.remote.headers['X-Test']).toBe('private-header');
      expect(run.resolved.mcpServers.local).toMatchObject({ command: 'node', args: ['server.js'], env: { API_KEY: 'private-env' } });
      for (const secret of ['test-board-token', 'private-header', 'private-env']) {
        expect(run.raw).not.toContain(secret);
        expect(run.args.join(' ')).not.toContain(secret);
      }
      expect(fs.existsSync(run.dir)).toBe(false);
    });
  });

  it('gives concurrent turns their own board credentials', async () => {
    await withFake(async dir => {
      const results = await Promise.all(['first', 'second'].map(token => new CursorAdapter().runTurn({
        cwd: dir, model: 'auto', prompt: 'Use the board.', timeoutMs: 5000, mcp: { url: 'http://127.0.0.1:4100/mcp', token }
      })));
      expect(results.map(r => JSON.parse(r.text).resolved.mcpServers.board.headers.Authorization)).toEqual(['Bearer first', 'Bearer second']);
    });
  });

  it('keeps the final assistant message rather than the joined result text', () => {
    const lines = [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [{ type: 'text', text: "I'll call the tool." }] } },
      { type: 'tool_call', subtype: 'completed' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'PINEAPPLE-42' }] } },
      { type: 'result', subtype: 'success', is_error: false, result: "I'll call the tool.PINEAPPLE-42" }
    ].map(e => JSON.stringify(e)).join('\n');
    expect(parseResult({ stdout: lines, stderr: '', code: 0, timedOut: false })).toEqual({ ok: true, text: 'PINEAPPLE-42' });
    const cut = parseResult({ stdout: lines.split('\n').slice(0, 2).join('\n'), stderr: 'Error: connection lost', code: 1, timedOut: false });
    expect(cut.ok).toBe(false);
    expect(cut.error).toContain('connection lost');
  });

  it('reports a logged-out CLI', async () => {
    await withFake(async dir => {
      process.env.FAKE_FAIL = '1';
      try {
        const result = await new CursorAdapter().runTurn({ cwd: dir, model: 'auto', prompt: 'x', timeoutMs: 5000, mcp: { url: 'http://127.0.0.1:4100/mcp', token: 't' } });
        expect(result.ok).toBe(false);
        expect(result.notLoggedIn).toBe(true);
      } finally { delete process.env.FAKE_FAIL; }
    });
  });
});

describe('HTTP MCP configuration across harnesses', () => {
  it('attaches public Smith and third-party HTTP tools in all three native config formats', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-http-adapters-'));
    const binary = path.join(dir, 'capture');
    fs.writeFileSync(binary, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.3.0'); process.exit(0); }
const configIndex = args.indexOf('--mcp-config');
console.log(JSON.stringify({ args, config: configIndex >= 0 ? JSON.parse(fs.readFileSync(args[configIndex+1], 'utf8')) : process.env.OPENCODE_CONFIG_CONTENT ? JSON.parse(process.env.OPENCODE_CONFIG_CONTENT) : undefined, headers: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('SMITH_MCP_'))) }));
`, { mode: 0o700 });
    const previous = { ...config.agentBinaries };
    config.agentBinaries = { claude: binary, codex: binary, opencode: binary };
    const turn = { cwd: dir, model: 'test', prompt: 'Use Smith tools.', timeoutMs: 5000, mcp: { name: 'smith' as const, token: '', url: 'http://127.0.0.1:4100/mcp' }, extraMcpServers: [{ id: 'remote', transport: 'http' as const, command: '', args: [], url: 'http://127.0.0.1:4100/proxy', headers: { 'X-Test': 'private-test-value' } }] };
    try {
      const claude = JSON.parse((await new ClaudeAdapter().runTurn(turn)).text);
      expect(claude.config.mcpServers.smith.headers).toEqual({}); expect(claude.config.mcpServers.remote.type).toBe('http');
      const opencode = JSON.parse((await new OpencodeAdapter().runTurn(turn)).text);
      expect(opencode.config.mcp.smith.oauth).toBe(false); expect(opencode.config.mcp.remote.type).toBe('remote');
      const codex = JSON.parse((await new CodexAdapter().runTurn(turn)).text);
      expect(codex.args).toContain('mcp_servers.smith.url="http://127.0.0.1:4100/mcp"');
      expect(codex.args.join(' ')).not.toContain('private-test-value'); expect(codex.headers.SMITH_MCP_remote_0).toBe('private-test-value');
    } finally { config.agentBinaries = previous; fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
