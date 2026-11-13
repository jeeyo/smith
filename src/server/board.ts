import {
  BoardData,
  BoardLimits,
  BoardLogEntry,
  Card,
  CardInput,
  CardPatch,
  CardState,
  DEFAULT_LIMITS,
  DiffStat,
  HarnessId,
  Note,
  NoteKind,
  Peer,
  PeerId,
  ReviewMode,
  SpecTasks,
  Tier
} from '../shared/board.ts';

/**
 * The board is the only state a team of peers shares. This class holds the cards and the
 * referee rules that accept or reject a change. It never proposes a change itself, and it
 * performs no I/O: git work and persistence are done by its callers.
 * See docs/designs/peer-board.md, sections 4 and 5.
 */

export type BoardErrorCode =
  | 'not_found'
  | 'bad_state'
  | 'not_owner'
  | 'not_allowed'
  | 'stale'
  | 'scope_conflict'
  | 'out_of_scope'
  | 'limit'
  | 'invalid';

export class BoardError extends Error {
  constructor(public code: BoardErrorCode, message: string, public detail?: unknown) {
    super(message);
    this.name = 'BoardError';
  }
}

type Actor = PeerId | 'board' | 'user' | 'spec';

const RESOLVED: CardState[] = ['done', 'cancelled'];
const MAX_NOTE_CHARS = 2000;
const MAX_SUMMARY_CHARS = 600;

// ---------------------------------------------------------------------------------------
// File scopes
// ---------------------------------------------------------------------------------------

function normalizeScope(pattern: string): string {
  return pattern.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function isEverything(pattern: string): boolean {
  return pattern === '*' || pattern === '**' || pattern === '**/*' || pattern === '';
}

/** A trailing "/*" is read as "everything under this directory", which is what authors mean by it. */
function subtreeBase(pattern: string): string | null {
  const m = pattern.match(/^([^*?]+)\/\*{1,2}(\/\*)?$/);
  return m ? m[1] : null;
}

function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** True when `file` (repo-relative) is covered by at least one scope pattern. */
export function matchesScope(file: string, scope: string[]): boolean {
  const f = normalizeScope(file);
  return scope.some(raw => {
    const p = normalizeScope(raw);
    if (isEverything(p)) return true;
    const base = subtreeBase(p);
    if (base !== null) return f === base || f.startsWith(base + '/');
    if (!/[*?]/.test(p)) return f === p || f.startsWith(p + '/');
    return globToRegExp(p).test(f);
  });
}

function patternsOverlap(a: string, b: string): boolean {
  const p1 = normalizeScope(a);
  const p2 = normalizeScope(b);
  if (isEverything(p1) || isEverything(p2)) return true;
  const lit1 = !/[*?]/.test(p1);
  const lit2 = !/[*?]/.test(p2);
  if (lit1 && lit2) {
    return p1 === p2 || p1.startsWith(p2 + '/') || p2.startsWith(p1 + '/');
  }
  if (lit1) return matchesScope(p1, [p2]) || staticPrefix(p2).startsWith(p1 + '/');
  if (lit2) return matchesScope(p2, [p1]) || staticPrefix(p1).startsWith(p2 + '/');
  // Two globs: compare the fixed part before the first wildcard. This errs towards reporting
  // an overlap, which only costs a rejected claim.
  const s1 = staticPrefix(p1);
  const s2 = staticPrefix(p2);
  return s1.startsWith(s2) || s2.startsWith(s1);
}

function staticPrefix(pattern: string): string {
  const idx = pattern.search(/[*?]/);
  return idx === -1 ? pattern : pattern.slice(0, idx);
}

export function scopesOverlap(a: string[], b: string[]): [string, string] | null {
  for (const x of a) {
    for (const y of b) {
      if (patternsOverlap(x, y)) return [x, y];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------------------

export interface BoardHooks {
  /** Called after every accepted change, with the log entry that describes it. */
  onChange?: (entry: BoardLogEntry, board: Board) => void;
}

export interface SubmitInput {
  summary: string;
  /** Changed files and line count on the card's branch; omitted when there is no git worktree. */
  diff?: DiffStat;
  requestReview?: boolean;
  /** Verify cards only. */
  passed?: boolean;
}

export type SubmitOutcome =
  | { outcome: 'done' }
  | { outcome: 'review'; reviewCardId: string }
  | { outcome: 'merge' }
  | { outcome: 'verify_failed' };

export type WakeReason =
  | { kind: 'proposal'; cardId: string }
  | { kind: 'continue'; cardId: string }
  | { kind: 'claimable'; cardIds: string[] };

export function emptyBoard(sessionId: string, overrides: Partial<BoardLimits> = {}): BoardData {
  return {
    sessionId,
    version: 0,
    planVersion: 0,
    cards: {},
    order: [],
    peers: {},
    reviewMode: 'normal',
    limits: { ...DEFAULT_LIMITS, ...overrides },
    goal: { text: '', status: 'idle', verifyCommands: [] },
    counters: { nextCard: 1, nextNote: 1, planEdits: 0, turns: 0 }
  };
}

export class Board {
  constructor(public data: BoardData, private hooks: BoardHooks = {}, private now: () => number = Date.now) {
    // Tolerate boards written by an older build.
    this.data.limits = { ...DEFAULT_LIMITS, ...this.data.limits };
  }

  get sessionId(): string {
    return this.data.sessionId;
  }

  // ---- internals ------------------------------------------------------------------------

  private record(actor: Actor, action: string, extra: { cardId?: string; reason?: string; detail?: string; plan?: boolean } = {}) {
    this.data.version += 1;
    if (extra.plan) this.data.planVersion += 1;
    const entry: BoardLogEntry = {
      version: this.data.version,
      at: this.now(),
      actor,
      action,
      cardId: extra.cardId,
      reason: extra.reason,
      detail: extra.detail
    };
    this.hooks.onChange?.(entry, this);
  }

  card(cardId: string): Card {
    const card = this.data.cards[cardId];
    if (!card) throw new BoardError('not_found', `Card ${cardId} does not exist`);
    return card;
  }

  private peer(peerId: PeerId): Peer {
    const peer = this.data.peers[peerId];
    if (!peer) throw new BoardError('not_found', `Peer ${peerId} is not on this team`);
    return peer;
  }

  private activePeer(peerId: PeerId): Peer {
    const peer = this.peer(peerId);
    if (peer.status !== 'active') throw new BoardError('not_allowed', `Peer ${peerId} is not on the team right now`);
    return peer;
  }

  cards(): Card[] {
    return this.data.order.map(id => this.data.cards[id]).filter(Boolean);
  }

  private addNote(card: Card, author: Note['author'], kind: NoteKind, text: string, proposal?: Note['proposal']): Note {
    const note: Note = {
      id: `n${this.data.counters.nextNote++}`,
      author,
      at: this.now(),
      kind,
      text: text.length > MAX_NOTE_CHARS ? text.slice(0, MAX_NOTE_CHARS) + ' …[truncated]' : text,
      proposal
    };
    card.thread.push(note);
    card.updatedAt = note.at;
    return note;
  }

  private depsResolved(card: Card): boolean {
    return card.dependsOn.every(id => {
      const dep = this.data.cards[id];
      return !dep || RESOLVED.includes(dep.state);
    });
  }

  private setReady(card: Card) {
    card.owner = undefined;
    card.leaseExpiresAt = undefined;
    if (this.depsResolved(card)) {
      card.state = 'ready';
      card.readySince = this.now();
      card.blocker = undefined;
    } else {
      card.state = 'blocked';
      card.readySince = undefined;
    }
    card.updatedAt = this.now();
  }

  /** Re-evaluates blocked cards after a card is resolved. */
  private unblockDependants() {
    for (const card of this.cards()) {
      if (card.state === 'blocked' && this.depsResolved(card)) {
        card.state = 'ready';
        card.readySince = this.now();
        card.blocker = undefined;
        card.updatedAt = this.now();
        this.addNote(card, 'board', 'decision', 'Unblocked: everything this card was waiting for is finished.');
      }
    }
  }

  private wouldCycle(cardId: string, dependsOn: string[]): boolean {
    const seen = new Set<string>();
    const stack = [...dependsOn];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === cardId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const c = this.data.cards[id];
      if (c) stack.push(...c.dependsOn);
    }
    return false;
  }

  private checkDeps(cardId: string | null, dependsOn: string[]) {
    for (const id of dependsOn) {
      if (!this.data.cards[id]) throw new BoardError('invalid', `Dependency ${id} does not exist`);
    }
    if (cardId && this.wouldCycle(cardId, dependsOn)) {
      throw new BoardError('invalid', `Those dependencies would make ${cardId} wait on itself`);
    }
  }

  private checkPlanVersion(planVersion: number | undefined) {
    if (planVersion === undefined || planVersion !== this.data.planVersion) {
      throw new BoardError(
        'stale',
        `The plan changed since you read it (you sent planVersion ${planVersion ?? 'none'}, it is now ${this.data.planVersion}). Call board_read and decide again.`,
        { planVersion: this.data.planVersion }
      );
    }
  }

  private countPlanEdit() {
    if (this.data.counters.planEdits >= this.data.limits.maxPlanEdits) {
      this.pause(`The team has changed the plan ${this.data.counters.planEdits} times. Review the board and resume to allow more changes.`);
      throw new BoardError('limit', 'The plan-edit limit for this goal is reached; further edits need the user to resume the goal.');
    }
    this.data.counters.planEdits += 1;
  }

  private wipOf(peerId: PeerId): number {
    return this.cards().filter(c => c.owner === peerId && c.state === 'claimed').length;
  }

  private newCard(input: CardInput, createdBy: Card['createdBy'], extra: Partial<Card> = {}): Card {
    const acceptance = (input.acceptance || []).map(a => String(a).trim()).filter(Boolean);
    if (!input.title?.trim()) throw new BoardError('invalid', 'A card needs a title');
    if (acceptance.length === 0) {
      throw new BoardError('invalid', 'A card needs at least one acceptance criterion');
    }
    const id = extra.id || `c${this.data.counters.nextCard++}`;
    const dependsOn = Array.from(new Set(input.dependsOn || []));
    this.checkDeps(null, dependsOn);
    const at = this.now();
    const card: Card = {
      id,
      title: input.title.trim(),
      description: (input.description || '').trim(),
      acceptance,
      kind: input.kind || 'work',
      state: 'ready',
      fileScope: (input.fileScope && input.fileScope.length > 0 ? input.fileScope : ['*']).map(normalizeScope).map(s => s || '*'),
      dependsOn,
      minTier: input.minTier,
      createdBy,
      delegationChain: [],
      bounces: 0,
      failedBy: [],
      reviewRequested: input.review || undefined,
      thread: [],
      createdAt: at,
      updatedAt: at,
      ...extra
    };
    this.data.cards[id] = card;
    this.data.order.push(id);
    this.setReady(card);
    return card;
  }

  // ---- peers ----------------------------------------------------------------------------

  setPeers(peers: Array<{ id: PeerId; harness: HarnessId; model: string; tier?: Tier }>) {
    const next: Record<PeerId, Peer> = {};
    for (const p of peers) {
      const existing = this.data.peers[p.id];
      next[p.id] = {
        id: p.id,
        harness: p.harness,
        model: p.model,
        tier: p.tier || existing?.tier || 2,
        status: existing?.status || 'active',
        removed: existing?.removed,
        turns: existing?.turns || 0
      };
    }
    this.data.peers = next;
    this.record('user', 'team_set', { detail: peers.map(p => `${p.id} (${p.harness} · ${p.model})`).join(', ') });
  }

  activePeers(): Peer[] {
    return Object.values(this.data.peers).filter(p => p.status === 'active');
  }

  /**
   * A harness and model that hit its usage limit leaves the team. Cards its peers held go
   * back to ready; this is not a failure, so they do not bounce.
   */
  removeForUsageLimit(harness: HarnessId, model: string, reason: string, rejoinAt?: number): PeerId[] {
    const removed: PeerId[] = [];
    for (const peer of this.activePeers()) {
      if (peer.harness !== harness || peer.model !== model) continue;
      peer.status = 'removed';
      peer.removed = { reason, at: this.now(), rejoinAt };
      removed.push(peer.id);
      for (const card of this.cards()) {
        if (card.owner === peer.id && card.state === 'claimed') {
          this.addNote(
            card,
            'board',
            'decision',
            `@${peer.id} left the team (${reason}). The work so far is kept on this card's branch; continue from the files already there.`
          );
          this.setReady(card);
        }
      }
    }
    if (removed.length > 0) {
      this.record('board', 'peers_removed', { reason, detail: removed.join(', ') });
    }
    return removed;
  }

  /** Removed peers whose reset time has passed, or that have no reset time and are due a re-check. */
  peersDueToRejoin(recheckMs: number): Peer[] {
    const now = this.now();
    return Object.values(this.data.peers).filter(p => {
      if (p.status !== 'removed' || !p.removed) return false;
      return p.removed.rejoinAt !== undefined ? p.removed.rejoinAt <= now : now - p.removed.at >= recheckMs;
    });
  }

  rejoin(peerId: PeerId) {
    const peer = this.peer(peerId);
    if (peer.status === 'active') return;
    peer.status = 'active';
    peer.removed = undefined;
    this.record('board', 'peer_rejoined', { detail: peerId });
  }

  /** Pushes back the next rejoin check for a peer that is still limited. */
  deferRejoin(peerId: PeerId, rejoinAt?: number) {
    const peer = this.peer(peerId);
    if (peer.removed) peer.removed = { ...peer.removed, at: this.now(), rejoinAt };
  }

  // ---- goal -----------------------------------------------------------------------------

  /** Turns the task list at the end of an approved spec into cards. No agent is involved. */
  startGoal(text: string, specPath: string | undefined, spec: SpecTasks | null) {
    this.data.goal = {
      text,
      specPath,
      status: 'running',
      verifyCommands: spec?.verify || [],
      startedAt: this.now()
    };
    this.data.counters.planEdits = 0;
    this.data.counters.turns = 0;

    if (spec && spec.tasks.length > 0) {
      // Spec tasks may refer to each other by their own ids; map those to card ids.
      const idMap = new Map<string, string>();
      const created: Card[] = [];
      for (const task of spec.tasks) {
        const card = this.newCard({ ...task, dependsOn: [] }, 'spec');
        if (task.id) idMap.set(task.id, card.id);
        created.push(card);
      }
      spec.tasks.forEach((task, i) => {
        const deps = (task.dependsOn || []).map(d => idMap.get(d) || d).filter(d => this.data.cards[d]);
        created[i].dependsOn = deps;
        this.setReady(created[i]);
      });
    } else {
      this.newCard(
        {
          kind: 'plan',
          title: 'Break this goal into cards',
          description:
            'Read the spec and the repository, then create the work cards with card_create. Give each card acceptance criteria, a file scope that does not overlap other cards, and its dependencies. Submit this card when the board describes the whole goal.',
          acceptance: ['Every part of the goal is covered by a card', 'No two cards that can run at the same time share files'],
          fileScope: ['*']
        },
        'board'
      );
    }
    this.record('user', 'goal_started', { detail: text.slice(0, 200), plan: true });
  }

  pause(reason: string) {
    if (this.data.goal.status !== 'running') return;
    this.data.goal.status = 'paused';
    this.data.goal.pauseReason = reason;
    this.record('board', 'goal_paused', { reason });
  }

  resume() {
    if (this.data.goal.status !== 'paused') return;
    this.data.goal.status = 'running';
    this.data.goal.pauseReason = undefined;
    this.data.counters.planEdits = 0;
    this.data.counters.turns = 0;
    this.record('user', 'goal_resumed');
  }

  /** Notes that the goal is running but cannot move right now, without pausing it. */
  setWaiting(reason: string | undefined) {
    if (this.data.goal.waitingReason === reason) return;
    this.data.goal.waitingReason = reason;
    this.record('board', reason ? 'goal_waiting' : 'goal_moving', { reason });
  }

  /** A request the user adds while a goal is under way becomes a card like any other. */
  createByUser(input: CardInput): Card {
    const card = this.newCard({ ...input, kind: 'work' }, 'user');
    this.record('user', 'created', { cardId: card.id, detail: card.title, plan: true });
    return card;
  }

  /** The user may change any open card directly. */
  userEdit(cardId: string, patch: CardPatch) {
    const card = this.card(cardId);
    if (RESOLVED.includes(card.state)) throw new BoardError('bad_state', `${cardId} is ${card.state} and cannot be changed`);
    this.applyPatch(card, patch);
    this.addNote(card, 'user', 'decision', `The user changed ${Object.keys(patch).join(', ')}.`);
    this.record('user', 'edited', { cardId, detail: Object.keys(patch).join(', '), plan: true });
  }

  setLimits(limits: Partial<BoardLimits>) {
    for (const [key, value] of Object.entries(limits)) {
      if (key in this.data.limits && typeof value === 'number' && Number.isFinite(value) && value > 0) {
        (this.data.limits as any)[key] = value;
      }
    }
    this.record('user', 'limits_set', { detail: Object.keys(limits).join(', ') });
  }

  setReviewMode(mode: ReviewMode) {
    this.data.reviewMode = mode;
    this.record('user', 'review_mode_set', { detail: mode });
  }

  /** Counts a turn; returns false when the turn cap is reached and the goal has been paused. */
  countTurn(peerId: PeerId): boolean {
    if (this.data.counters.turns >= this.data.limits.maxTurns) {
      this.pause(`The team has used ${this.data.counters.turns} turns on this goal. Review the board and resume to continue.`);
      return false;
    }
    this.data.counters.turns += 1;
    const peer = this.data.peers[peerId];
    if (peer) peer.turns += 1;
    // A turn renews the leases the peer holds.
    for (const card of this.cards()) {
      if (card.owner === peerId && card.state === 'claimed') {
        card.leaseExpiresAt = this.now() + this.data.limits.leaseMs;
      }
    }
    return true;
  }

  // ---- reading --------------------------------------------------------------------------

  /** Why a peer cannot claim a card, or null if it can. */
  claimBlocker(peerId: PeerId, card: Card, opts: { ignoreRule11?: boolean } = {}): string | null {
    const peer = this.data.peers[peerId];
    if (!peer || peer.status !== 'active') return 'you are not on the team right now';
    if (card.state !== 'ready') return `card is ${card.state}`;
    if (!this.depsResolved(card)) return 'its dependencies are not finished';
    if (card.offeredTo && card.offeredTo.peer !== peerId && card.offeredTo.until > this.now()) {
      const offered = this.data.peers[card.offeredTo.peer];
      if (offered?.status === 'active') return `it is on offer to @${card.offeredTo.peer}`;
    }
    if (card.minTier && peer.tier < card.minTier) return `it needs tier ${card.minTier} and you are tier ${peer.tier}`;
    if (this.wipOf(peerId) >= this.data.limits.wipPerPeer) return 'you already hold a card; submit, release or block it first';
    if (card.kind === 'review') {
      const target = card.targetId ? this.data.cards[card.targetId] : undefined;
      if (target?.author === peerId) return 'you wrote the work under review';
    }
    if (card.kind === 'work') {
      for (const other of this.cards()) {
        if (other.id === card.id || other.kind !== 'work' || other.state !== 'claimed') continue;
        const clash = scopesOverlap(card.fileScope, other.fileScope);
        if (clash) return `its scope '${clash[0]}' overlaps '${clash[1]}' on ${other.id}, held by @${other.owner}`;
      }
    }
    if (!opts.ignoreRule11 && card.failedBy.includes(peerId)) {
      // Rule 11: give someone else the next attempt if anyone else is free to take it.
      const someoneElse = this.activePeers().some(
        other => other.id !== peerId && !card.failedBy.includes(other.id) && this.claimBlocker(other.id, card, { ignoreRule11: true }) === null
      );
      if (someoneElse) return 'you already attempted this card and another peer is free to take it';
    }
    return null;
  }

  claimableFor(peerId: PeerId): Card[] {
    return this.cards().filter(c => this.claimBlocker(peerId, c) === null);
  }

  wakeReason(peerId: PeerId): WakeReason | null {
    const peer = this.data.peers[peerId];
    if (!peer || peer.status !== 'active') return null;
    for (const card of this.cards()) {
      if (card.owner === peerId && card.thread.some(n => n.proposal?.status === 'open')) {
        return { kind: 'proposal', cardId: card.id };
      }
    }
    const held = this.cards().find(c => c.owner === peerId && c.state === 'claimed');
    if (held) return { kind: 'continue', cardId: held.id };
    const claimable = this.claimableFor(peerId);
    // Cards on offer to this peer come first.
    claimable.sort((a, b) => Number(b.offeredTo?.peer === peerId) - Number(a.offeredTo?.peer === peerId));
    return claimable.length > 0 ? { kind: 'claimable', cardIds: claimable.map(c => c.id) } : null;
  }

  openCards(): Card[] {
    return this.cards().filter(c => !RESOLVED.includes(c.state));
  }

  /** One line per card: the compact view each turn's prompt carries. */
  summaryLines(): string[] {
    return this.cards().map(card => {
      if (card.state === 'done') {
        return `${card.id} [done] ${card.title} — ${(card.result?.summary || '').slice(0, 160)}`;
      }
      if (card.state === 'cancelled') return `${card.id} [cancelled] ${card.title}`;
      const parts = [`${card.id} [${card.state}${card.kind !== 'work' ? ` ${card.kind}` : ''}] ${card.title}`];
      if (card.owner) parts.push(`owner @${card.owner}`);
      parts.push(`scope ${card.fileScope.join(', ')}`);
      if (card.dependsOn.length) parts.push(`after ${card.dependsOn.join(', ')}`);
      if (card.minTier) parts.push(`min tier ${card.minTier}`);
      if (card.offeredTo && card.offeredTo.until > this.now()) parts.push(`offered to @${card.offeredTo.peer}`);
      return parts.join(' | ');
    });
  }

  // ---- peer actions ---------------------------------------------------------------------

  claim(peerId: PeerId, cardId: string): Card {
    this.activePeer(peerId);
    const card = this.card(cardId);
    const blocker = this.claimBlocker(peerId, card);
    if (blocker) {
      const code: BoardErrorCode = blocker.includes('overlaps') ? 'scope_conflict' : card.state !== 'ready' ? 'bad_state' : 'not_allowed';
      throw new BoardError(code, `Cannot claim ${cardId}: ${blocker}`);
    }
    card.owner = peerId;
    card.state = 'claimed';
    card.leaseExpiresAt = this.now() + this.data.limits.leaseMs;
    card.offeredTo = undefined;
    card.readySince = undefined;
    card.updatedAt = this.now();
    this.record(peerId, 'claimed', { cardId });
    return card;
  }

  note(author: PeerId | 'user', cardId: string, text: string): Note {
    if (author !== 'user') this.activePeer(author);
    const card = this.card(cardId);
    if (!text?.trim()) throw new BoardError('invalid', 'A note needs text');
    const note = this.addNote(card, author, 'comment', text.trim());
    this.record(author, 'noted', { cardId });
    return note;
  }

  private ownedClaimed(peerId: PeerId, cardId: string): Card {
    this.activePeer(peerId);
    const card = this.card(cardId);
    if (card.state !== 'claimed') throw new BoardError('bad_state', `${cardId} is ${card.state}, not claimed`);
    if (card.owner !== peerId) throw new BoardError('not_owner', `${cardId} is held by @${card.owner}, not you`);
    return card;
  }

  /** Files changed outside the card's scope. */
  outOfScope(cardId: string, files: string[]): string[] {
    const card = this.card(cardId);
    return files.filter(f => !matchesScope(f, card.fileScope));
  }

  private needsReview(card: Card, input: SubmitInput): boolean {
    if (this.data.reviewMode === 'fast') return false;
    // A review must be done by someone else; with nobody else on the team there is none.
    if (!this.activePeers().some(p => p.id !== card.owner)) return false;
    if (this.data.reviewMode === 'thorough') return true;
    const diff = input.diff;
    return Boolean(
      card.reviewRequested ||
        input.requestReview ||
        card.bounces > 0 ||
        (diff && (diff.lines > this.data.limits.reviewLines || diff.files.length > this.data.limits.reviewFiles))
    );
  }

  submit(peerId: PeerId, cardId: string, input: SubmitInput): SubmitOutcome {
    const card = this.ownedClaimed(peerId, cardId);
    const summary = (input.summary || '').trim().slice(0, MAX_SUMMARY_CHARS);
    if (!summary) throw new BoardError('invalid', 'A submit needs a summary of what was done');

    if (card.kind === 'review') {
      throw new BoardError('invalid', 'Use review_verdict to finish a review card');
    }

    if (card.kind === 'work' && input.diff) {
      const stray = this.outOfScope(cardId, input.diff.files);
      if (stray.length > 0) {
        throw new BoardError(
          'out_of_scope',
          `These files are outside ${cardId}'s scope (${card.fileScope.join(', ')}): ${stray.join(', ')}. Undo those changes, or widen the scope with card_edit and submit again.`,
          { files: stray }
        );
      }
    }

    card.author = peerId;
    this.addNote(card, peerId, 'result', summary);

    if (card.kind === 'plan') {
      this.finish(card, { summary });
      this.record(peerId, 'submitted', { cardId, detail: summary });
      return { outcome: 'done' };
    }

    if (card.kind === 'verify') {
      const passed = input.passed === true;
      this.finish(card, { summary, passed });
      if (passed) {
        this.data.goal.status = 'completed';
        this.data.goal.completedAt = this.now();
        this.record(peerId, 'goal_completed', { cardId, detail: summary });
        return { outcome: 'done' };
      }
      this.record(peerId, 'verify_failed', { cardId, detail: summary });
      if (this.openCards().length === 0) {
        this.pause(`Verification failed and no follow-up cards were created: ${summary}`);
      }
      return { outcome: 'verify_failed' };
    }

    card.result = { summary };
    card.owner = undefined;
    card.leaseExpiresAt = undefined;
    card.state = 'in_review';
    card.updatedAt = this.now();

    if (card.kind === 'work' && this.needsReview({ ...card, owner: peerId }, input)) {
      const review = this.newCard(
        {
          kind: 'review',
          title: `Review: ${card.title}`,
          description: `Check the change on ${card.id} against its acceptance criteria and the spec. Read the diff; do not rely on the author's summary.`,
          acceptance: card.acceptance,
          fileScope: card.fileScope
        },
        'board',
        { targetId: card.id }
      );
      this.record(peerId, 'submitted', { cardId, detail: `review ${review.id} created` });
      return { outcome: 'review', reviewCardId: review.id };
    }

    this.record(peerId, 'submitted', { cardId, detail: summary });
    return { outcome: 'merge' };
  }

  private finish(card: Card, result: Card['result']) {
    card.state = 'done';
    card.owner = undefined;
    card.leaseExpiresAt = undefined;
    card.result = result;
    card.updatedAt = this.now();
    this.unblockDependants();
  }

  /** Called once a card's branch is merged into the session branch (or there was nothing to merge). */
  merged(cardId: string, commit?: string) {
    const card = this.card(cardId);
    if (card.state !== 'in_review') throw new BoardError('bad_state', `${cardId} is ${card.state}, not awaiting merge`);
    this.finish(card, { summary: card.result?.summary || '', commit });
    if (card.kind === 'merge-conflict' && card.targetId) {
      const target = this.data.cards[card.targetId];
      if (target && target.state === 'in_review') {
        this.finish(target, { summary: target.result?.summary || '', commit });
      }
    }
    this.record('board', 'merged', { cardId, detail: commit });
  }

  /** The card's branch did not merge cleanly: a peer has to resolve it. */
  mergeConflicted(cardId: string, files: string[]): Card {
    const card = this.card(cardId);
    const targetId = card.kind === 'merge-conflict' && card.targetId ? card.targetId : card.id;
    const target = this.card(targetId);
    if (card.kind === 'merge-conflict') {
      // The resolution itself went stale; close it and open a fresh one.
      card.state = 'cancelled';
      card.updatedAt = this.now();
    }
    const conflict = this.newCard(
      {
        kind: 'merge-conflict',
        title: `Resolve merge conflict: ${target.title}`,
        description: `Merging ${target.id} into the session branch conflicted in: ${files.join(', ') || 'unknown files'}. The session branch has been merged into this card's worktree and the conflict markers are in the files. Resolve them so both changes are kept, then submit.`,
        acceptance: ['No conflict markers remain', `The acceptance criteria of ${target.id} still hold`],
        fileScope: files.length > 0 ? files : target.fileScope
      },
      'board',
      { targetId }
    );
    this.record('board', 'merge_conflict', { cardId: targetId, detail: `${conflict.id}: ${files.join(', ')}` });
    return conflict;
  }

  private bounce(card: Card, peerId: PeerId | undefined, why: string) {
    card.bounces += 1;
    if (peerId && !card.failedBy.includes(peerId)) card.failedBy.push(peerId);
    this.addNote(card, 'board', 'decision', why);

    // Peers of one tier keep failing it: require a stronger peer, if the team has one.
    if (card.failedBy.length >= 2) {
      const tiers = card.failedBy.map(id => this.data.peers[id]?.tier || 1);
      const top = Math.max(...tiers) as Tier;
      if (top < 3 && this.activePeers().some(p => p.tier > top) && (card.minTier || 1) <= top) {
        card.minTier = (top + 1) as Tier;
        this.addNote(card, 'board', 'decision', `Raised the minimum tier to ${card.minTier} after repeated attempts at tier ${top}.`);
      }
    }

    if (card.bounces >= this.data.limits.maxBounces) {
      card.owner = undefined;
      card.leaseExpiresAt = undefined;
      card.state = 'needs_user';
      card.resumeState = 'ready';
      card.updatedAt = this.now();
      this.addNote(
        card,
        'board',
        'question',
        `This card has come back ${card.bounces} times without being finished. How should the team proceed?`
      );
    } else {
      this.setReady(card);
    }
  }

  release(peerId: PeerId, cardId: string, reason: string) {
    const card = this.ownedClaimed(peerId, cardId);
    if (!reason?.trim()) throw new BoardError('invalid', 'Releasing a card needs a reason');
    this.bounce(card, peerId, `@${peerId} released this card: ${reason.trim()}`);
    this.record(peerId, 'released', { cardId, reason: reason.trim() });
  }

  /** Stops work on a card until other cards are finished. */
  block(peerId: PeerId, cardId: string, reason: string, waitFor: string[]) {
    const card = this.ownedClaimed(peerId, cardId);
    if (!reason?.trim()) throw new BoardError('invalid', 'Blocking a card needs a reason');
    const open = (waitFor || []).filter(id => {
      const dep = this.data.cards[id];
      return dep && !RESOLVED.includes(dep.state);
    });
    if (open.length === 0) {
      throw new BoardError(
        'invalid',
        'A blocked card must wait for at least one open card. Create the card that would unblock it and pass its id in waitFor, or use ask_user if only the user can unblock it.'
      );
    }
    const deps = Array.from(new Set([...card.dependsOn, ...open]));
    this.checkDeps(card.id, deps);
    card.dependsOn = deps;
    card.blocker = { reason: reason.trim(), by: peerId };
    card.owner = undefined;
    card.leaseExpiresAt = undefined;
    card.state = 'blocked';
    card.updatedAt = this.now();
    this.addNote(card, peerId, 'blocker', `${reason.trim()} (waiting for ${open.join(', ')})`);
    this.record(peerId, 'blocked', { cardId, reason: reason.trim(), plan: true });
  }

  create(peerId: PeerId, input: CardInput, reason: string, planVersion?: number): Card {
    this.activePeer(peerId);
    this.checkPlanVersion(planVersion);
    if (input.kind && input.kind !== 'work') throw new BoardError('invalid', 'Peers can only create work cards');
    this.countPlanEdit();
    const card = this.newCard({ ...input, kind: 'work' }, peerId);
    if (reason?.trim()) this.addNote(card, peerId, 'decision', `Created: ${reason.trim()}`);
    this.record(peerId, 'created', { cardId: card.id, reason, detail: card.title, plan: true });
    return card;
  }

  split(peerId: PeerId, cardId: string, parts: CardInput[], reason: string, planVersion?: number): Card[] {
    this.activePeer(peerId);
    this.checkPlanVersion(planVersion);
    const card = this.card(cardId);
    if (card.owner && card.owner !== peerId) {
      throw new BoardError('not_owner', `${cardId} is held by @${card.owner}; propose the split with card_edit or a note instead`);
    }
    if (!['ready', 'claimed', 'blocked'].includes(card.state)) {
      throw new BoardError('bad_state', `${cardId} is ${card.state} and cannot be split`);
    }
    if (card.kind !== 'work') throw new BoardError('invalid', 'Only work cards can be split');
    if (!Array.isArray(parts) || parts.length < 2) throw new BoardError('invalid', 'A split needs at least two parts');
    if (!reason?.trim()) throw new BoardError('invalid', 'Splitting a card needs a reason');
    this.countPlanEdit();

    const created = parts.map(part =>
      this.newCard(
        { ...part, kind: 'work', dependsOn: part.dependsOn ?? card.dependsOn, minTier: part.minTier ?? card.minTier },
        peerId,
        { parentId: card.id }
      )
    );
    // Cards that waited for the original now wait for all of its parts.
    for (const other of this.cards()) {
      if (other.dependsOn.includes(card.id) && !created.includes(other)) {
        other.dependsOn = Array.from(new Set([...other.dependsOn.filter(d => d !== card.id), ...created.map(c => c.id)]));
        if (other.state === 'ready') this.setReady(other);
      }
    }
    card.state = 'cancelled';
    card.owner = undefined;
    card.leaseExpiresAt = undefined;
    card.updatedAt = this.now();
    this.addNote(card, peerId, 'decision', `Split into ${created.map(c => c.id).join(', ')}: ${reason.trim()}`);
    this.record(peerId, 'split', { cardId, reason: reason.trim(), detail: created.map(c => c.id).join(', '), plan: true });
    return created;
  }

  private applyPatch(card: Card, patch: CardPatch) {
    if (patch.acceptance !== undefined) {
      const acceptance = patch.acceptance.map(a => String(a).trim()).filter(Boolean);
      if (acceptance.length === 0) throw new BoardError('invalid', 'A card needs at least one acceptance criterion');
      card.acceptance = acceptance;
    }
    if (patch.dependsOn !== undefined) {
      const deps = Array.from(new Set(patch.dependsOn));
      this.checkDeps(card.id, deps);
      card.dependsOn = deps;
    }
    if (patch.fileScope !== undefined) {
      const scope = patch.fileScope.map(normalizeScope).filter(Boolean);
      if (scope.length === 0) throw new BoardError('invalid', 'A card needs a file scope');
      if (card.state === 'claimed' && card.kind === 'work') {
        for (const other of this.cards()) {
          if (other.id === card.id || other.kind !== 'work' || other.state !== 'claimed') continue;
          const clash = scopesOverlap(scope, other.fileScope);
          if (clash) {
            throw new BoardError('scope_conflict', `Scope '${clash[0]}' overlaps '${clash[1]}' on ${other.id}, held by @${other.owner}`);
          }
        }
      }
      card.fileScope = scope;
    }
    if (patch.title !== undefined && patch.title.trim()) card.title = patch.title.trim();
    if (patch.description !== undefined) card.description = patch.description.trim();
    if (patch.minTier !== undefined) card.minTier = patch.minTier === null ? undefined : patch.minTier;
    card.updatedAt = this.now();
    if (card.state === 'ready' || card.state === 'blocked') this.setReady(card);
  }

  /**
   * Changes a card. On a card someone else holds the change is stored as a proposal that the
   * owner answers on their next turn.
   */
  edit(peerId: PeerId, cardId: string, patch: CardPatch, reason: string, planVersion?: number): { applied: boolean; proposalId?: string } {
    this.activePeer(peerId);
    this.checkPlanVersion(planVersion);
    const card = this.card(cardId);
    if (RESOLVED.includes(card.state)) throw new BoardError('bad_state', `${cardId} is ${card.state} and cannot be changed`);
    if (!reason?.trim()) throw new BoardError('invalid', 'Changing a card needs a reason');
    if (!patch || Object.keys(patch).length === 0) throw new BoardError('invalid', 'Nothing to change');

    if (card.owner && card.owner !== peerId) {
      const note = this.addNote(card, peerId, 'proposal', reason.trim(), { patch, status: 'open' });
      this.record(peerId, 'proposed', { cardId, reason: reason.trim() });
      return { applied: false, proposalId: note.id };
    }
    this.countPlanEdit();
    this.applyPatch(card, patch);
    this.addNote(card, peerId, 'decision', `Changed ${Object.keys(patch).join(', ')}: ${reason.trim()}`);
    this.record(peerId, 'edited', { cardId, reason: reason.trim(), detail: Object.keys(patch).join(', '), plan: true });
    return { applied: true };
  }

  answerProposal(peerId: PeerId, cardId: string, proposalId: string, accept: boolean, reason?: string) {
    this.activePeer(peerId);
    const card = this.card(cardId);
    if (card.owner && card.owner !== peerId) throw new BoardError('not_owner', `Only @${card.owner} can answer proposals on ${cardId}`);
    const note = card.thread.find(n => n.id === proposalId && n.proposal);
    if (!note || !note.proposal) throw new BoardError('not_found', `No proposal ${proposalId} on ${cardId}`);
    if (note.proposal.status !== 'open') throw new BoardError('bad_state', `Proposal ${proposalId} is already ${note.proposal.status}`);
    if (accept) {
      this.countPlanEdit();
      this.applyPatch(card, note.proposal.patch);
    }
    note.proposal.status = accept ? 'accepted' : 'rejected';
    this.addNote(card, peerId, 'decision', `${accept ? 'Accepted' : 'Rejected'} @${note.author}'s proposal${reason ? `: ${reason}` : ''}`);
    this.record(peerId, accept ? 'proposal_accepted' : 'proposal_rejected', { cardId, reason, plan: accept });
  }

  cancel(peerId: PeerId, cardId: string, reason: string, planVersion?: number) {
    this.activePeer(peerId);
    this.checkPlanVersion(planVersion);
    const card = this.card(cardId);
    if (card.owner && card.owner !== peerId) throw new BoardError('not_owner', `${cardId} is held by @${card.owner}`);
    if (RESOLVED.includes(card.state) || card.state === 'in_review') {
      throw new BoardError('bad_state', `${cardId} is ${card.state} and cannot be cancelled`);
    }
    if (card.kind !== 'work' && card.kind !== 'plan') throw new BoardError('invalid', `A ${card.kind} card cannot be cancelled by a peer`);
    if (!reason?.trim()) throw new BoardError('invalid', 'Cancelling a card needs a reason');
    this.countPlanEdit();
    card.state = 'cancelled';
    card.owner = undefined;
    card.leaseExpiresAt = undefined;
    card.updatedAt = this.now();
    this.addNote(card, peerId, 'decision', `Cancelled: ${reason.trim()}`);
    this.unblockDependants();
    this.record(peerId, 'cancelled', { cardId, reason: reason.trim(), plan: true });
  }

  /** Offers a card to a named peer. Nobody else can claim it until the offer lapses. */
  delegate(peerId: PeerId, cardId: string, toPeer: PeerId, reason: string) {
    this.activePeer(peerId);
    const card = this.card(cardId);
    if (card.owner && card.owner !== peerId) throw new BoardError('not_owner', `${cardId} is held by @${card.owner}`);
    if (card.state !== 'ready' && card.state !== 'claimed') throw new BoardError('bad_state', `${cardId} is ${card.state}`);
    if (toPeer === peerId) throw new BoardError('invalid', 'You cannot delegate a card to yourself');
    const target = this.peer(toPeer);
    if (target.status !== 'active') throw new BoardError('not_allowed', `@${toPeer} is not on the team right now`);
    if (card.delegationChain.includes(toPeer)) {
      throw new BoardError('not_allowed', `@${toPeer} already handed this card on; it cannot go back to them`);
    }
    if (card.delegationChain.length >= this.data.limits.maxDelegationChain) {
      throw new BoardError('limit', `${cardId} has been handed on ${card.delegationChain.length} times already; do it, split it, or ask the user`);
    }
    if (card.minTier && target.tier < card.minTier) {
      throw new BoardError('not_allowed', `@${toPeer} is tier ${target.tier}; ${cardId} needs tier ${card.minTier}`);
    }
    if (!reason?.trim()) throw new BoardError('invalid', 'Delegating a card needs a reason');
    card.delegationChain.push(peerId);
    this.setReady(card);
    card.offeredTo = { peer: toPeer, until: this.now() + this.data.limits.offerMs };
    this.addNote(card, peerId, 'decision', `Offered to @${toPeer}: ${reason.trim()}`);
    this.record(peerId, 'delegated', { cardId, reason: reason.trim(), detail: toPeer });
  }

  reviewVerdict(peerId: PeerId, reviewCardId: string, pass: boolean, findings: string): { outcome: 'merge' | 'rejected'; targetId: string } {
    const review = this.ownedClaimed(peerId, reviewCardId);
    if (review.kind !== 'review' || !review.targetId) throw new BoardError('invalid', `${reviewCardId} is not a review card`);
    if (!findings?.trim()) throw new BoardError('invalid', 'A verdict needs findings, even when it passes');
    const target = this.card(review.targetId);
    const text = findings.trim();
    this.addNote(review, peerId, 'result', text);
    this.finish(review, { summary: `${pass ? 'Passed' : 'Rejected'}: ${text.slice(0, MAX_SUMMARY_CHARS)}`, passed: pass });
    if (pass) {
      this.addNote(target, peerId, 'decision', `Review passed: ${text}`);
      this.record(peerId, 'review_passed', { cardId: target.id });
      return { outcome: 'merge', targetId: target.id };
    }
    this.bounce(target, target.author, `Review by @${peerId} rejected this work: ${text}`);
    this.record(peerId, 'review_rejected', { cardId: target.id, reason: text.slice(0, 300) });
    return { outcome: 'rejected', targetId: target.id };
  }

  /** Sends one question to the user. Used when only the user can decide, including any change to the spec. */
  askUser(peerId: PeerId, cardId: string, question: string) {
    this.activePeer(peerId);
    const card = this.card(cardId);
    if (card.owner && card.owner !== peerId) throw new BoardError('not_owner', `${cardId} is held by @${card.owner}`);
    if (RESOLVED.includes(card.state) || card.state === 'needs_user') throw new BoardError('bad_state', `${cardId} is ${card.state}`);
    if (!question?.trim()) throw new BoardError('invalid', 'ask_user needs a question');
    card.resumeState = 'ready';
    card.owner = undefined;
    card.leaseExpiresAt = undefined;
    card.state = 'needs_user';
    card.updatedAt = this.now();
    this.addNote(card, peerId, 'question', question.trim());
    this.record(peerId, 'asked_user', { cardId, detail: question.trim().slice(0, 300) });
  }

  answerUser(cardId: string, answer: string) {
    const card = this.card(cardId);
    if (card.state !== 'needs_user') throw new BoardError('bad_state', `${cardId} is not waiting for an answer`);
    if (!answer?.trim()) throw new BoardError('invalid', 'An answer needs text');
    this.addNote(card, 'user', 'answer', answer.trim());
    card.bounces = 0;
    card.failedBy = [];
    card.resumeState = undefined;
    this.setReady(card);
    this.record('user', 'answered', { cardId });
  }

  /** Records where a claimed card is being worked on. */
  setWorkspace(cardId: string, branch: string | undefined, worktreePath: string) {
    const card = this.card(cardId);
    card.branch = branch;
    card.worktreePath = worktreePath;
    card.updatedAt = this.now();
    this.record('board', 'workspace_set', { cardId, detail: branch || worktreePath });
  }

  /** Undoes a claim that could not be set up (for example its worktree could not be created). */
  unclaim(cardId: string, why: string) {
    const card = this.card(cardId);
    if (card.state !== 'claimed') return;
    this.addNote(card, 'board', 'decision', why);
    this.setReady(card);
    this.record('board', 'unclaimed', { cardId, reason: why });
  }

  /** Forgets a card's workspace once its worktree has been removed. */
  clearWorkspace(cardId: string) {
    const card = this.data.cards[cardId];
    if (!card) return;
    card.worktreePath = undefined;
  }

  // ---- scheduler housekeeping -----------------------------------------------------------

  /** A turn ended in an error that was not a usage limit. */
  turnFailed(peerId: PeerId, message: string) {
    let changed = false;
    for (const card of this.cards()) {
      if (card.owner === peerId && card.state === 'claimed') {
        card.state = 'failed';
        this.bounce(card, peerId, `@${peerId}'s turn failed: ${message.slice(0, 400)}`);
        changed = true;
      }
    }
    if (changed) this.record('board', 'turn_failed', { detail: `${peerId}: ${message.slice(0, 200)}` });
  }

  /** Returns cards whose lease ran out to the board. Peers with a turn in flight are left alone. */
  expireLeases(busy: Set<PeerId>): string[] {
    const now = this.now();
    const expired: string[] = [];
    for (const card of this.cards()) {
      if (card.state !== 'claimed' || !card.owner || busy.has(card.owner)) continue;
      if (card.leaseExpiresAt !== undefined && card.leaseExpiresAt <= now) {
        const owner = card.owner;
        this.bounce(card, owner, `@${owner}'s lease on this card ran out.`);
        expired.push(card.id);
      }
    }
    if (expired.length > 0) this.record('board', 'leases_expired', { detail: expired.join(', ') });
    return expired;
  }

  /** Ready cards nobody has taken in time, or that no peer on the team may take, go to the user. */
  escalateOrphans(idlePeers: PeerId[]): string[] {
    const now = this.now();
    const escalated: string[] = [];
    for (const card of this.cards()) {
      if (card.state !== 'ready') continue;
      const noTier = card.minTier !== undefined && !this.activePeers().some(p => p.tier >= card.minTier!);
      const waited = card.readySince !== undefined && now - card.readySince >= this.data.limits.readyWaitMs && idlePeers.length > 0;
      if (!noTier && !waited) continue;
      card.state = 'needs_user';
      card.resumeState = 'ready';
      card.updatedAt = now;
      this.addNote(
        card,
        'board',
        'question',
        noTier
          ? `No peer on the team is tier ${card.minTier} or above, so nobody may take this card. Lower its minimum tier, add a stronger worker, or say how to proceed.`
          : 'Nobody on the team has taken this card. How should the team proceed?'
      );
      escalated.push(card.id);
    }
    if (escalated.length > 0) this.record('board', 'escalated', { detail: escalated.join(', ') });
    return escalated;
  }

  /** When every card is finished, the board asks for one final verification. */
  ensureVerifyCard(): Card | null {
    if (this.data.goal.status !== 'running') return null;
    const cards = this.cards();
    if (cards.length === 0 || this.openCards().length > 0) return null;
    const commands = this.data.goal.verifyCommands;
    const card = this.newCard(
      {
        kind: 'verify',
        title: 'Verify the goal',
        description:
          commands.length > 0
            ? `Run these commands in the session worktree and report each one's exit code: ${commands.map(c => `\`${c}\``).join(', ')}. Then compare the result with the spec's acceptance criteria.`
            : "The spec names no verification commands. Find the project's own test and build commands (package.json, Makefile, README), run them in the session worktree, and report each one's exit code. If the project has none, say so. Then compare the result with the spec.",
        acceptance: ['Every command was actually run and its exit code is reported', 'The result is compared with the spec'],
        fileScope: ['*']
      },
      'board'
    );
    this.record('board', 'verify_created', { cardId: card.id });
    return card;
  }
}

/**
 * Reads the task list a spec ends with: a fenced block tagged `smith-tasks` holding JSON
 * `{ "verify": ["npm test"], "tasks": [{ "id", "title", "description", "acceptance", "fileScope", "dependsOn", "review", "minTier" }] }`.
 */
export function parseSpecTasks(spec: string): SpecTasks | null {
  const match = spec.match(/```smith-tasks\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
    if (!Array.isArray(tasks)) return null;
    const valid = tasks.filter(t => t && typeof t.title === 'string' && Array.isArray(t.acceptance) && t.acceptance.length > 0);
    if (valid.length === 0) return null;
    return {
      verify: Array.isArray(parsed.verify) ? parsed.verify.map(String) : [],
      tasks: valid.map(t => ({
        id: t.id !== undefined ? String(t.id) : undefined,
        title: t.title,
        description: String(t.description || ''),
        acceptance: t.acceptance.map(String),
        fileScope: Array.isArray(t.fileScope) ? t.fileScope.map(String) : undefined,
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : undefined,
        review: t.review === true,
        minTier: [1, 2, 3].includes(t.minTier) ? t.minTier : undefined
      }))
    };
  } catch {
    return null;
  }
}
