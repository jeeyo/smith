/**
 * Peer Board types: the shared kanban a leaderless team of agents plans and works on.
 * See docs/designs/peer-board.md.
 */

export type PeerId = string;
export type HarnessId = 'claude' | 'codex' | 'opencode';
export type Tier = 1 | 2 | 3;

export type CardKind = 'plan' | 'work' | 'review' | 'verify' | 'merge-conflict';

export type CardState =
  | 'ready'
  | 'claimed'
  | 'in_review'
  | 'done'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'needs_user';

export type ReviewMode = 'fast' | 'normal' | 'thorough';

export type NoteKind = 'comment' | 'proposal' | 'decision' | 'blocker' | 'result' | 'question' | 'answer';

/** A change to a card that its owner must accept before it applies. */
export interface CardPatch {
  title?: string;
  description?: string;
  acceptance?: string[];
  fileScope?: string[];
  dependsOn?: string[];
  minTier?: Tier | null;
}

export interface Note {
  id: string;
  author: PeerId | 'board' | 'user';
  at: number;
  kind: NoteKind;
  text: string;
  /** Present on kind 'proposal'. */
  proposal?: { patch: CardPatch; status: 'open' | 'accepted' | 'rejected' };
}

export interface Card {
  id: string;
  title: string;
  description: string;
  acceptance: string[];
  kind: CardKind;
  state: CardState;
  owner?: PeerId;
  leaseExpiresAt?: number;
  fileScope: string[];
  dependsOn: string[];
  minTier?: Tier;
  parentId?: string;
  createdBy: PeerId | 'spec' | 'board' | 'user';
  delegationChain: PeerId[];
  /** Set while a card is on offer to one peer; others cannot claim it until the offer lapses. */
  offeredTo?: { peer: PeerId; until: number };
  bounces: number;
  /** Peers that failed this card or had it rejected in review (rule 11). */
  failedBy: PeerId[];
  /** Peer that did the work, kept after submit so a reviewer is never the author. */
  author?: PeerId;
  /** For review cards: the work card under review. For merge-conflict cards: the card being merged. */
  targetId?: string;
  /** The spec or a peer asked for this card to be reviewed regardless of size. */
  reviewRequested?: boolean;
  branch?: string;
  worktreePath?: string;
  /** What the card was waiting for when it was blocked. */
  blocker?: { reason: string; by: PeerId | 'board' };
  /** State to return to once the user answers a needs_user question. */
  resumeState?: CardState;
  readySince?: number;
  result?: { commit?: string; summary: string; passed?: boolean };
  thread: Note[];
  createdAt: number;
  updatedAt: number;
}

export type PeerStatus = 'active' | 'removed';

export interface Peer {
  id: PeerId;
  harness: HarnessId;
  model: string;
  tier: Tier;
  status: PeerStatus;
  /** Set while removed for a usage limit. */
  removed?: { reason: string; at: number; rejoinAt?: number };
  turns: number;
}

export interface BoardLimits {
  wipPerPeer: number;
  leaseMs: number;
  maxBounces: number;
  maxDelegationChain: number;
  maxPlanEdits: number;
  maxTurns: number;
  readyWaitMs: number;
  offerMs: number;
  reviewLines: number;
  reviewFiles: number;
  turnTimeoutMs: number;
}

export const DEFAULT_LIMITS: BoardLimits = {
  wipPerPeer: 1,
  leaseMs: 20 * 60_000,
  maxBounces: 3,
  maxDelegationChain: 2,
  maxPlanEdits: 40,
  maxTurns: 60,
  readyWaitMs: 30 * 60_000,
  offerMs: 10 * 60_000,
  reviewLines: 150,
  reviewFiles: 5,
  turnTimeoutMs: 15 * 60_000
};

export type GoalStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface GoalState {
  text: string;
  specPath?: string;
  status: GoalStatus;
  /** Why the goal is paused, shown to the user. */
  pauseReason?: string;
  /** Set while the goal is running but nobody can work (for example every worker is out of usage). */
  waitingReason?: string;
  verifyCommands: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface BoardLogEntry {
  version: number;
  at: number;
  actor: PeerId | 'board' | 'user' | 'spec';
  action: string;
  cardId?: string;
  reason?: string;
  detail?: string;
}

export interface BoardData {
  sessionId: string;
  /** Increases on every accepted change. */
  version: number;
  /** Increases only when the plan itself changes (cards added, split, edited, cancelled). */
  planVersion: number;
  cards: Record<string, Card>;
  order: string[];
  peers: Record<PeerId, Peer>;
  reviewMode: ReviewMode;
  limits: BoardLimits;
  goal: GoalState;
  counters: { nextCard: number; nextNote: number; planEdits: number; turns: number };
}

/** Input for a new card, from the spec or a peer. */
export interface CardInput {
  title: string;
  description: string;
  acceptance: string[];
  fileScope?: string[];
  dependsOn?: string[];
  minTier?: Tier;
  kind?: CardKind;
  review?: boolean;
}

/** The task list a spec ends with. */
export interface SpecTasks {
  verify?: string[];
  tasks: Array<CardInput & { id?: string }>;
}

export interface DiffStat {
  files: string[];
  lines: number;
}

/** A running or finished agent turn, shown in the UI. */
export interface TurnRecord {
  id: string;
  sessionId: string;
  peer: PeerId;
  harness: HarnessId;
  model: string;
  reason: string;
  cardId?: string;
  startedAt: number;
  endedAt?: number;
  outcome?: 'ok' | 'failed' | 'usage_limit' | 'timeout';
  summary?: string;
}
