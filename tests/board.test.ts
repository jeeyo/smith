import { describe, it, expect, beforeEach } from 'vitest';
import { Board, BoardError, emptyBoard, matchesScope, parseSpecTasks, scopesOverlap } from '../src/server/board.ts';
import { BoardLogEntry, CardInput } from '../src/shared/board.ts';

let clock = 1_000_000;
let log: BoardLogEntry[] = [];

function makeBoard(peers: Array<{ id: string; harness?: any; model?: string; tier?: any }> = [{ id: 'a' }, { id: 'b' }]) {
  log = [];
  clock = 1_000_000;
  const board = new Board(emptyBoard('s1'), { onChange: e => log.push(e) }, () => clock);
  board.setPeers(peers.map(p => ({ id: p.id, harness: p.harness || 'claude', model: p.model || 'm', tier: p.tier || 2 })));
  return board;
}

const task = (title: string, extra: Partial<CardInput> & { id?: string } = {}) => ({
  title,
  description: `${title} description`,
  acceptance: [`${title} works`],
  ...extra
});

function start(board: Board, tasks: any[], verify: string[] = []) {
  board.startGoal('Build it', '/spec.md', { verify, tasks });
  return board.cards();
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BoardError);
    expect((err as BoardError).code).toBe(code);
    return;
  }
  throw new Error(`expected BoardError ${code}`);
}

describe('file scopes', () => {
  it('matches files against paths, directories and globs', () => {
    expect(matchesScope('src/auth/jwt.ts', ['src/auth'])).toBe(true);
    expect(matchesScope('src/auth/jwt.ts', ['src/auth/*'])).toBe(true);
    expect(matchesScope('src/auth/deep/x.ts', ['src/auth/*'])).toBe(true);
    expect(matchesScope('src/authz/x.ts', ['src/auth'])).toBe(false);
    expect(matchesScope('src/a.tsx', ['src/a.ts'])).toBe(false);
    expect(matchesScope('tests/a.test.ts', ['tests/*.test.ts'])).toBe(true);
    expect(matchesScope('tests/deep/a.test.ts', ['tests/*.test.ts'])).toBe(false);
    expect(matchesScope('tests/deep/a.test.ts', ['tests/**/*.test.ts'])).toBe(true);
    expect(matchesScope('anything/at/all', ['*'])).toBe(true);
  });

  it('detects overlapping scopes without confusing sibling names', () => {
    expect(scopesOverlap(['src/auth'], ['src/auth/jwt.ts'])).not.toBeNull();
    expect(scopesOverlap(['src/auth'], ['src/authz'])).toBeNull();
    expect(scopesOverlap(['src/a.ts'], ['src/b.ts'])).toBeNull();
    expect(scopesOverlap(['docs/*'], ['src/*'])).toBeNull();
    expect(scopesOverlap(['*'], ['src/x.ts'])).not.toBeNull();
  });
});

describe('spec task list', () => {
  it('reads a smith-tasks block and ignores tasks without acceptance criteria', () => {
    const spec = `# Feature\n\ntext\n\n\`\`\`smith-tasks\n${JSON.stringify({
      verify: ['npm test'],
      tasks: [
        { id: 't1', title: 'Types', acceptance: ['compiles'], fileScope: ['src/types.ts'] },
        { id: 't2', title: 'No criteria' },
        { id: 't3', title: 'Service', acceptance: ['works'], dependsOn: ['t1'], review: true }
      ]
    })}\n\`\`\`\n`;
    const parsed = parseSpecTasks(spec)!;
    expect(parsed.verify).toEqual(['npm test']);
    expect(parsed.tasks.map(t => t.title)).toEqual(['Types', 'Service']);
    expect(parsed.tasks[1].review).toBe(true);
    expect(parseSpecTasks('# no tasks here')).toBeNull();
  });
});

describe('Board', () => {
  let board: Board;
  beforeEach(() => {
    board = makeBoard();
  });

  it('turns spec tasks into cards, mapping task ids to dependencies', () => {
    const [a, b] = start(board, [task('A', { id: 't1' }), task('B', { id: 't2', dependsOn: ['t1'] })]);
    expect(a.state).toBe('ready');
    expect(b.state).toBe('blocked');
    expect(b.dependsOn).toEqual([a.id]);
    expect(a.createdBy).toBe('spec');
  });

  it('seeds a planning card when the spec has no task list', () => {
    board.startGoal('Build it', '/spec.md', null);
    const [plan] = board.cards();
    expect(plan.kind).toBe('plan');
    board.claim('a', plan.id);
    const created = board.create('a', task('Work', { fileScope: ['src/x.ts'] }), 'needed', board.data.planVersion);
    expect(board.submit('a', plan.id, { summary: 'planned' })).toEqual({ outcome: 'done' });
    expect(created.state).toBe('ready');
  });

  it('gives a card to the first claimer only (rule 1)', () => {
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    expectCode(() => board.claim('b', a.id), 'bad_state');
    expect(a.owner).toBe('a');
  });

  it('limits a peer to one card in progress', () => {
    const [a, b] = start(board, [task('A', { fileScope: ['a'] }), task('B', { fileScope: ['b'] })]);
    board.claim('a', a.id);
    expectCode(() => board.claim('a', b.id), 'not_allowed');
  });

  it('only lets the owner submit, release or block (rule 2)', () => {
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    expectCode(() => board.submit('b', a.id, { summary: 'x' }), 'not_owner');
    expectCode(() => board.release('b', a.id, 'x'), 'not_owner');
  });

  it('rejects a claim whose scope overlaps a claimed card (rule 4)', () => {
    const [a, b] = start(board, [task('A', { fileScope: ['src/auth'] }), task('B', { fileScope: ['src/auth/jwt.ts'] })]);
    board.claim('a', a.id);
    expectCode(() => board.claim('b', b.id), 'scope_conflict');
  });

  it('rejects a submit that changes files outside the scope (rule 5)', () => {
    const [a] = start(board, [task('A', { fileScope: ['src/a.ts'] })]);
    board.claim('a', a.id);
    expectCode(() => board.submit('a', a.id, { summary: 'done', diff: { files: ['src/a.ts', 'README.md'], lines: 3 } }), 'out_of_scope');
    expect(a.state).toBe('claimed');
    // Widening the scope is checked against other claimed cards, then the submit goes through.
    board.edit('a', a.id, { fileScope: ['src/a.ts', 'README.md'] }, 'docs needed', board.data.planVersion);
    expect(board.submit('a', a.id, { summary: 'done', diff: { files: ['src/a.ts', 'README.md'], lines: 3 } }).outcome).toBe('merge');
  });

  it('applies edits to unowned cards and stores proposals on owned ones (rule 3)', () => {
    const [a, b] = start(board, [task('A', { fileScope: ['a'] }), task('B', { fileScope: ['b'] })]);
    expect(board.edit('b', b.id, { title: 'B2' }, 'clearer', board.data.planVersion).applied).toBe(true);
    expect(b.title).toBe('B2');

    board.claim('a', a.id);
    const proposal = board.edit('b', a.id, { acceptance: ['A works', 'has a field'] }, 'B needs the field', board.data.planVersion);
    expect(proposal.applied).toBe(false);
    expect(a.acceptance).toEqual(['A works']);
    expect(board.wakeReason('a')).toEqual({ kind: 'proposal', cardId: a.id });

    expectCode(() => board.answerProposal('b', a.id, proposal.proposalId!, true), 'not_owner');
    board.answerProposal('a', a.id, proposal.proposalId!, true, 'fair');
    expect(a.acceptance).toEqual(['A works', 'has a field']);
    expect(board.wakeReason('a')).toEqual({ kind: 'continue', cardId: a.id });
  });

  it('rejects plan edits based on a stale plan version', () => {
    start(board, [task('A')]);
    const stale = board.data.planVersion;
    board.create('a', task('C', { fileScope: ['c'] }), 'needed', stale);
    expectCode(() => board.create('b', task('D', { fileScope: ['d'] }), 'needed', stale), 'stale');
    // Notes and claims do not move the plan version.
    const before = board.data.planVersion;
    board.note('a', board.cards()[0].id, 'hello');
    expect(board.data.planVersion).toBe(before);
  });

  it('requires acceptance criteria on every new card (rule 9)', () => {
    start(board, [task('A')]);
    expectCode(() => board.create('a', { title: 'X', description: 'x', acceptance: [] }, 'r', board.data.planVersion), 'invalid');
  });

  it('review mode decides whether a submitted card is reviewed', () => {
    const small = { files: ['a'], lines: 10 };
    const big = { files: ['a'], lines: 500 };

    board.setReviewMode('fast');
    let [a] = start(board, [task('A', { fileScope: ['a'] })]);
    board.claim('a', a.id);
    expect(board.submit('a', a.id, { summary: 's', diff: big }).outcome).toBe('merge');

    board = makeBoard();
    board.setReviewMode('thorough');
    [a] = start(board, [task('A', { fileScope: ['a'] })]);
    board.claim('a', a.id);
    expect(board.submit('a', a.id, { summary: 's', diff: small }).outcome).toBe('review');

    board = makeBoard();
    const cards = start(board, [
      task('Small', { fileScope: ['a'] }),
      task('Big', { fileScope: ['b'] }),
      task('Marked', { fileScope: ['c'], review: true }),
      task('Asked', { fileScope: ['d'] }),
      task('Many', { fileScope: ['e'] })
    ]);
    const run = (i: number, input: any) => {
      board.claim('a', cards[i].id);
      return board.submit('a', cards[i].id, { summary: 's', ...input }).outcome;
    };
    expect(run(0, { diff: small })).toBe('merge');
    expect(run(1, { diff: { files: ['b'], lines: 500 } })).toBe('review');
    expect(run(2, { diff: { files: ['c'], lines: 1 } })).toBe('review');
    expect(run(3, { diff: { files: ['d'], lines: 1 }, requestReview: true })).toBe('review');
    expect(run(4, { diff: { files: ['e/1', 'e/2', 'e/3', 'e/4', 'e/5', 'e/6'], lines: 6 } })).toBe('review');
  });

  it('skips review when nobody else is on the team', () => {
    board = makeBoard([{ id: 'solo' }]);
    board.setReviewMode('thorough');
    const [a] = start(board, [task('A')]);
    board.claim('solo', a.id);
    expect(board.submit('solo', a.id, { summary: 's', diff: { files: ['x'], lines: 999 } }).outcome).toBe('merge');
  });

  it('never lets the author review their own work (rule 6), and passes merge on a pass', () => {
    board.setReviewMode('thorough');
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    const out = board.submit('a', a.id, { summary: 's', diff: { files: ['x'], lines: 1 } });
    const reviewId = (out as any).reviewCardId;
    expect(board.claimableFor('a').map(c => c.id)).not.toContain(reviewId);
    expectCode(() => board.claim('a', reviewId), 'not_allowed');
    board.claim('b', reviewId);
    expect(board.reviewVerdict('b', reviewId, true, 'looks right')).toEqual({ outcome: 'merge', targetId: a.id });
    board.merged(a.id, 'abc123');
    expect(a.state).toBe('done');
    expect(a.result?.commit).toBe('abc123');
  });

  it('sends rejected work back and gives the next attempt to another peer (rule 11)', () => {
    board = makeBoard([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    board.setReviewMode('thorough');
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    const reviewId = (board.submit('a', a.id, { summary: 's', diff: { files: ['x'], lines: 1 } }) as any).reviewCardId;
    board.claim('b', reviewId);
    expect(board.reviewVerdict('b', reviewId, false, 'misses the edge case').outcome).toBe('rejected');
    expect(a.state).toBe('ready');
    expect(a.bounces).toBe(1);
    expect(a.failedBy).toEqual(['a']);
    expect(board.claimBlocker('a', a)).toMatch(/already attempted/);
    expect(board.claimBlocker('c', a)).toBeNull();
    // With everyone else busy or gone, the original author may try again.
    board.claim('c', a.id);
    board.release('c', a.id, 'cannot do it');
    board.removeForUsageLimit('claude', 'm', 'limit');
    board.rejoin('a');
    expect(board.claimBlocker('a', a)).toBeNull();
  });

  it('unblocks dependants when a card is done, and treats cancelled as resolved', () => {
    const [a, b, c] = start(board, [task('A', { id: '1' }), task('B', { id: '2', dependsOn: ['1'] }), task('C', { id: '3', dependsOn: ['2'] })]);
    board.setReviewMode('fast');
    board.claim('a', a.id);
    board.submit('a', a.id, { summary: 's' });
    board.merged(a.id);
    expect(b.state).toBe('ready');
    board.cancel('b', b.id, 'not needed', board.data.planVersion);
    expect(c.state).toBe('ready');
  });

  it('blocks a card on other cards and refuses dependency cycles', () => {
    const [a, b] = start(board, [task('A', { fileScope: ['a'] }), task('B', { fileScope: ['b'] })]);
    board.claim('a', a.id);
    expectCode(() => board.block('a', a.id, 'stuck', []), 'invalid');
    board.block('a', a.id, 'needs B', [b.id]);
    expect(a.state).toBe('blocked');
    expect(a.owner).toBeUndefined();
    expectCode(() => board.edit('b', b.id, { dependsOn: [a.id] }, 'loop', board.data.planVersion), 'invalid');
  });

  it('splits a card and re-points its dependants at every part', () => {
    const [a, b] = start(board, [task('A', { id: '1' }), task('B', { id: '2', dependsOn: ['1'] })]);
    const parts = board.split('a', a.id, [task('A1', { fileScope: ['a1'] }), task('A2', { fileScope: ['a2'] })], 'too big', board.data.planVersion);
    expect(a.state).toBe('cancelled');
    expect(b.dependsOn.sort()).toEqual(parts.map(p => p.id).sort());
    expect(b.state).toBe('blocked');
    expect(parts.every(p => p.parentId === a.id)).toBe(true);
  });

  it('limits delegation and never hands a card back up its chain (rule 7)', () => {
    board = makeBoard([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    board.delegate('a', a.id, 'b', 'b knows this code');
    expect(a.state).toBe('ready');
    expect(board.claimBlocker('c', a)).toMatch(/on offer/);
    board.claim('b', a.id);
    expectCode(() => board.delegate('b', a.id, 'a', 'back to you'), 'not_allowed');
    board.delegate('b', a.id, 'c', 'c then');
    board.claim('c', a.id);
    expectCode(() => board.delegate('c', a.id, 'd', 'again'), 'limit');
    // An offer lapses so the card cannot be stranded.
    board.release('c', a.id, 'giving up');
    expect(a.state).toBe('ready');
  });

  it('returns expired leases to the board and escalates after repeated bounces (rule 8)', () => {
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    clock += board.data.limits.leaseMs + 1;
    expect(board.expireLeases(new Set(['a']))).toEqual([]); // a turn is in flight
    expect(board.expireLeases(new Set())).toEqual([a.id]);
    expect(a.state).toBe('ready');
    expect(a.bounces).toBe(1);

    board.claim('b', a.id);
    board.release('b', a.id, 'no');
    board.claim('a', a.id);
    board.release('a', a.id, 'still no');
    expect(a.state).toBe('needs_user');
    board.answerUser(a.id, 'Do the simple version');
    expect(a.state).toBe('ready');
    expect(a.bounces).toBe(0);
    expect(a.thread.some(n => n.kind === 'answer')).toBe(true);
  });

  it('enforces minimum tiers and raises them after repeated failures at one tier', () => {
    board = makeBoard([{ id: 'weak1', tier: 1 }, { id: 'weak2', tier: 1 }, { id: 'strong', tier: 3 }]);
    const [hard, plain] = start(board, [task('Hard', { minTier: 3, fileScope: ['h'] }), task('Plain', { fileScope: ['p'] })]);
    expectCode(() => board.claim('weak1', hard.id), 'not_allowed');
    board.claim('weak1', plain.id);
    board.release('weak1', plain.id, 'too hard');
    board.claim('weak2', plain.id);
    board.release('weak2', plain.id, 'too hard');
    expect(plain.minTier).toBe(2);
    expect(board.claimBlocker('weak1', plain)).toMatch(/tier/);
    expect(board.claimBlocker('strong', plain)).toBeNull();
  });

  it('sends a card to the user when no peer on the team meets its tier', () => {
    board = makeBoard([{ id: 'weak', tier: 1 }]);
    const [hard] = start(board, [task('Hard', { minTier: 3 })]);
    expect(board.escalateOrphans(['weak'])).toEqual([hard.id]);
    expect(hard.state).toBe('needs_user');
  });

  it('removes a harness and model at its usage limit without penalising its cards, and lets it rejoin', () => {
    board = makeBoard([
      { id: 'c1', harness: 'claude', model: 'opus' },
      { id: 'c2', harness: 'claude', model: 'opus' },
      { id: 'c3', harness: 'claude', model: 'sonnet' },
      { id: 'o1', harness: 'opencode', model: 'x' }
    ]);
    const [a] = start(board, [task('A')]);
    board.claim('c1', a.id);
    const removed = board.removeForUsageLimit('claude', 'opus', 'usage limit reached', clock + 60_000);
    expect(removed.sort()).toEqual(['c1', 'c2']);
    expect(board.activePeers().map(p => p.id).sort()).toEqual(['c3', 'o1']);
    expect(a.state).toBe('ready');
    expect(a.bounces).toBe(0);
    expect(a.failedBy).toEqual([]);
    expect(board.wakeReason('c1')).toBeNull();

    expect(board.peersDueToRejoin(600_000)).toEqual([]);
    clock += 60_001;
    expect(board.peersDueToRejoin(600_000).map(p => p.id).sort()).toEqual(['c1', 'c2']);
    board.rejoin('c1');
    expect(board.wakeReason('c1')).toEqual({ kind: 'claimable', cardIds: [a.id] });
    // It starts with no cards; nothing is handed back.
    expect(board.cards().filter(c => c.owner === 'c1')).toEqual([]);
  });

  it('keeps the spec out of reach: questions go to the user and block dependants', () => {
    const [a, b] = start(board, [task('A', { id: '1' }), task('B', { id: '2', dependsOn: ['1'] })]);
    board.claim('a', a.id);
    board.askUser('a', a.id, 'The spec says X but the code needs Y. Which?');
    expect(a.state).toBe('needs_user');
    expect(b.state).toBe('blocked');
    expect(board.wakeReason('a')).toBeNull();
  });

  it('creates one verify card when everything is finished and completes the goal when it passes', () => {
    board.setReviewMode('fast');
    const [a] = start(board, [task('A')], ['npm test']);
    expect(board.ensureVerifyCard()).toBeNull();
    board.claim('a', a.id);
    board.submit('a', a.id, { summary: 's' });
    board.merged(a.id);
    const verify = board.ensureVerifyCard()!;
    expect(verify.kind).toBe('verify');
    expect(verify.description).toContain('npm test');
    expect(board.ensureVerifyCard()).toBeNull();

    board.claim('b', verify.id);
    board.create('b', task('Fix', { fileScope: ['fix'] }), 'tests fail', board.data.planVersion);
    expect(board.submit('b', verify.id, { summary: 'npm test exit 1', passed: false }).outcome).toBe('verify_failed');
    expect(board.data.goal.status).toBe('running');

    const fix = board.cards().find(c => c.title === 'Fix')!;
    board.claim('a', fix.id);
    board.submit('a', fix.id, { summary: 'fixed' });
    board.merged(fix.id);
    const again = board.ensureVerifyCard()!;
    board.claim('b', again.id);
    board.submit('b', again.id, { summary: 'npm test exit 0', passed: true });
    expect(board.data.goal.status).toBe('completed');
  });

  it('pauses when verification fails and nobody created follow-up work', () => {
    board.setReviewMode('fast');
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    board.submit('a', a.id, { summary: 's' });
    board.merged(a.id);
    const verify = board.ensureVerifyCard()!;
    board.claim('a', verify.id);
    board.submit('a', verify.id, { summary: 'fails', passed: false });
    expect(board.data.goal.status).toBe('paused');
  });

  it('caps plan edits and turns, pausing for the user', () => {
    board.setLimits({ maxPlanEdits: 2, maxTurns: 2 });
    start(board, [task('A')]);
    board.create('a', task('B', { fileScope: ['b'] }), 'r', board.data.planVersion);
    board.create('a', task('C', { fileScope: ['c'] }), 'r', board.data.planVersion);
    expectCode(() => board.create('a', task('D', { fileScope: ['d'] }), 'r', board.data.planVersion), 'limit');
    expect(board.data.goal.status).toBe('paused');
    board.resume();
    expect(board.countTurn('a')).toBe(true);
    expect(board.countTurn('a')).toBe(true);
    expect(board.countTurn('a')).toBe(false);
    expect(board.data.goal.status).toBe('paused');
  });

  it('records every accepted change with who and why', () => {
    const [a] = start(board, [task('A')]);
    board.claim('a', a.id);
    board.release('a', a.id, 'wrong peer for this');
    const released = log.find(e => e.action === 'released')!;
    expect(released.actor).toBe('a');
    expect(released.reason).toBe('wrong peer for this');
    expect(log.map(e => e.version)).toEqual(log.map((_, i) => i + 1));
  });
});
