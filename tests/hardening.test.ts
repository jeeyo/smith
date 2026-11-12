import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server, isAllowedOrigin } from '../src/server/index.ts';
import { worktreeManager, assertSafeRef } from '../src/server/worktree-manager.ts';
import { getPricingForModel, calculateCost, DEFAULT_MODEL_PRICING } from '../src/shared/pricing.ts';
import { CostEngine } from '../src/server/cost-engine.ts';
import { ptyManager } from '../src/server/pty-manager.ts';
import { runCli } from '../src/server/process-utils.ts';
import { config } from '../src/server/config.ts';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-hardening-'));

function git(cwd: string, ...args: string[]) {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@local', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'pipe' }
  ).toString();
}

function makeRepo(name: string): string {
  const repo = path.join(scratch, name);
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'file.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  return repo;
}

afterAll(() => {
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('Request origin policy', () => {
  it('allows the local UI and non-browser clients, rejects foreign websites', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4100')).toBe(true);
    expect(isAllowedOrigin('tauri://localhost')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false);
    expect(isAllowedOrigin('null')).toBe(false);
  });

  it('refuses cross-site requests before they reach a route', async () => {
    const res = await request(app)
      .post('/api/v1/system/pty/create')
      .set('Origin', 'https://evil.example')
      .send({ command: '/bin/sh' });
    expect(res.status).toBe(403);
  });
});

describe('Configuration defaults', () => {
  it('ships no embedded API key and binds to loopback', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/server/config.ts'), 'utf-8');
    expect(source).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    if (!process.env.HOST) expect(config.host).toBe('127.0.0.1');
  });
});

describe('CLI spawning', () => {
  it('passes multi-line arguments verbatim instead of through a shell', async () => {
    const marker = path.join(scratch, 'injected');
    const prompt = `first line; touch ${marker}\nsecond $(touch ${marker}) line`;
    const res = await runCli(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', prompt]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(prompt);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('reports a missing binary instead of throwing', async () => {
    const res = await runCli(path.join(scratch, 'no-such-binary'), ['--version'], { timeoutMs: 2000 });
    expect(res.code).not.toBe(0);
    expect(res.spawnError).toBeTruthy();
  });
});

describe('PTY manager', () => {
  it('survives a shell that cannot be spawned', async () => {
    const exited = new Promise<void>(resolve => ptyManager.once('pty:exit', () => resolve()));
    ptyManager.createPTY('pty-missing', 'test', scratch, path.join(scratch, 'no-such-shell'));
    await exited;
    expect(ptyManager.getPTY('pty-missing')).toBeUndefined();
  });

  it('rejects a working directory that does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/system/pty/create')
      .send({ cwd: path.join(scratch, 'missing-dir') });
    expect(res.status).toBe(400);
  });
});

describe('Worktree manager safety', () => {
  it('rejects refs that git would parse as options', () => {
    expect(() => assertSafeRef('--upload-pack=evil')).toThrow();
    expect(() => assertSafeRef('main; rm -rf ~')).toThrow();
    expect(() => assertSafeRef('a..b')).toThrow();
    expect(assertSafeRef('smith/my-feature_1')).toBe('smith/my-feature_1');
  });

  it('never commits, resets or cleans the parent repo from a non-worktree directory', async () => {
    const repo = makeRepo('parent');
    const fakeWorktree = path.join(repo, '.worktrees', 'fake');
    fs.mkdirSync(fakeWorktree, { recursive: true });
    fs.writeFileSync(path.join(repo, 'file.txt'), 'uncommitted user work\n');
    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'keep me\n');
    const headBefore = git(repo, 'rev-parse', 'HEAD');

    expect(await worktreeManager.isWorktreeRoot(fakeWorktree)).toBe(false);
    await expect(worktreeManager.commit(fakeWorktree, 'should not land')).rejects.toThrow(/not a git worktree/);

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await worktreeManager.discardWorktree(repo, fakeWorktree, 'smith/fake');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    expect(git(repo, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(fs.readFileSync(path.join(repo, 'file.txt'), 'utf-8')).toBe('uncommitted user work\n');
    expect(fs.existsSync(path.join(repo, 'untracked.txt'))).toBe(true);
  });

  it('commits inside a real worktree with shell metacharacters in the message', async () => {
    const repo = makeRepo('real');
    const info = await worktreeManager.createWorktree(repo, 'smith/feature', 'main');
    expect(await worktreeManager.isWorktreeRoot(info.path)).toBe(true);

    const marker = path.join(scratch, 'commit-injected');
    fs.writeFileSync(path.join(info.path, 'new.txt'), 'hello\n');
    const message = `feat: "quoted" $(touch ${marker}) \`touch ${marker}\``;
    await worktreeManager.commit(info.path, message);

    expect(fs.existsSync(marker)).toBe(false);
    expect(git(info.path, 'log', '-1', '--format=%s').trim()).toBe(message);
  });

  it('reports a conflicting merge as a failure and leaves the repo clean', async () => {
    const repo = makeRepo('conflict');
    git(repo, 'checkout', '-b', 'smith/conflict');
    fs.writeFileSync(path.join(repo, 'file.txt'), 'branch side\n');
    git(repo, 'commit', '-am', 'branch change');
    git(repo, 'checkout', 'main');
    fs.writeFileSync(path.join(repo, 'file.txt'), 'main side\n');
    git(repo, 'commit', '-am', 'main change');

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let result;
    try {
      result = await worktreeManager.mergeWorktree(repo, 'smith/conflict', 'main');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    expect(result.success).toBe(false);
    expect(result.commit).toBe('');
    expect(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(git(repo, 'status', '--porcelain').trim()).toBe('');
  });
});

describe('Worktree file endpoint', () => {
  it('serves files from a .worktrees checkout and blocks prefix-sibling and absolute paths', async () => {
    const repo = makeRepo('served');
    const sibling = `${repo}-secrets`;
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'secret.txt'), 'top secret');

    const created = await request(app)
      .post('/api/v1/sessions')
      .send({ name: 'Hardening Files', repoPath: repo });
    expect(created.status).toBe(201);
    const sessionId = created.body.id;
    const worktreePath: string = created.body.worktree.path;
    expect(worktreePath).toContain('.worktrees');
    fs.writeFileSync(path.join(worktreePath, 'note.txt'), 'from worktree');

    const ok = await request(app).get(`/api/v1/sessions/${sessionId}/worktree/file?path=note.txt`);
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('from worktree');
    expect(ok.headers['content-security-policy']).toContain('sandbox');

    const siblingRes = await request(app)
      .get(`/api/v1/sessions/${sessionId}/worktree/file`)
      .query({ path: path.join(sibling, 'secret.txt') });
    expect(siblingRes.status).toBe(403);

    const relSibling = await request(app)
      .get(`/api/v1/sessions/${sessionId}/worktree/file`)
      .query({ path: `../../../${path.basename(sibling)}/secret.txt` });
    expect(relSibling.status).toBe(403);

    await request(app).delete(`/api/v1/sessions/${sessionId}`);
  });

  it('rejects a session whose base branch is not a plain ref', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .send({ name: 'Bad Base', repoPath: makeRepo('badbase'), baseBranch: 'main; touch /tmp/x' });
    expect(res.status).toBe(400);
  });
});

describe('Pricing', () => {
  it('prefers the most specific model key', () => {
    expect(getPricingForModel('gpt-4o-mini')).toEqual(DEFAULT_MODEL_PRICING['gpt-4o-mini']);
    expect(getPricingForModel('gemini-2.5-pro')).toEqual(DEFAULT_MODEL_PRICING['gemini-2.5-pro']);
    expect(getPricingForModel('gemini-2.5-flash')).toEqual(DEFAULT_MODEL_PRICING['gemini-2.5-flash']);
    expect(getPricingForModel('openai/gpt-4o-mini-2024')).toEqual(DEFAULT_MODEL_PRICING['gpt-4o-mini']);
  });

  it('applies pricing overrides and keeps earlier turns at the price they were billed', () => {
    const engine = new CostEngine();
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 1_000_000 };

    engine.setPricingOverride('my-model', { inputPerMillion: 7, outputPerMillion: 0 });
    expect(engine.recordTurn('s', 'claude', 'my-model', usage).totalCostUsd).toBe(7);

    const cheap = calculateCost('gpt-4o-mini', usage).totalCostUsd;
    engine.recordTurn('s', 'claude', 'gpt-4o-mini', usage);
    expect(engine.getSessionCost('s').totalCostUsd).toBeCloseTo(7 + cheap, 4);
  });
});
