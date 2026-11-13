import path from 'node:path';
import fs from 'node:fs';
import { Board, BoardError } from './board.ts';
import { boardStore } from './board-store.ts';
import { getSession } from './session-store.ts';
import { worktreeManager } from './worktree-manager.ts';
import { Card, CardInput, CardPatch, PeerId } from '../shared/board.ts';
import { Session } from '../shared/types.ts';

/**
 * The tools a peer uses to read and change the board (docs/designs/peer-board.md, section 6).
 * The Board class decides whether a change is allowed; this layer adds the git work that goes
 * with a change: creating a card's worktree, committing and checking its diff, and merging.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolContext {
  sessionId: string;
  peerId: PeerId;
}

const str = (description: string) => ({ type: 'string', description });
const strList = (description: string) => ({ type: 'array', items: { type: 'string' }, description });
const planVersion = { type: 'number', description: 'The planVersion from your last board_read. Rejected if the plan changed since.' };

const cardFields = {
  title: str('Short title'),
  description: str('What to do and why'),
  acceptance: strList('How anyone can tell the card is finished. At least one.'),
  fileScope: strList('Paths or globs this card may change, relative to the repository root. Must not overlap cards that can run at the same time.'),
  dependsOn: strList('Ids of cards that must be finished first'),
  minTier: { type: 'number', enum: [1, 2, 3], description: 'Lowest peer tier allowed to claim it. Leave out unless the card needs a stronger model.' }
};

export const BOARD_TOOLS: ToolDefinition[] = [
  {
    name: 'board_read',
    description: 'Read the board: every card on one line, the team, what you may claim, and proposals waiting for you. Pass cardId to also get that card in full with its thread.',
    inputSchema: { type: 'object', properties: { cardId: str('Card to return in full') } }
  },
  {
    name: 'card_claim',
    description: 'Claim a ready card. The first claim wins. Returns the directory to work in; make all changes for the card there.',
    inputSchema: { type: 'object', properties: { cardId: str('Card to claim') }, required: ['cardId'] }
  },
  {
    name: 'card_note',
    description: "Add a comment to a card's thread. Each turn starts with no memory, so write down anything the next reader needs.",
    inputSchema: { type: 'object', properties: { cardId: str('Card'), text: str('The note') }, required: ['cardId', 'text'] }
  },
  {
    name: 'card_submit',
    description:
      'Hand in the card you hold. The board commits your changes for you, checks them against the file scope, and merges them or asks another peer to review. For a verify card pass `passed`.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: str('Card you hold'),
        summary: str('A few sentences: what you did and anything the next reader must know'),
        requestReview: { type: 'boolean', description: 'Ask for a review even if the change is small' },
        passed: { type: 'boolean', description: 'Verify cards only: whether verification passed' }
      },
      required: ['cardId', 'summary']
    }
  },
  {
    name: 'card_release',
    description: 'Give back a card you hold without finishing it. Work already on its branch is kept for whoever takes it next.',
    inputSchema: { type: 'object', properties: { cardId: str('Card you hold'), reason: str('Why') }, required: ['cardId', 'reason'] }
  },
  {
    name: 'card_block',
    description: 'Stop work on a card you hold until other cards are finished. Create the card that would unblock it first, then pass its id in waitFor.',
    inputSchema: {
      type: 'object',
      properties: { cardId: str('Card you hold'), reason: str('What is in the way'), waitFor: strList('Open cards this one must wait for') },
      required: ['cardId', 'reason', 'waitFor']
    }
  },
  {
    name: 'card_create',
    description: 'Add a work card to the plan.',
    inputSchema: {
      type: 'object',
      properties: { ...cardFields, reason: str('Why the plan needs this card'), review: { type: 'boolean', description: 'Require a review of this card' }, planVersion },
      required: ['title', 'description', 'acceptance', 'reason', 'planVersion']
    }
  },
  {
    name: 'card_split',
    description: 'Replace a card with two or more smaller cards. Cards that waited for the original wait for all parts.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: str('Card to split (unowned, or held by you)'),
        parts: { type: 'array', minItems: 2, items: { type: 'object', properties: cardFields, required: ['title', 'description', 'acceptance'] } },
        reason: str('Why'),
        planVersion
      },
      required: ['cardId', 'parts', 'reason', 'planVersion']
    }
  },
  {
    name: 'card_edit',
    description: "Change a card. On a card nobody holds, or one you hold, the change applies now. On a card another peer holds it becomes a proposal the owner answers.",
    inputSchema: {
      type: 'object',
      properties: { cardId: str('Card'), changes: { type: 'object', properties: cardFields }, reason: str('Why'), planVersion },
      required: ['cardId', 'changes', 'reason', 'planVersion']
    }
  },
  {
    name: 'card_cancel',
    description: 'Cancel a card that is no longer needed (unowned, or held by you).',
    inputSchema: { type: 'object', properties: { cardId: str('Card'), reason: str('Why'), planVersion }, required: ['cardId', 'reason', 'planVersion'] }
  },
  {
    name: 'card_delegate',
    description: 'Offer a card to a named peer. It cannot go back to a peer that already handed it on.',
    inputSchema: {
      type: 'object',
      properties: { cardId: str('Card (unowned, or held by you)'), toPeer: str('Peer id'), reason: str('Why that peer') },
      required: ['cardId', 'toPeer', 'reason']
    }
  },
  {
    name: 'proposal_answer',
    description: 'Accept or reject a proposal on a card you hold.',
    inputSchema: {
      type: 'object',
      properties: { cardId: str('Card you hold'), proposalId: str('Note id of the proposal'), accept: { type: 'boolean' }, reason: str('Why') },
      required: ['cardId', 'proposalId', 'accept']
    }
  },
  {
    name: 'review_verdict',
    description: 'Finish a review card you hold. Passing merges the work; rejecting sends it back with your findings.',
    inputSchema: {
      type: 'object',
      properties: { cardId: str('Review card you hold'), pass: { type: 'boolean' }, findings: str('What you checked and what you found') },
      required: ['cardId', 'pass', 'findings']
    }
  },
  {
    name: 'ask_user',
    description: 'Send the user one question about a card. Use it when only the user can decide, and always when the spec looks wrong or incomplete: peers never change the spec.',
    inputSchema: { type: 'object', properties: { cardId: str('Card the question is about'), question: str('One question') }, required: ['cardId', 'question'] }
  }
];

/** Serialises merges into one session's branch; two merges cannot run in the same worktree at once. */
const mergeQueues: Map<string, Promise<unknown>> = new Map();
function inSessionQueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const previous = mergeQueues.get(sessionId) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  mergeQueues.set(sessionId, next);
  return next;
}

function cardView(card: Card) {
  return {
    id: card.id,
    kind: card.kind,
    state: card.state,
    title: card.title,
    description: card.description,
    acceptance: card.acceptance,
    fileScope: card.fileScope,
    dependsOn: card.dependsOn,
    owner: card.owner,
    minTier: card.minTier,
    bounces: card.bounces,
    targetId: card.targetId,
    worktreePath: card.worktreePath,
    result: card.result,
    thread: card.thread.map(n => ({
      id: n.id,
      author: n.author,
      kind: n.kind,
      text: n.text,
      proposal: n.proposal ? { status: n.proposal.status, changes: n.proposal.patch } : undefined
    }))
  };
}

/** The spec's path relative to the repository root, or null when it lives outside the repository. */
function specRepoPath(session: Session, specPath: string | undefined): string | null {
  if (!specPath) return null;
  for (const root of [session.worktree.path, session.repoPath]) {
    const rel = path.relative(root, specPath);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.startsWith('.worktrees')) {
      return rel.split(path.sep).join('/');
    }
  }
  return null;
}

function cardBranchName(session: Session, card: Card): string {
  // "<session branch>--<card id>": a branch cannot live under another branch's name in git.
  return `${session.worktree.branch}--${card.id}`;
}

export class BoardTools {
  /** True when the session has a real git worktree, so cards can have their own. */
  async isManaged(session: Session): Promise<boolean> {
    return worktreeManager.isWorktreeRoot(session.worktree.path);
  }

  private context(ctx: ToolContext): { board: Board; session: Session } {
    const session = getSession(ctx.sessionId);
    if (!session) throw new BoardError('not_found', `Session ${ctx.sessionId} no longer exists`);
    return { board: boardStore.get(ctx.sessionId), session };
  }

  async call(ctx: ToolContext, name: string, args: any): Promise<unknown> {
    const { board, session } = this.context(ctx);
    const a = args || {};
    const peer = ctx.peerId;

    switch (name) {
      case 'board_read':
        return this.read(board, peer, a.cardId);
      case 'card_claim':
        return this.claim(board, session, peer, String(a.cardId));
      case 'card_note':
        board.note(peer, String(a.cardId), String(a.text || ''));
        return { ok: true };
      case 'card_submit':
        return this.submit(board, session, peer, String(a.cardId), a);
      case 'card_release':
        board.release(peer, String(a.cardId), String(a.reason || ''));
        return { ok: true, note: 'Released. Work on its branch is kept.' };
      case 'card_block':
        board.block(peer, String(a.cardId), String(a.reason || ''), Array.isArray(a.waitFor) ? a.waitFor.map(String) : []);
        return { ok: true };
      case 'card_create': {
        const card = board.create(peer, this.cardInput(a), String(a.reason || ''), a.planVersion);
        return { ok: true, cardId: card.id, state: card.state, planVersion: board.data.planVersion };
      }
      case 'card_split': {
        const before = board.card(String(a.cardId));
        const workspace = { branch: before.branch, path: before.worktreePath };
        const parts = board.split(peer, String(a.cardId), (a.parts || []).map((p: any) => this.cardInput(p)), String(a.reason || ''), a.planVersion);
        await this.dropWorkspace(board, session, before.id, workspace);
        return { ok: true, cardIds: parts.map(c => c.id), planVersion: board.data.planVersion };
      }
      case 'card_edit': {
        const result = board.edit(peer, String(a.cardId), this.cardPatch(a.changes), String(a.reason || ''), a.planVersion);
        return {
          ok: true,
          ...result,
          planVersion: board.data.planVersion,
          note: result.applied ? 'Applied.' : 'Stored as a proposal; the owner will answer it on their next turn.'
        };
      }
      case 'card_cancel': {
        const before = board.card(String(a.cardId));
        const workspace = { branch: before.branch, path: before.worktreePath };
        board.cancel(peer, String(a.cardId), String(a.reason || ''), a.planVersion);
        await this.dropWorkspace(board, session, before.id, workspace);
        return { ok: true, planVersion: board.data.planVersion };
      }
      case 'card_delegate':
        board.delegate(peer, String(a.cardId), String(a.toPeer), String(a.reason || ''));
        return { ok: true };
      case 'proposal_answer':
        board.answerProposal(peer, String(a.cardId), String(a.proposalId), a.accept === true, a.reason ? String(a.reason) : undefined);
        return { ok: true, planVersion: board.data.planVersion };
      case 'review_verdict':
        return this.reviewVerdict(board, session, peer, String(a.cardId), a.pass === true, String(a.findings || ''));
      case 'ask_user':
        board.askUser(peer, String(a.cardId), String(a.question || ''));
        return { ok: true, note: 'The user has been asked. The card is no longer yours; end your turn unless you have other work.' };
      default:
        throw new BoardError('not_found', `Unknown tool ${name}`);
    }
  }

  private cardInput(a: any): CardInput {
    return {
      title: String(a.title || ''),
      description: String(a.description || ''),
      acceptance: Array.isArray(a.acceptance) ? a.acceptance.map(String) : [],
      fileScope: Array.isArray(a.fileScope) ? a.fileScope.map(String) : undefined,
      dependsOn: Array.isArray(a.dependsOn) ? a.dependsOn.map(String) : undefined,
      minTier: [1, 2, 3].includes(a.minTier) ? a.minTier : undefined,
      review: a.review === true
    };
  }

  private cardPatch(changes: any): CardPatch {
    const c = changes || {};
    const patch: CardPatch = {};
    if (typeof c.title === 'string') patch.title = c.title;
    if (typeof c.description === 'string') patch.description = c.description;
    if (Array.isArray(c.acceptance)) patch.acceptance = c.acceptance.map(String);
    if (Array.isArray(c.fileScope)) patch.fileScope = c.fileScope.map(String);
    if (Array.isArray(c.dependsOn)) patch.dependsOn = c.dependsOn.map(String);
    if (c.minTier === null || [1, 2, 3].includes(c.minTier)) patch.minTier = c.minTier;
    return patch;
  }

  read(board: Board, peerId: PeerId, cardId?: string) {
    const me = board.data.peers[peerId];
    const proposals = board
      .cards()
      .filter(c => c.owner === peerId)
      .flatMap(c => c.thread.filter(n => n.proposal?.status === 'open').map(n => ({ cardId: c.id, proposalId: n.id, from: n.author, why: n.text, changes: n.proposal!.patch })));
    return {
      planVersion: board.data.planVersion,
      goal: { text: board.data.goal.text, status: board.data.goal.status, specPath: board.data.goal.specPath },
      reviewMode: board.data.reviewMode,
      you: me ? { id: me.id, tier: me.tier } : { id: peerId },
      team: Object.values(board.data.peers).map(p => ({ id: p.id, harness: p.harness, model: p.model, tier: p.tier, status: p.status })),
      cards: board.summaryLines(),
      yourCards: board.cards().filter(c => c.owner === peerId).map(c => c.id),
      claimable: board.claimableFor(peerId).map(c => c.id),
      proposalsForYou: proposals,
      card: cardId ? cardView(board.card(String(cardId))) : undefined
    };
  }

  private async claim(board: Board, session: Session, peerId: PeerId, cardId: string) {
    const card = board.claim(peerId, cardId);
    const managed = await this.isManaged(session);
    let extra: Record<string, unknown> = {};

    try {
      if (card.kind === 'work' && managed) {
        const branch = card.branch || cardBranchName(session, card);
        const dir = await worktreeManager.createCardWorktree(session.repoPath, branch, session.worktree.branch);
        board.setWorkspace(card.id, branch, dir);
      } else if (card.kind === 'merge-conflict' && managed && card.targetId) {
        const target = board.card(card.targetId);
        const branch = target.branch || cardBranchName(session, target);
        const dir = await worktreeManager.createCardWorktree(session.repoPath, branch, session.worktree.branch);
        await worktreeManager.startConflictResolution(dir, session.worktree.branch);
        board.setWorkspace(card.id, branch, dir);
      } else if (card.kind === 'review' && card.targetId) {
        const target = board.card(card.targetId);
        const dir = target.worktreePath && fs.existsSync(target.worktreePath) ? target.worktreePath : session.worktree.path;
        board.setWorkspace(card.id, undefined, dir);
        extra = {
          workUnderReview: cardView(target),
          diff: managed && target.worktreePath ? await worktreeManager.diffText(target.worktreePath, session.worktree.branch) : '(no git diff available; read the files)',
          instructions: 'Read the diff and the files. Do not change anything. Finish with review_verdict.'
        };
      } else {
        board.setWorkspace(card.id, undefined, session.worktree.path);
      }
    } catch (err: any) {
      board.unclaim(card.id, `Could not prepare a workspace for @${peerId}: ${err.message}`);
      throw new BoardError('bad_state', `Could not prepare a workspace for ${cardId}: ${err.message}`);
    }

    const fresh = board.card(card.id);
    return {
      ok: true,
      card: cardView(fresh),
      workIn: fresh.worktreePath,
      instructions:
        (extra.instructions as string) ||
        (fresh.kind === 'work' || fresh.kind === 'merge-conflict'
          ? `Make every change inside ${fresh.worktreePath}. Stay within the file scope. Do not run git commit, merge or branch commands: card_submit commits and merges for you.`
          : `Work in ${fresh.worktreePath}.`),
      ...extra
    };
  }

  private async submit(board: Board, session: Session, peerId: PeerId, cardId: string, a: any) {
    const card = board.card(cardId);
    const managed = await this.isManaged(session);
    const hasBranch = managed && !!card.branch && !!card.worktreePath && (card.kind === 'work' || card.kind === 'merge-conflict');
    let diff;

    if (hasBranch && card.owner === peerId && card.state === 'claimed') {
      await worktreeManager.commitAll(card.worktreePath!, `${card.id}: ${card.title}`);
      diff = await worktreeManager.diffStat(card.worktreePath!, session.worktree.branch);

      // The spec is what the user approved; no card may change it.
      const rel = specRepoPath(session, board.data.goal.specPath);
      if (rel) {
        if (diff.files.includes(rel)) {
          throw new BoardError('not_allowed', `The spec (${rel}) cannot be changed by a card. Undo that change and use ask_user if the spec is wrong.`);
        }
      }
    }

    const outcome = board.submit(peerId, cardId, {
      summary: String(a.summary || ''),
      diff: card.kind === 'work' ? diff : undefined,
      requestReview: a.requestReview === true,
      passed: a.passed === true
    });

    if (outcome.outcome === 'review') {
      return { ok: true, outcome: 'in_review', reviewCardId: outcome.reviewCardId, note: 'Another peer will review it. This card is no longer yours.' };
    }
    if (outcome.outcome === 'merge') {
      return { ok: true, ...(await this.merge(board, session, cardId)) };
    }
    if (outcome.outcome === 'verify_failed') {
      return { ok: true, outcome: 'verify_failed', note: 'Recorded. A new verification runs once the cards you created are finished.' };
    }
    return { ok: true, outcome: 'done' };
  }

  /** Merges a card's branch into the session branch, or opens a conflict card if it cannot. */
  private merge(board: Board, session: Session, cardId: string): Promise<Record<string, unknown>> {
    return inSessionQueue(session.id, async () => {
      const card = board.card(cardId);
      if (!card.branch || !(await this.isManaged(session))) {
        board.merged(cardId);
        return { outcome: 'done' };
      }
      const result = await worktreeManager.mergeCardBranch(session.worktree.path, card.branch, `Merge ${card.id}: ${card.title}`);
      if (result.ok) {
        const workspace = { branch: card.branch, path: card.worktreePath };
        board.merged(cardId, result.commit);
        await this.dropWorkspace(board, session, cardId, workspace);
        return { outcome: 'done', commit: result.commit };
      }
      const conflict = board.mergeConflicted(cardId, result.files);
      return {
        outcome: 'merge_conflict',
        conflictCardId: conflict.id,
        note: `The merge conflicted in ${result.files.join(', ') || 'unknown files'}. A card was opened to resolve it.`
      };
    });
  }

  private async reviewVerdict(board: Board, session: Session, peerId: PeerId, cardId: string, pass: boolean, findings: string) {
    const verdict = board.reviewVerdict(peerId, cardId, pass, findings);
    if (verdict.outcome === 'rejected') {
      return { ok: true, outcome: 'rejected', note: `${verdict.targetId} went back to the board with your findings.` };
    }
    return { ok: true, ...(await this.merge(board, session, verdict.targetId)) };
  }

  private async dropWorkspace(board: Board, session: Session, cardId: string, workspace: { branch?: string; path?: string }) {
    if (!workspace.path || !workspace.branch) return;
    // Never remove the session's own worktree.
    if (path.resolve(workspace.path) === path.resolve(session.worktree.path)) return;
    // A conflict card shares its target's worktree; it goes when either of them is done.
    try {
      await worktreeManager.removeCardWorktree(session.repoPath, workspace.path, workspace.branch);
    } catch (err) {
      console.warn(`Could not remove worktree for ${cardId}:`, err);
    }
    for (const card of board.cards()) {
      if (card.worktreePath === workspace.path) board.clearWorkspace(card.id);
    }
  }

  /** Removes every card worktree of a session, when the session is deleted. */
  async dropAllWorkspaces(session: Session) {
    if (!boardStore.has(session.id)) return;
    const board = boardStore.get(session.id);
    const seen = new Set<string>();
    for (const card of board.cards()) {
      if (card.worktreePath && card.branch && !seen.has(card.worktreePath)) {
        seen.add(card.worktreePath);
        await this.dropWorkspace(board, session, card.id, { branch: card.branch, path: card.worktreePath });
      }
    }
  }
}

export const boardTools = new BoardTools();
