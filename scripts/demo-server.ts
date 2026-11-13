/**
 * Starts the server with two sample sessions, for screenshots and demos:
 *   - "Auth service": a goal in progress, with work done, work under way, a review waiting,
 *     a proposal between workers and a question for the user;
 *   - "Greeting page": a finished, verified goal with its diff.
 *
 * Nothing is real: storage and repositories live in a temporary directory, and workers are
 * scripted. No agent CLI is ever started, so no subscription usage is spent.
 *
 *   npm run build && node --import tsx scripts/demo-server.ts      (then open http://localhost:4199)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.join(os.tmpdir(), 'smith-demo');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
process.env.SMITH_STORAGE_DIR = path.join(root, 'store');
process.env.PORT = process.env.PORT || '4199';

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@local', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' });
}

function write(dir: string, rel: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

function spec(title: string, body: string, tasks: object) {
  return `# ${title}\n\n${body}\n\n\`\`\`smith-tasks\n${JSON.stringify(tasks, null, 2)}\n\`\`\`\n`;
}

// A small repository to work on.
const repo = path.join(root, 'acme-api');
fs.mkdirSync(repo);
git(repo, 'init', '-b', 'main');
write(repo, '.gitignore', '.worktrees/\nnode_modules/\n');
write(repo, 'README.md', '# Acme API\n');
write(repo, 'package.json', JSON.stringify({ name: 'acme-api', scripts: { test: 'vitest run' } }, null, 2));
write(repo, 'src/server.ts', "export const app = 'acme';\n");
write(
  repo,
  'docs/designs/auth.md',
  spec('Token authentication', 'Issue signed access tokens, protect the API routes, and cover both with tests.', {
    verify: ['npm test'],
    tasks: [
      { id: 'types', title: 'Token types and claims', description: 'Define the token payload and claim types.', acceptance: ['Types compile', 'Claims match the spec'], fileScope: ['src/auth/types.ts'] },
      { id: 'sign', title: 'Signing and verification service', description: 'Issue and verify access tokens.', acceptance: ['Expired tokens are rejected', 'Forged signatures are rejected'], fileScope: ['src/auth/sign.ts'], dependsOn: ['types'] },
      { id: 'guards', title: 'Route guards', description: 'Reject requests without a valid token.', acceptance: ['Protected routes return 401 without a token'], fileScope: ['src/auth/guards.ts'], dependsOn: ['types'] },
      { id: 'tests', title: 'Integration tests', description: 'End-to-end tests for issuing and checking tokens.', acceptance: ['Tests cover expiry, forgery and missing tokens'], fileScope: ['tests/auth.test.ts'], dependsOn: ['sign', 'guards'] },
      { id: 'docs', title: 'Authentication guide', description: 'Document how clients obtain and send tokens.', acceptance: ['Guide has a request example'], fileScope: ['docs/auth.md'] }
    ]
  })
);
write(
  repo,
  'docs/designs/greeting.md',
  spec('Greeting page', 'Serve a friendly greeting page at /hello.', {
    verify: ['npm test'],
    tasks: [{ id: 'page', title: 'Greeting page', description: 'Add public/hello.html with a short greeting.', acceptance: ['The page loads at /hello'], fileScope: ['public/hello.html'] }]
  })
);
git(repo, 'add', '.');
git(repo, 'commit', '-m', 'Initial commit');

const { scheduler } = await import('../src/server/scheduler.ts');
// Scripted workers: a turn simply stays "in progress", so nothing is ever run.
scheduler.turnRunner = () => new Promise(() => {});
// Hold the scheduler back while the sample boards are built; it starts with the server.
const poke = scheduler.poke.bind(scheduler);
scheduler.poke = () => {};

const { sessionStore } = await import('../src/server/session-store.ts');
const { boardStore } = await import('../src/server/board-store.ts');
const { boardTools } = await import('../src/server/board-tools.ts');
const { sessionChat } = await import('../src/server/session-chat.ts');
const { worktreeManager } = await import('../src/server/worktree-manager.ts');
const { costEngine } = await import('../src/server/cost-engine.ts');
const { startGoal } = await import('../src/server/team.ts');

async function makeSession(id: string, name: string, branch: string, workers: Array<[string, 'claude' | 'codex' | 'opencode', string, 1 | 2 | 3]>, createdAt: number) {
  const worktree = await worktreeManager.createWorktree(repo, branch, 'main');
  const session = {
    id,
    name,
    repoPath: repo,
    macroGoal: '',
    worktree,
    agents: Object.fromEntries(workers.map(([wid, harness, model, tier]) => [wid, { config: { workerId: wid, agentId: harness, model, tier } }])),
    reviewMode: 'normal' as const,
    customizations: { plugins: [], skills: ['code-review'], mcpServers: {} },
    createdAt,
    updatedAt: createdAt
  };
  sessionStore.save(session);
  return session;
}

const usage = (input: number, output: number) => ({ inputTokens: input, outputTokens: output, cachedTokens: input * 3, reasoningTokens: 0, totalTokens: input * 4 + output });

// ---- A finished goal -----------------------------------------------------------------------

const done = await makeSession('demo-greeting', 'Greeting page', 'smith/greeting-page', [
  ['claude-1', 'claude', 'claude-sonnet-5-5', 2],
  ['claude-2', 'claude', 'claude-haiku-5-5', 1]
], Date.now() - 3 * 3600_000);
sessionChat.post(done.id, { sender: 'user', kind: 'goal', content: 'docs/designs/greeting.md' });
startGoal(done, 'docs/designs/greeting.md');
{
  const board = boardStore.get(done.id);
  board.setReviewMode('fast');
  const call = (peerId: string, name: string, args: object) => boardTools.call({ sessionId: done.id, peerId }, name, args);
  const page = board.cards()[0];
  const claimed: any = await call('claude-1', 'card_claim', { cardId: page.id });
  write(claimed.workIn, 'public/hello.html', '<!doctype html>\n<title>Hello</title>\n<h1>Hello from Acme</h1>\n<p>Signed in and ready.</p>\n');
  await call('claude-1', 'card_submit', { cardId: page.id, summary: 'Added public/hello.html with a heading and a short greeting.' });
  const verify = board.ensureVerifyCard()!;
  await call('claude-2', 'card_claim', { cardId: verify.id });
  await call('claude-2', 'card_submit', { cardId: verify.id, summary: '`npm test` exited 0. /hello serves the page as the spec asks.', passed: true });
  costEngine.recordTurn(done.id, 'claude-1', 'claude-sonnet-5-5', usage(9_000, 1_400), page.id);
  costEngine.recordTurn(done.id, 'claude-2', 'claude-haiku-5-5', usage(6_000, 500), verify.id);
  const diffSummary = await worktreeManager.getDiffSummary(done.worktree.path, done.worktree.branch, 'main');
  sessionChat.post(done.id, {
    sender: 'board',
    kind: 'completed',
    content: `Goal verified and complete: 1 work card(s) merged into \`${done.worktree.branch}\`.\n\n\`npm test\` exited 0. /hello serves the page as the spec asks.`,
    diffSummary
  });
}

// ---- A goal in progress --------------------------------------------------------------------

const busy = await makeSession('demo-auth', 'Auth service', 'smith/auth-service', [
  ['claude-1', 'claude', 'claude-opus-5-5', 3],
  ['claude-2', 'claude', 'claude-sonnet-5-5', 2],
  ['opencode-1', 'opencode', 'opencode/big-pickle', 1]
], Date.now());
sessionChat.post(busy.id, { sender: 'user', kind: 'goal', content: 'docs/designs/auth.md' });
startGoal(busy, 'docs/designs/auth.md');
{
  const board = boardStore.get(busy.id);
  const [types, sign, guards, , docs] = board.cards();
  const pv = () => board.data.planVersion;

  board.claim('claude-1', types.id);
  board.submit('claude-1', types.id, { summary: 'Added AccessClaims and RefreshClaims with issuer, subject, scopes and expiry.', diff: { files: ['src/auth/types.ts'], lines: 48 } });
  board.merged(types.id, '3f2a91c');

  board.claim('claude-2', sign.id);
  board.note('claude-2', sign.id, 'Using Ed25519 through node:crypto; no new dependency needed.');

  board.claim('opencode-1', docs.id);
  board.submit('opencode-1', docs.id, { summary: 'Wrote the guide with curl examples for login and an authorised request.', diff: { files: ['docs/auth.md'], lines: 96 }, requestReview: true });

  board.claim('claude-1', guards.id);
  board.edit('claude-1', sign.id, { acceptance: ['Expired tokens are rejected', 'Forged signatures are rejected', 'Keys can be rotated without downtime'] }, 'The guards need to accept tokens signed by the previous key during rotation.', pv());
  board.create(
    'claude-1',
    { title: 'Key rotation job', description: 'Rotate signing keys daily and keep the previous key for verification.', acceptance: ['Old tokens verify for one rotation period'], fileScope: ['src/auth/keys.ts'], dependsOn: [sign.id] },
    'Rotation came up while writing the guards; it was not in the spec.',
    pv()
  );
  const lifetime = board.create(
    'claude-1',
    { title: 'Refresh token lifetime', description: 'Choose how long refresh tokens stay valid.', acceptance: ['Lifetime is configured and documented'], fileScope: ['src/auth/config.ts'] },
    'The spec does not say how long refresh tokens live.',
    pv()
  );
  board.askUser('claude-1', lifetime.id, 'The spec does not say how long refresh tokens stay valid. **7 days** or **30 days**?');

  costEngine.recordTurn(busy.id, 'claude-1', 'claude-opus-5-5', usage(18_000, 3_100), types.id);
  costEngine.recordTurn(busy.id, 'claude-2', 'claude-sonnet-5-5', usage(12_000, 1_900), sign.id);

  sessionChat.post(busy.id, {
    sender: 'board',
    kind: 'question',
    cardId: lifetime.id,
    content: `**Refresh token lifetime** (${lifetime.id}) needs you, asked by @claude-1:\n\nThe spec does not say how long refresh tokens stay valid. **7 days** or **30 days**?`
  });
}

scheduler.poke = poke;
await import('../src/server/index.ts');
console.log(`[demo] storage and repository in ${root}`);
