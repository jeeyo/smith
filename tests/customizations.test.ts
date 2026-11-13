import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';
import { scheduler } from '../src/server/scheduler.ts';
import { boardStore } from '../src/server/board-store.ts';
import { agentHealthEngine } from '../src/server/agent-health.ts';
import { config } from '../src/server/config.ts';
import { resolveFor, SECRET_MASK, addSkill, globalSkills } from '../src/server/catalog.ts';
import { extraServerOverrides } from '../src/server/adapters/codex.adapter.ts';
import { TurnRequest } from '../src/server/adapters/index.ts';
import { SessionCustomizations } from '../src/shared/types.ts';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-custom-'));

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(scratch, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@l', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'pipe' });
  git('init', '-b', 'main');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.worktrees/\n');
  fs.mkdirSync(path.join(repo, 'docs'));
  fs.writeFileSync(
    path.join(repo, 'docs/spec.md'),
    '# Two cards\n\n```smith-tasks\n' +
      JSON.stringify({ tasks: [
        { title: 'One', description: '1', acceptance: ['1'], fileScope: ['one.txt'] },
        { title: 'Two', description: '2', acceptance: ['2'], fileScope: ['two.txt'] }
      ] }) +
      '\n```\n'
  );
  git('add', '.');
  git('commit', '-m', 'base');
  return repo;
}

beforeAll(() => {
  for (const harness of ['claude', 'codex', 'opencode']) {
    agentHealthEngine.setStatus(harness, { agentId: harness, name: harness, installed: true, authenticated: true, status: 'ready', message: 'ok', lastCheckedAt: Date.now() });
  }
});

afterAll(() => {
  scheduler.stop();
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('resolving skills and servers for one worker', () => {
  const custom: SessionCustomizations = {
    skills: ['code-review', 'api-design'],
    plugins: [],
    mcpServers: {
      filesystem: { id: 'filesystem', name: 'Filesystem', command: 'npx', args: [], enabled: true },
      github: { id: 'github', name: 'GitHub', command: 'npx', args: [], enabled: true, values: { GITHUB_TOKEN: 'tok-123' } },
      postgres: { id: 'postgres', name: 'PostgreSQL', command: 'npx', args: [], enabled: true }
    },
    targets: { 'skill:api-design': ['w2'], 'mcp:github': ['w1'] }
  };

  it('applies targets, fills ${WORKDIR} and input values, and leaves out servers missing an input', () => {
    const w1 = resolveFor(custom, 'w1', '/work/c3');
    expect(w1.skills.map(s => s.id)).toEqual(['code-review']);
    const fsServer = w1.mcpServers.find(s => s.id === 'filesystem')!;
    expect(fsServer.args[fsServer.args.length - 1]).toBe('/work/c3');
    expect(w1.mcpServers.find(s => s.id === 'github')!.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: 'tok-123' });
    expect(w1.mcpServers.find(s => s.id === 'postgres')).toBeUndefined();

    const w2 = resolveFor(custom, 'w2', '/work/c4');
    expect(w2.skills.map(s => s.id).sort()).toEqual(['api-design', 'code-review']);
    expect(w2.mcpServers.map(s => s.id)).toEqual(['filesystem']);
  });

  it('expands a plugin into its skills and servers', () => {
    const viaPlugin = resolveFor(
      { skills: [], plugins: ['fullstack-pack'], mcpServers: { postgres: { id: 'postgres', name: 'PostgreSQL', command: 'npx', args: [], enabled: false, values: { POSTGRES_URL: 'postgresql://x' } } } },
      'w1',
      '/w'
    );
    expect(viaPlugin.skills.map(s => s.id).sort()).toEqual(['api-design', 'code-review', 'database-migrations']);
    expect(viaPlugin.mcpServers.map(s => s.id).sort()).toEqual(['filesystem', 'postgres']);
    expect(viaPlugin.mcpServers.find(s => s.id === 'postgres')!.args).toContain('postgresql://x');
  });
});

describe('Codex', () => {
  it('receives extra servers as config overrides', () => {
    const args = extraServerOverrides([{ id: 'github', command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'a"b' } }]);
    expect(args).toEqual([
      '-c', 'mcp_servers.github.command="npx"',
      '-c', 'mcp_servers.github.args=["-y","pkg"]',
      '-c', 'mcp_servers.github.env={"TOKEN"="a\\"b"}'
    ]);
    expect(extraServerOverrides([{ id: 'bad.id', command: 'x', args: [] }])).toEqual([]);
  });
});

describe('catalog', () => {
  it('keeps added skills across restarts', () => {
    addSkill({ id: 'house-style', name: 'House style', description: 'd', instructions: 'Use tabs.', enabled: true });
    const saved = JSON.parse(fs.readFileSync(path.join(config.storageDir, 'catalog.json'), 'utf-8'));
    expect(saved.skills.map((s: any) => s.id)).toContain('house-style');
    expect(saved.skills.map((s: any) => s.id)).not.toContain('code-review');
    globalSkills.delete('house-style');
  });

  it('refuses ids that cannot be config keys', async () => {
    const res = await request(app).post('/api/v1/customizations/mcp').send({ id: 'a.b', name: 'x', command: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('session customizations API', () => {
  it('refuses a server without its required input, masks secrets, and keeps them when the mask comes back', async () => {
    const created = await request(app).post('/api/v1/sessions').send({ name: 'Custom', repoPath: makeRepo(), agents: [{ agentId: 'claude', model: 'opus' }] });
    const id = created.body.id;

    const missing = await request(app).put(`/api/v1/sessions/${id}/customizations`).send({ mcpServers: { postgres: { enabled: true } } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toContain('Connection string');

    const viaPlugin = await request(app).put(`/api/v1/sessions/${id}/customizations`).send({ plugins: ['fullstack-pack'] });
    expect(viaPlugin.status).toBe(400);

    const ok = await request(app)
      .put(`/api/v1/sessions/${id}/customizations`)
      .send({ mcpServers: { postgres: { enabled: true, values: { POSTGRES_URL: 'postgresql://secret' } } } });
    expect(ok.status).toBe(200);
    expect(ok.body.customizations.mcpServers.postgres.values.POSTGRES_URL).toBe(SECRET_MASK);
    expect(JSON.stringify((await request(app).get(`/api/v1/sessions/${id}`)).body)).not.toContain('postgresql://secret');

    const again = await request(app)
      .put(`/api/v1/sessions/${id}/customizations`)
      .send({ mcpServers: { postgres: { enabled: true, values: { POSTGRES_URL: SECRET_MASK } } }, plugins: ['fullstack-pack'] });
    expect(again.status).toBe(200);

    const stored = JSON.parse(fs.readFileSync(path.join(config.storageDir, 'sessions', `${id}.json`), 'utf-8'));
    expect(stored.customizations.mcpServers.postgres.values.POSTGRES_URL).toBe('postgresql://secret');
  });

  it('gives each worker only what targets it, on its real turns', async () => {
    const created = await request(app)
      .post('/api/v1/sessions')
      .send({ name: 'Targets', repoPath: makeRepo(), reviewMode: 'fast', agents: [{ agentId: 'claude', model: 'opus' }, { agentId: 'codex', model: 'gpt' }] });
    const id = created.body.id;
    const put = await request(app)
      .put(`/api/v1/sessions/${id}/customizations`)
      .send({
        skills: ['api-design'],
        mcpServers: { filesystem: { enabled: true } },
        targets: { 'skill:api-design': ['codex-1'], 'mcp:filesystem': ['claude-1'], 'mcp:nobody': ['x'] }
      });
    expect(put.status).toBe(200);
    expect(put.body.customizations.targets).toEqual({ 'skill:api-design': ['codex-1'], 'mcp:filesystem': ['claude-1'] });

    const seen: Record<string, TurnRequest> = {};
    scheduler.turnRunner = async (peer, req) => {
      seen[peer.id] = req;
      return { ok: true, text: '' };
    };
    scheduler.start();
    await request(app).post(`/api/v1/sessions/${id}/goal`).send({ goal: 'docs/spec.md' });
    const start = Date.now();
    while (!(seen['claude-1'] && seen['codex-1']) && Date.now() - start < 5000) await new Promise(r => setTimeout(r, 20));
    boardStore.get(id).pause('test finished');

    expect(seen['claude-1'].extraMcpServers!.map(s => s.id)).toEqual(['filesystem']);
    expect(seen['claude-1'].extraMcpServers![0].args).toContain(seen['claude-1'].cwd);
    expect(seen['claude-1'].prompt).not.toContain('REST & GraphQL API Design');
    expect(seen['codex-1'].extraMcpServers).toEqual([]);
    expect(seen['codex-1'].prompt).toContain('REST & GraphQL API Design');
  });
});
