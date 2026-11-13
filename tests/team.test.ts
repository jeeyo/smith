import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';
import { scheduler } from '../src/server/scheduler.ts';
import { boardStore } from '../src/server/board-store.ts';
import { sessionChat } from '../src/server/session-chat.ts';
import { agentHealthEngine } from '../src/server/agent-health.ts';
import { TurnRequest, TurnResult } from '../src/server/adapters/index.ts';
import { Peer } from '../src/shared/board.ts';

/**
 * Runs whole goals through the real board, tools, scheduler and git, with scripted peers in
 * place of agent CLIs. A scripted peer does what a real one would: it calls the board over
 * MCP with its turn token and edits files in the directory the board gives it.
 */

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-team-'));

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@local', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'pipe'
  }).toString();
}

let repoCount = 0;
const created: string[] = [];
function makeRepo(spec?: object): string {
  const repo = path.join(scratch, `repo-${++repoCount}`);
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.worktrees/\n');
  if (spec) {
    fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs', 'spec.md'), `# The feature\n\nBuild it.\n\n\`\`\`smith-tasks\n${JSON.stringify(spec)}\n\`\`\`\n`);
  }
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  return repo;
}

/** A tool call the way an agent CLI makes it: JSON-RPC to /mcp with the turn's bearer token. */
async function tool(req: TurnRequest, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${req.mcp.token}`)
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const payload = JSON.parse(res.body.result.content[0].text);
  return { ...payload, isError: res.body.result.isError };
}

type Script = (peer: Peer, req: TurnRequest, t: (name: string, args?: Record<string, unknown>) => Promise<any>) => Promise<TurnResult | void>;

function runWith(script: Script) {
  scheduler.turnRunner = async (peer, req) => {
    const result = await script(peer, req, (name, args) => tool(req, name, args));
    return result || { ok: true, text: 'done' };
  };
}

async function createSession(repo: string, agents: any[], extra: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/v1/sessions').send({ name: `Team ${repoCount}`, repoPath: repo, agents, ...extra });
  expect(res.status).toBe(201);
  created.push(res.body.id);
  return res.body;
}

async function until(check: () => boolean, label: string, timeoutMs = 10000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 15));
  }
}

const TWO_CLAUDES = [
  { agentId: 'claude', model: 'opus' },
  { agentId: 'claude', model: 'sonnet' }
];

/** The default worker: take the suggested card, do what its kind calls for, hand it in. */
const diligent: Script = async (_peer, _req, t) => {
  const board = await t('board_read');
  const mine = board.yourCards[0] || board.claimable[0];
  if (!mine) return;
  const claimed = board.yourCards[0] ? await t('board_read', { cardId: mine }) : await t('card_claim', { cardId: mine });
  const card = claimed.card;
  if (card.kind === 'review') {
    await t('review_verdict', { cardId: card.id, pass: true, findings: 'Read the diff; it meets the criteria.' });
  } else if (card.kind === 'verify') {
    await t('card_submit', { cardId: card.id, summary: 'npm test exit 0', passed: true });
  } else {
    for (const file of card.fileScope) {
      const full = path.join(claimed.workIn || card.worktreePath, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, `// ${card.title}\n`);
    }
    await t('card_submit', { cardId: card.id, summary: `Wrote ${card.fileScope.join(', ')}` });
  }
};

beforeEach(() => {
  // A goal left running by an earlier test must not have its turns served by this test's script.
  for (const id of created) {
    if (boardStore.has(id)) boardStore.get(id).pause('test finished');
  }
  scheduler.start();
  // The scripted peers stand in for CLIs that may not be installed on this machine.
  for (const harness of ['claude', 'codex', 'opencode']) {
    agentHealthEngine.setStatus(harness, { agentId: harness, name: harness, installed: true, authenticated: true, status: 'ready', message: 'ok', lastCheckedAt: Date.now() });
  }
});

afterAll(() => {
  scheduler.stop();
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('MCP endpoint', () => {
  it('rejects calls without a live turn token', async () => {
    const res = await request(app).post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
  });
});

describe('A leaderless team working a goal', () => {
  it('works spec cards in dependency order, reviews by another peer, merges, verifies and completes', async () => {
    const repo = makeRepo({
      verify: ['npm test'],
      tasks: [
        { id: 'types', title: 'Types', description: 'Add types', acceptance: ['types exist'], fileScope: ['src/types.ts'] },
        { id: 'svc', title: 'Service', description: 'Add service', acceptance: ['service exists'], fileScope: ['src/service.ts'], dependsOn: ['types'] }
      ]
    });
    const session = await createSession(repo, TWO_CLAUDES, { reviewMode: 'thorough' });
    const board = boardStore.get(session.id);
    const tools: string[] = [];
    let listed: any;

    runWith(async (peer, req, t) => {
      if (!listed) {
        listed = await request(app).post('/mcp').set('Authorization', `Bearer ${req.mcp.token}`).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      }
      expect(req.prompt).toContain(`You are @${peer.id}`);
      expect(req.prompt).toContain('docs/spec.md');
      return diligent(peer, req, async (name, args) => {
        tools.push(`${peer.id}:${name}`);
        return t(name, args);
      });
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'docs/spec.md' });
    await until(() => board.data.goal.status === 'completed', 'goal completed');

    expect(listed.body.result.tools.map((x: any) => x.name)).toContain('card_claim');

    const cards = board.cards();
    const work = cards.filter(c => c.kind === 'work');
    expect(work.map(c => c.state)).toEqual(['done', 'done']);
    expect(cards.filter(c => c.kind === 'review').length).toBe(2);
    expect(cards.filter(c => c.kind === 'verify').length).toBe(1);

    // No work card was reviewed by its own author.
    for (const review of cards.filter(c => c.kind === 'review')) {
      const target = board.card(review.targetId!);
      expect(tools).toContain(`${target.author}:card_submit`);
      const reviewer = tools.find(x => x.endsWith(':review_verdict') && x.split(':')[0] !== target.author);
      expect(reviewer).toBeTruthy();
    }

    // The merged result is on the session branch, and the card worktrees are gone.
    expect(fs.existsSync(path.join(session.worktree.path, 'src/types.ts'))).toBe(true);
    expect(fs.existsSync(path.join(session.worktree.path, 'src/service.ts'))).toBe(true);
    expect(git(session.worktree.path, 'status', '--porcelain').trim()).toBe('');
    expect(git(repo, 'worktree', 'list').trim().split('\n').length).toBe(2);
    // The user's own checkout was never touched.
    expect(fs.existsSync(path.join(repo, 'src'))).toBe(false);

    // The completion message carries the diff summary, which is computed after the board change.
    await until(() => sessionChat.history(session.id).some(m => m.kind === 'completed'), 'completion announced');
    const chat = sessionChat.history(session.id);
    expect(chat.some(m => m.kind === 'completed' && m.diffSummary && m.diffSummary.changedFilesCount >= 2)).toBe(true);

    const api = await request(app).get(`/api/v1/sessions/${session.id}/board`);
    expect(api.body.board.goal.status).toBe('completed');
    expect(api.body.log.some((e: any) => e.action === 'merged')).toBe(true);
    expect(api.body.recentTurns.length).toBeGreaterThan(0);
  });

  it('lets the team plan from a bare goal, then replan when a peer finds a missing piece', async () => {
    const repo = makeRepo();
    const session = await createSession(repo, TWO_CLAUDES, { reviewMode: 'fast' });
    const board = boardStore.get(session.id);
    let blockedOnce = false;

    runWith(async (peer, req, t) => {
      const read = await t('board_read');
      const id = read.yourCards[0] || read.claimable[0];
      if (!id) return;
      const claimed = read.yourCards[0] ? await t('board_read', { cardId: id }) : await t('card_claim', { cardId: id });
      const card = claimed.card;

      if (card.kind === 'plan') {
        const a = await t('card_create', { title: 'Guards', description: 'route guards', acceptance: ['guards work'], fileScope: ['src/guards.ts'], reason: 'the goal needs guards', planVersion: read.planVersion });
        expect(a.isError).toBe(false);
        // The plan moved, so an edit with the old version is refused until the peer re-reads.
        const stale = await t('card_create', { title: 'Docs', description: 'd', acceptance: ['documented'], fileScope: ['docs/guards.md'], reason: 'r', planVersion: read.planVersion });
        expect(stale.isError).toBe(true);
        expect(stale.error).toBe('stale');
        await t('card_submit', { cardId: card.id, summary: 'Planned one card.' });
        return;
      }

      if (card.title === 'Guards' && !blockedOnce) {
        // Mid-work discovery: the plan lacks something. Add it and wait for it.
        blockedOnce = true;
        const now = await t('board_read');
        const helper = await t('card_create', { title: 'Token types', description: 'types the guards need', acceptance: ['types exist'], fileScope: ['src/types.ts'], reason: 'guards cannot be written without them', planVersion: now.planVersion });
        await t('card_block', { cardId: card.id, reason: 'needs token types first', waitFor: [helper.cardId] });
        return;
      }
      return diligent(peer, req, t);
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'Add route guards' });
    await until(() => board.data.goal.status === 'completed', 'goal completed');

    const titles = board.cards().filter(c => c.kind === 'work').map(c => `${c.title}:${c.state}`);
    expect(titles).toEqual(['Guards:done', 'Token types:done']);
    const guards = board.cards().find(c => c.title === 'Guards')!;
    expect(guards.thread.some(n => n.kind === 'blocker')).toBe(true);
    expect(fs.existsSync(path.join(session.worktree.path, 'src/types.ts'))).toBe(true);
    expect(fs.existsSync(path.join(session.worktree.path, 'src/guards.ts'))).toBe(true);

    const log = boardStore.log(session.id);
    expect(log.find(e => e.action === 'blocked')?.reason).toBe('needs token types first');
    expect(fs.readFileSync(board.data.goal.specPath!, 'utf-8')).toContain('Add route guards');
  });

  it('refuses a submit that strays outside the card scope or touches the spec', async () => {
    const repo = makeRepo({ tasks: [{ title: 'Only A', description: 'a', acceptance: ['a'], fileScope: ['src/a.ts'] }] });
    const session = await createSession(repo, [{ agentId: 'claude', model: 'opus' }], { reviewMode: 'fast' });
    const board = boardStore.get(session.id);
    const seen: any[] = [];

    runWith(async (peer, req, t) => {
      const read = await t('board_read');
      const id = read.yourCards[0] || read.claimable[0];
      if (!id) return;
      const claimed = read.yourCards[0] ? await t('board_read', { cardId: id }) : await t('card_claim', { cardId: id });
      const card = claimed.card;
      if (card.kind !== 'work') return diligent(peer, req, t);
      const dir = card.worktreePath;
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a = 1;\n');

      if (seen.length === 0) {
        fs.writeFileSync(path.join(dir, 'README.md'), '# changed\n');
        seen.push(await t('card_submit', { cardId: card.id, summary: 'did a' }));
        return;
      }
      if (seen.length === 1) {
        git(dir, 'checkout', 'HEAD~1', '--', 'README.md');
        fs.appendFileSync(path.join(dir, 'docs/spec.md'), '\nextra requirement\n');
        const widened = await t('card_edit', { cardId: card.id, changes: { fileScope: ['src/a.ts', 'docs'] }, reason: 'docs', planVersion: read.planVersion });
        expect(widened.applied).toBe(true);
        seen.push(await t('card_submit', { cardId: card.id, summary: 'did a' }));
        return;
      }
      git(dir, 'checkout', 'HEAD~2', '--', 'docs/spec.md');
      seen.push(await t('card_submit', { cardId: card.id, summary: 'did a' }));
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'docs/spec.md' });
    await until(() => board.data.goal.status === 'completed', 'goal completed');

    expect(seen[0].error).toBe('out_of_scope');
    expect(seen[0].message).toContain('README.md');
    expect(seen[1].error).toBe('not_allowed');
    expect(seen[1].message).toContain('spec');
    expect(seen[2].outcome).toBe('done');
    expect(fs.readFileSync(path.join(session.worktree.path, 'README.md'), 'utf-8')).toBe('# test\n');
    expect(fs.readFileSync(path.join(session.worktree.path, 'docs/spec.md'), 'utf-8')).not.toContain('extra requirement');
  });

  it('opens a conflict card when a merge conflicts, and merges once a peer resolves it', async () => {
    const repo = makeRepo({
      tasks: [
        { title: 'Left', description: 'l', acceptance: ['l'], fileScope: ['shared.txt'] },
        { title: 'Right', description: 'r', acceptance: ['r'], fileScope: ['other.txt'] }
      ]
    });
    fs.writeFileSync(path.join(repo, 'shared.txt'), 'base\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'shared');
    const session = await createSession(repo, TWO_CLAUDES, { reviewMode: 'fast' });
    const board = boardStore.get(session.id);
    const outcomes: any[] = [];

    runWith(async (peer, req, t) => {
      const read = await t('board_read');
      const id = read.yourCards[0] || read.claimable[0];
      if (!id) return;
      const claimed = read.yourCards[0] ? await t('board_read', { cardId: id }) : await t('card_claim', { cardId: id });
      const card = claimed.card;
      const dir = card.worktreePath;

      if (card.kind === 'merge-conflict') {
        expect(fs.readFileSync(path.join(dir, 'shared.txt'), 'utf-8')).toContain('<<<<<<<');
        fs.writeFileSync(path.join(dir, 'shared.txt'), 'left\nright\n');
        outcomes.push(await t('card_submit', { cardId: card.id, summary: 'kept both changes' }));
        return;
      }
      if (card.title === 'Left') {
        fs.writeFileSync(path.join(dir, 'shared.txt'), 'left\n');
        await t('card_submit', { cardId: card.id, summary: 'left' });
        return;
      }
      if (card.title === 'Right') {
        // Right branched before Left merged. Once Left is done its scope is free, so Right
        // may widen into the same file, and its change then conflicts with Left's.
        await until(() => board.cards().find(c => c.title === 'Left')!.state === 'done', 'left merged');
        const now = await t('board_read');
        const widened = await t('card_edit', { cardId: card.id, changes: { fileScope: ['other.txt', 'shared.txt'] }, reason: 'needs the shared file too', planVersion: now.planVersion });
        expect(widened.applied).toBe(true);
        fs.writeFileSync(path.join(dir, 'other.txt'), 'other\n');
        fs.writeFileSync(path.join(dir, 'shared.txt'), 'right\n');
        outcomes.push(await t('card_submit', { cardId: card.id, summary: 'right' }));
        return;
      }
      return diligent(peer, req, t);
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'docs/spec.md' });
    await until(() => board.data.goal.status === 'completed', 'goal completed');

    expect(outcomes[0].outcome).toBe('merge_conflict');
    expect(outcomes[1].outcome).toBe('done');
    const conflict = board.cards().find(c => c.kind === 'merge-conflict')!;
    expect(conflict.state).toBe('done');
    expect(board.cards().find(c => c.title === 'Right')!.state).toBe('done');
    expect(fs.readFileSync(path.join(session.worktree.path, 'shared.txt'), 'utf-8')).toBe('left\nright\n');
    expect(fs.readFileSync(path.join(session.worktree.path, 'other.txt'), 'utf-8')).toBe('other\n');
    expect(fs.existsSync(path.join(session.worktree.path, '.git', 'MERGE_HEAD'))).toBe(false);
  });

  it('removes a harness at its usage limit, carries on with the rest, and lets it rejoin', async () => {
    const repo = makeRepo({
      tasks: [
        { title: 'One', description: '1', acceptance: ['1'], fileScope: ['one.txt'] },
        { title: 'Two', description: '2', acceptance: ['2'], fileScope: ['two.txt'] }
      ]
    });
    const session = await createSession(repo, [
      { agentId: 'claude', model: 'opus' },
      { agentId: 'opencode', model: 'local/model' }
    ], { reviewMode: 'fast' });
    const board = boardStore.get(session.id);
    let limitHits = 0;
    let heldByClaude: string | undefined;

    runWith(async (peer, req, t) => {
      if (peer.harness === 'claude' && limitHits === 0) {
        limitHits++;
        const read = await t('board_read');
        heldByClaude = (await t('card_claim', { cardId: read.claimable[0] })).card.id;
        return { ok: false, text: '', error: 'limit', usageLimit: { message: 'Claude usage limit reached', resetAt: Date.now() + 120 } };
      }
      if (peer.harness === 'opencode') {
        const read = await t('board_read');
        if (read.cards.some((line: string) => line.includes('[ready verify]'))) {
          // Hold the last card until the limit has reset, so the rejoin happens mid-goal.
          await until(() => boardStore.log(session.id).some(e => e.action === 'peers_removed'), 'claude removed');
          await new Promise(r => setTimeout(r, 200));
          scheduler.poke(session.id);
          await until(() => board.data.peers['claude-1'].status === 'active', 'claude rejoined');
        }
      }
      return diligent(peer, req, t);
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'docs/spec.md' });
    await until(() => board.data.goal.status === 'completed', 'goal completed');

    const log = boardStore.log(session.id);
    expect(log.find(e => e.action === 'peers_removed')?.detail).toBe('claude-1');
    expect(log.find(e => e.action === 'peer_rejoined')?.detail).toBe('claude-1');
    expect(limitHits).toBe(1);

    // The card it held went back without counting against anyone, and was finished.
    const held = board.card(heldByClaude!);
    expect(held.state).toBe('done');
    expect(held.bounces).toBe(0);
    expect(held.failedBy).toEqual([]);

    const chat = sessionChat.history(session.id).map(m => m.content).join('\n');
    expect(chat).toContain('@claude-1 left the team');
    expect(chat).toContain('@claude-1 rejoined');
  });

  it('takes a question to the user and continues with the answer', async () => {
    const repo = makeRepo({ tasks: [{ title: 'Ambiguous', description: 'a', acceptance: ['a'], fileScope: ['a.txt'] }] });
    const session = await createSession(repo, [{ agentId: 'claude', model: 'opus' }], { reviewMode: 'fast' });
    const board = boardStore.get(session.id);
    let asked = false;
    let sawAnswer = false;

    runWith(async (peer, req, t) => {
      if (!asked) {
        asked = true;
        const read = await t('board_read');
        const claimed = await t('card_claim', { cardId: read.claimable[0] });
        await t('ask_user', { cardId: claimed.card.id, question: 'The spec does not say which format. JSON or YAML?' });
        return;
      }
      if (!sawAnswer) {
        sawAnswer = true;
        expect(req.prompt).toMatch(/JSON, please/);
      }
      return diligent(peer, req, t);
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'docs/spec.md' });
    await until(() => board.cards()[0].state === 'needs_user' && !scheduler.isBusy(session.id), 'question asked');
    await until(() => !!board.data.goal.waitingReason, 'waiting for the user');
    expect(sessionChat.history(session.id).some(m => m.kind === 'question' && m.content.includes('JSON or YAML'))).toBe(true);

    // A plain chat message answers the one open question.
    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'JSON, please' });
    await until(() => board.data.goal.status === 'completed', 'goal completed');
    expect(board.cards()[0].thread.some(n => n.kind === 'answer' && n.text === 'JSON, please')).toBe(true);
  });

  it('takes a failing peer off its card and pauses instead of looping when nobody can finish it', async () => {
    const repo = makeRepo({ tasks: [{ title: 'Impossible', description: 'x', acceptance: ['x'], fileScope: ['x.txt'] }] });
    const session = await createSession(repo, TWO_CLAUDES, { reviewMode: 'fast' });
    const board = boardStore.get(session.id);
    const attempts: string[] = [];

    runWith(async (peer, _req, t) => {
      const read = await t('board_read');
      if (!read.claimable[0]) return;
      await t('card_claim', { cardId: read.claimable[0] });
      attempts.push(peer.id);
      return { ok: false, text: '', error: 'the CLI crashed' };
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'docs/spec.md' });
    await until(() => board.cards()[0].state === 'needs_user', 'escalated to the user');

    expect(board.cards()[0].bounces).toBe(3);
    // The second attempt went to the other peer.
    expect(attempts[0]).not.toBe(attempts[1]);
    expect(sessionChat.history(session.id).some(m => m.kind === 'question')).toBe(true);
    expect(attempts.length).toBe(3);
  });

  it('adds a later user message to a running goal as a card', async () => {
    const repo = makeRepo({ tasks: [{ title: 'First', description: 'f', acceptance: ['f'], fileScope: ['f.txt'] }] });
    const session = await createSession(repo, [{ agentId: 'claude', model: 'opus' }], { reviewMode: 'fast' });
    const board = boardStore.get(session.id);
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));

    runWith(async (peer, req, t) => {
      await gate;
      return diligent(peer, req, t);
    });

    await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'docs/spec.md' });
    const res = await request(app).post(`/api/v1/sessions/${session.id}/goal`).send({ goal: 'Also add a changelog entry' });
    expect(res.body.message.cardId).toBeTruthy();
    release();
    await until(() => board.data.goal.status === 'completed', 'goal completed');
    const added = board.cards().find(c => c.createdBy === 'user')!;
    expect(added.state).toBe('done');
  });
});

describe('Sessions', () => {
  it('gives workers unique peer ids and a suggested tier, and deletes cleanly', async () => {
    const repo = makeRepo();
    const session = await createSession(repo, [
      { agentId: 'claude', model: 'claude-opus-5-5' },
      { agentId: 'claude', model: 'claude-haiku-5-5' },
      { agentId: 'antigravity', model: 'gemini' }
    ]);
    expect(Object.keys(session.agents)).toEqual(['claude-1', 'claude-2']);
    expect(session.agents['claude-1'].config.tier).toBe(3);
    expect(session.agents['claude-2'].config.tier).toBe(1);

    const settings = await request(app).put(`/api/v1/sessions/${session.id}/board/settings`).send({ reviewMode: 'thorough' });
    expect(settings.body.reviewMode).toBe('thorough');
    const bad = await request(app).put(`/api/v1/sessions/${session.id}/board/settings`).send({ reviewMode: 'careless' });
    expect(bad.status).toBe(400);

    const del = await request(app).delete(`/api/v1/sessions/${session.id}`);
    expect(del.status).toBe(200);
    expect(fs.existsSync(session.worktree.path)).toBe(false);
    expect((await request(app).get(`/api/v1/sessions/${session.id}/board`)).status).toBe(404);
  });
});
