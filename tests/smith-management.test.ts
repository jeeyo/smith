import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { app, server } from '../src/server/index.ts';
import { config } from '../src/server/config.ts';
import { scheduler } from '../src/server/scheduler.ts';
import { smithAssistant } from '../src/server/smith-assistant.ts';
import { globalSkills, resolveFor, SECRET_MASK } from '../src/server/catalog.ts';
import { oauthMcpFixture } from './fixtures/oauth-mcp.ts';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-management-'));
const repo = path.join(scratch, 'repo'); const skillDir = path.join(scratch, 'skill');
const sessions: string[] = [];
let base: string;
let fixture: Awaited<ReturnType<typeof oauthMcpFixture>>;
let client: Client;
const parse = (result: any) => JSON.parse(result.content[0].text);
async function tool(name: string, args: any = {}) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, JSON.stringify(result)).not.toBe(true); return parse(result);
}
beforeAll(async () => {
  fs.mkdirSync(repo); fs.mkdirSync(skillDir); fs.mkdirSync(path.join(skillDir, 'references'));
  fs.writeFileSync(path.join(repo, '.gitignore'), '.worktrees/\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@local', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'pipe' });
  git('init', '-b', 'main'); git('add', '.'); git('commit', '-m', 'initial'); git('branch', 'feature/review');
  git('update-ref', 'refs/remotes/origin/review', 'HEAD'); git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/review');
  fs.mkdirSync(path.join(scratch, '.hidden'));
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: review-fixture\ndescription: A complete skill package\n---\nRead references/checklist.md before reviewing.');
  fs.writeFileSync(path.join(skillDir, 'references/checklist.md'), 'Check error handling.');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  config.port = (server.address() as any).port; base = `http://127.0.0.1:${config.port}`;
  fixture = await oauthMcpFixture();
  client = new Client({ name: 'external-client', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});
afterAll(async () => {
  scheduler.stop(); await client?.close();
  for (const id of sessions) await request(app).delete(`/api/v1/sessions/${id}`);
  await fixture?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('stateless public Smith MCP and workspace selectors', () => {
  it('works with the SDK without auth or session headers and respects protocol response codes', async () => {
    const listed = await client.listTools();
    expect(listed.tools.map(t => t.name)).toEqual(expect.arrayContaining(['session_create', 'skill_install', 'mcp_connect', 'mcp_test']));
    const init = await request(app).post('/mcp').set('Accept', 'application/json, text/event-stream').send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw', version: '1' } } });
    expect(init.status).toBe(200); expect(init.headers['mcp-session-id']).toBeUndefined();
    expect((await request(app).post('/mcp').set('Accept', 'application/json, text/event-stream').send({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await request(app).get('/mcp')).status).toBe(405);
    expect((await request(app).delete('/mcp')).status).toBe(405);
    expect((await request(app).post('/mcp').set('Origin', 'https://evil.example').send({})).status).toBe(403);
    expect((await client.callTool({ name: 'session_create', arguments: { name: 'invalid' } })).isError).toBe(true);
  });
  it('browses folders and branches without changing the checkout', async () => {
    const folders = await tool('folders_list', { path: scratch });
    expect(folders.folders.find((f: any) => f.name === 'repo').isRepository).toBe(true);
    expect(folders.folders.some((f: any) => f.name === '.hidden')).toBe(false);
    expect((await tool('folders_list', { path: scratch, hidden: true })).folders.some((f: any) => f.name === '.hidden')).toBe(true);
    const branches = await tool('branches_list', { path: repo });
    expect(branches.current).toBe('main'); expect(branches.branches).toEqual(['feature/review', 'main', 'origin/review']);
    expect((await request(app).get('/api/v1/system/branches').query({ path: scratch })).status).toBe(400);
  });
  it('creates the requested branch and exact worker composition', async () => {
    const session = await tool('session_create', { name: 'MCP session', repoPath: repo, baseBranch: 'feature/review', agents: [{ agentId: 'claude', model: 'sonnet' }, { agentId: 'claude', model: 'sonnet' }, { agentId: 'codex', model: 'gpt-6.1-sol' }] });
    sessions.push(session.id);
    expect(session.worktree.baseBranch).toBe('feature/review');
    expect(Object.values(session.agents).map((a: any) => `${a.config.agentId}/${a.config.model}`)).toEqual(['claude/sonnet', 'claude/sonnet', 'codex/gpt-6.1-sol']);
    expect((await tool('session_get', { sessionId: session.id })).id).toBe(session.id);
    expect((await tool('board_read', { sessionId: session.id })).board.goal.status).toBe('idle');
  });
});

describe('third-party skill packages', () => {
  it('imports resources, enables the session, and versions resource-only updates', async () => {
    const skill = await tool('skill_install', { source: skillDir, sessionId: sessions[0] });
    expect(fs.readFileSync(path.join(skill.path, 'references/checklist.md'), 'utf8')).toContain('error handling');
    const custom = (await tool('customizations_get', { sessionId: sessions[0] })).customizations;
    expect(resolveFor(custom, 'claude-1', '/work').skills.map(s => s.id)).toContain(skill.id);
    fs.writeFileSync(path.join(skillDir, 'references/checklist.md'), 'Check cancellation too.');
    const updated = await tool('skill_install', { source: path.join(skillDir, 'SKILL.md'), sessionId: sessions[0] });
    const again = await tool('skill_install', { source: skillDir, sessionId: sessions[0] });
    expect(again.id).toBe(skill.id); expect(again.path).not.toBe(skill.path);
    expect(updated.instructions).toContain('references/checklist.md'); expect(globalSkills.get(again.id)?.path).toBe(again.path);
    expect(fs.readFileSync(path.join(skill.path, 'references/checklist.md'), 'utf8')).toContain('error handling');
  });
  it('downloads a SKILL.md URL and rejects symlink packages', async () => {
    expect((await tool('skill_install', { source: `${fixture.base}/SKILL.md`, sessionId: sessions[0] })).name).toBe('remote-fixture');
    fs.symlinkSync('/etc/hosts', path.join(skillDir, 'outside'));
    const failed = await client.callTool({ name: 'skill_install', arguments: { source: skillDir, sessionId: sessions[0] } });
    expect(failed.isError).toBe(true); expect((failed.content as any)[0].text).toContain('symlink'); fs.unlinkSync(path.join(skillDir, 'outside'));
  });
});

describe('third-party HTTP MCP with OAuth', () => {
  it('discovers, authorizes with PKCE, refreshes through the worker broker and disconnects', async () => {
    expect((await request(app).get('/api/v1/mcp/oauth/config')).body.redirectUrl).toBe(`${base}/api/v1/mcp/oauth/callback`);
    const serverId = `oauth-${process.pid}`;
    const added = await tool('mcp_add', { server: { id: serverId, name: 'OAuth fixture', transport: 'http', url: `${fixture.base}/mcp`, auth: 'oauth' } });
    expect(added.auth).toBe('oauth');
    const started = await tool('mcp_connect', { serverId, sessionId: sessions[0] });
    expect(started.status).toBe('authorization_required');
    const authorization = new URL(started.authorizationUrl); expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect((await fetch(`${base}/api/v1/mcp/oauth/callback?state=wrong&code=wrong`)).status).toBe(400);
    authorization.searchParams.set('approve', 'yes');
    const redirect = await fetch(authorization, { redirect: 'manual' }); expect(redirect.status).toBe(302);
    const callback = redirect.headers.get('location')!;
    const completed = await fetch(callback); expect(await completed.text()).toContain('Connected to Smith'); expect(completed.status).toBe(200);
    expect((await fetch(callback)).status).toBe(400);
    const status = await tool('mcp_connection', { serverId }); expect(status.status).toBe('connected'); expect(JSON.stringify(status)).not.toContain('access_token');
    const tokens = path.join(config.storageDir, 'mcp-oauth.json'); expect(fs.statSync(tokens).mode & 0o777).toBe(0o600);
    const tested = await tool('mcp_test', { serverId, sessionId: sessions[0] }); expect(tested.tools.map((t: any) => t.name)).toEqual(['echo']);
    await tool('customizations_set', { sessionId: sessions[0], mcpServers: { [serverId]: { enabled: true } } });
    const workerClient = new Client({ name: 'worker', version: '1' });
    try {
      await workerClient.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/v1/sessions/${sessions[0]}/mcp/${serverId}/proxy`)));
      const echoed = await workerClient.callTool({ name: 'echo', arguments: { text: 'OAuth broker works' } });
      expect((echoed.content as any)[0].text).toBe('OAuth broker works');
    } finally { await workerClient.close(); }
    expect(fixture.stats().refreshes).toBeGreaterThan(0); expect(fixture.stats().authorizations).toBe(1);
    expect((await tool('mcp_disconnect', { serverId })).status).toBe('disconnected');
    expect((await tool('mcp_connection', { serverId })).status).toBe('disconnected');
    expect((await client.callTool({ name: 'mcp_test', arguments: { serverId } })).isError).toBe(true);
  });
  it('connects to a third-party stdio server and passes its environment', async () => {
    const serverId = `stdio-${process.pid}`;
    const added = await tool('mcp_add', { server: { id: serverId, name: 'Stdio fixture', transport: 'stdio', command: process.execPath, args: ['--import', path.resolve('node_modules/tsx/dist/loader.mjs'), path.resolve('tests/fixtures/stdio-mcp.ts')], env: { SMITH_FIXTURE_MESSAGE: 'stdio test' } } });
    expect(added.env.SMITH_FIXTURE_MESSAGE).toBe(SECRET_MASK);
    const tested = await tool('mcp_test', { serverId });
    expect(tested.tools.map((item: any) => item.name)).toEqual(['stdio_echo']);
  });
  it('masks static credentials and rejects reserved object keys', async () => {
    const added = await tool('mcp_add', { server: { id: `static-${process.pid}`, name: 'Static headers', transport: 'http', url: `${fixture.base}/mcp`, headers: { Authorization: 'test-secret' } } });
    expect(added.headers.Authorization).toBe(SECRET_MASK);
    for (const id of ['__proto__', 'constructor', 'smith', 'board']) expect((await client.callTool({ name: 'mcp_add', arguments: { server: { id, name: id, transport: 'stdio', command: 'node' } } })).isError).toBe(true);
  });
});

describe('Ask Smith management conversation', () => {
  it('executes tools and carries a created session into the follow-up skill install', async () => {
    const original = smithAssistant.runner; let count = 0;
    smithAssistant.runner = async (_harness, turn) => {
      expect(turn.mcp.name).toBe('smith'); expect(turn.mcp.token).toBe('');
      const attached = new Client({ name: 'assistant-test', version: '1' });
      await attached.connect(new StreamableHTTPClientTransport(new URL(turn.mcp.url)));
      try {
        if (count++ === 0) {
          const created = parse(await attached.callTool({ name: 'session_create', arguments: { name: 'From prompt', repoPath: repo, baseBranch: 'feature/review', agents: [{ agentId: 'claude', model: 'sonnet' }, { agentId: 'claude', model: 'sonnet' }, { agentId: 'codex', model: 'gpt-6.1-sol' }] } }));
          sessions.push(created.id); return { ok: true, text: '**Created** the requested three-worker session.' };
        }
        expect(turn.prompt).toContain('Current session: smith-');
        const installed = await attached.callTool({ name: 'skill_install', arguments: { source: skillDir } }); expect(installed.isError).not.toBe(true);
        return { ok: true, text: 'Installed the skill in this session.' };
      } finally { await attached.close(); }
    };
    const wait = async (id: string) => {
      for (let i = 0; i < 100; i++) { const chat = smithAssistant.get(id); if (!chat.running) return chat; await new Promise(r => setTimeout(r, 20)); }
      throw new Error('Assistant did not finish.');
    };
    try {
      const first = await request(app).post('/api/v1/assistant/messages').send({ message: `start a session on feature/review branch in this folder ${repo} with 2 claude sonnets and 1 gpt 6.1 sol` });
      expect(first.status).toBe(202); const completed = await wait(first.body.id); expect(completed.error).toBeUndefined(); expect(completed.actions).toContain('session_create');
      const next = await request(app).post('/api/v1/assistant/messages').send({ chatId: completed.id, message: `install this skill ${skillDir} to this session` });
      expect(next.status).toBe(202); const installed = await wait(completed.id); expect(installed.actions).toContain('skill_install'); expect(installed.sessionId).toBe(completed.sessionId);
    } finally { smithAssistant.runner = original; }
  });
});
