import React, { useMemo, useState } from 'react';
import {
  Lock,
  CheckCircle2,
  Loader2,
  PauseCircle,
  PlayCircle,
  HelpCircle,
  GitBranch,
  X,
  History,
  LayoutGrid,
  Send,
  UserMinus,
  Ban,
  Eye,
  ClipboardCheck,
  GitMerge,
  ListTree
} from 'lucide-react';
import { BoardData, BoardLogEntry, Card, CardState, Peer, ReviewMode, Tier, TurnRecord } from '../../shared/board.ts';
import { MarkdownContent } from './MarkdownContent.tsx';
import { HARNESS_LABELS, REVIEW_MODES } from './NewSessionModal.tsx';

interface BoardViewProps {
  board: BoardData | null;
  log: BoardLogEntry[];
  runningTurns: TurnRecord[];
  recentTurns: TurnRecord[];
  onAnswer: (cardId: string, answer: string) => Promise<void>;
  onSetReviewMode: (mode: ReviewMode) => void;
  onPause: () => void;
  onResume: () => void;
  onSetMinTier: (cardId: string, tier: Tier | null) => Promise<void>;
}

const COLUMNS: Array<{ id: string; label: string; states: CardState[] }> = [
  { id: 'ready', label: 'Ready', states: ['ready', 'blocked', 'failed'] },
  { id: 'progress', label: 'In progress', states: ['claimed'] },
  { id: 'review', label: 'In review', states: ['in_review'] },
  { id: 'done', label: 'Done', states: ['done', 'cancelled'] }
];

const KIND_ICON: Record<Card['kind'], React.ReactNode> = {
  plan: <ListTree className="w-3 h-3" />,
  work: null,
  review: <Eye className="w-3 h-3" />,
  verify: <ClipboardCheck className="w-3 h-3" />,
  'merge-conflict': <GitMerge className="w-3 h-3" />
};

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

const ACTION_TEXT: Record<string, string> = {
  goal_started: 'started the goal',
  claimed: 'claimed',
  submitted: 'submitted',
  merged: 'merged',
  released: 'released',
  blocked: 'blocked',
  created: 'added',
  split: 'split',
  edited: 'changed',
  proposed: 'proposed a change to',
  proposal_accepted: 'accepted a proposal on',
  proposal_rejected: 'rejected a proposal on',
  cancelled: 'cancelled',
  delegated: 'offered',
  review_passed: 'passed the review of',
  review_rejected: 'rejected',
  asked_user: 'asked you about',
  answered: 'answered',
  merge_conflict: 'hit a merge conflict on',
  turn_failed: 'recorded a failed turn',
  leases_expired: 'took back expired leases',
  escalated: 'sent to you',
  verify_created: 'asked for verification',
  verify_failed: 'reported failed verification',
  goal_completed: 'verified the goal',
  goal_paused: 'paused the goal',
  goal_resumed: 'resumed the goal',
  goal_waiting: 'is waiting',
  peers_removed: 'removed from the team',
  peer_rejoined: 'let back onto the team',
  review_mode_set: 'set the review mode',
  team_set: 'set the team',
  unclaimed: 'undid a claim on'
};

/** Changes worth showing in "Plan changes": who reshaped the plan, and why. */
const HIDDEN_ACTIONS = new Set(['workspace_set', 'noted', 'goal_moving', 'limits_set']);

/** Each column and state gets one pastel, used for its dot and its pills. */
const COLUMN_TONE: Record<string, { dot: string; pill: string }> = {
  ready: { dot: 'bg-lav-300', pill: 'bg-lav-100 text-lav-700' },
  progress: { dot: 'bg-sky-300', pill: 'bg-sky-100 text-sky-700' },
  review: { dot: 'bg-peach-300', pill: 'bg-peach-100 text-peach-700' },
  done: { dot: 'bg-mint-300', pill: 'bg-mint-100 text-mint-700' }
};

const PEER_TINTS = ['bg-sky-100 text-sky-700', 'bg-peach-100 text-peach-700', 'bg-mint-100 text-mint-700', 'bg-lav-100 text-lav-700', 'bg-butter-100 text-butter-700', 'bg-rose-100 text-rose-700'];
function peerTint(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEER_TINTS[h % PEER_TINTS.length];
}

/** Log details are plain text in a list; drop markdown emphasis and code marks. */
function plain(text: string): string {
  return text.replace(/\*\*|__|`/g, '');
}

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400 mb-1.5">{children}</div>
);

const CardTile: React.FC<{ card: Card; busy: boolean; onOpen: () => void }> = ({ card, busy, onOpen }) => {
  const muted = card.state === 'done' || card.state === 'cancelled';
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left p-3 rounded-xl transition-all ${
        card.state === 'needs_user'
          ? 'bg-butter-50 ring-1 ring-butter-200 hover:ring-butter-300'
          : muted
          ? 'bg-ink-0/60 hover:bg-ink-0'
          : 'bg-ink-0 shadow-soft hover:shadow-float'
      }`}
    >
      <div className={`text-[12.5px] leading-snug ${muted ? 'text-ink-400' : 'text-ink-800'} ${card.state === 'cancelled' ? 'line-through' : ''}`}>{card.title}</div>
      <div className="flex flex-wrap items-center gap-1 mt-2 text-[10px]">
        <span className="font-mono text-ink-400 mr-0.5">{card.id}</span>
        {card.kind !== 'work' && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-600">
            {KIND_ICON[card.kind]} {card.kind}
          </span>
        )}
        {card.owner && (
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${peerTint(card.owner)}`}>
            {busy && <Loader2 className="w-2.5 h-2.5 animate-spin" />}@{card.owner}
          </span>
        )}
        {card.state === 'blocked' && <span className="px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-500">blocked</span>}
        {card.state === 'cancelled' && <span className="px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-400">cancelled</span>}
        {card.minTier && <span className="px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-500">tier {card.minTier}+</span>}
        {card.bounces > 0 && card.state !== 'done' && <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">returned ×{card.bounces}</span>}
      </div>
      {card.kind === 'work' && !muted && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-ink-400 font-mono" title={card.fileScope.join(', ')}>
          <Lock className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{card.fileScope.join(', ')}</span>
        </div>
      )}
    </button>
  );
};

export const CardDetail: React.FC<{
  card: Card;
  board: BoardData;
  onClose: () => void;
  onAnswer: (cardId: string, answer: string) => Promise<void>;
  onSetMinTier: (cardId: string, tier: Tier | null) => Promise<void>;
}> = ({ card, board, onClose, onAnswer, onSetMinTier }) => {
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const open = card.state !== 'done' && card.state !== 'cancelled';

  const submit = async () => {
    if (!answer.trim() || sending) return;
    setSending(true);
    try {
      await onAnswer(card.id, answer.trim());
      setAnswer('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 bg-ink-25 flex flex-col">
      <div className="px-4 sm:px-6 pt-5 pb-4 flex items-start justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
            <span className="font-mono">{card.id}</span>
            <span>·</span>
            <span>{card.kind}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                card.state === 'needs_user' ? 'bg-butter-100 text-butter-700' : 'bg-ink-100 text-ink-600'
              }`}
            >
              {card.state.replace('_', ' ')}
            </span>
            {card.owner && <span className={`px-2 py-0.5 rounded-full text-[10px] ${peerTint(card.owner)}`}>@{card.owner}</span>}
          </div>
          <div className="text-base font-semibold text-ink-900 mt-1.5 leading-snug">{card.title}</div>
        </div>
        <button onClick={onClose} title="Close" className="p-1.5 rounded-lg text-ink-400 hover:text-ink-800 hover:bg-ink-100 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 space-y-5 text-xs select-text">
        {card.description && <MarkdownContent content={card.description} />}

        <div>
          <Label>Acceptance</Label>
          <ul className="space-y-1">
            {card.acceptance.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-ink-700">
                <CheckCircle2 className={`w-3.5 h-3.5 mt-px flex-shrink-0 ${card.state === 'done' ? 'text-mint-500' : 'text-ink-300'}`} />
                {a}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-ink-0 shadow-soft">
          <div>
            <Label>File scope</Label>
            <div className="font-mono text-[11px] text-ink-700 break-all">{card.fileScope.join(', ')}</div>
          </div>
          <div>
            <Label>Depends on</Label>
            <div className="font-mono text-[11px] text-ink-700">
              {card.dependsOn.length === 0
                ? 'nothing'
                : card.dependsOn.map(id => `${id} (${board.cards[id]?.state.replace('_', ' ') || 'gone'})`).join(', ')}
            </div>
          </div>
          {card.branch && (
            <div className="col-span-2">
              <Label>Branch</Label>
              <div className="font-mono text-[11px] text-ink-700 flex items-center gap-1 break-all">
                <GitBranch className="w-3 h-3 flex-shrink-0" /> {card.branch}
                {card.result?.commit && <span className="text-ink-400">→ merged as {card.result.commit}</span>}
              </div>
            </div>
          )}
          {open && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">Minimum tier</span>
              <select
                value={card.minTier || 0}
                onChange={e => onSetMinTier(card.id, Number(e.target.value) === 0 ? null : (Number(e.target.value) as Tier))}
                className="bg-ink-50 rounded-lg px-2 py-1 text-ink-800 focus:outline-none"
              >
                <option value={0}>any</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
          )}
        </div>

        {card.result?.summary && (
          <div>
            <Label>Result</Label>
            <MarkdownContent content={card.result.summary} />
          </div>
        )}

        <div>
          <Label>Thread</Label>
          {card.thread.length === 0 ? (
            <div className="text-ink-400">No notes yet.</div>
          ) : (
            <div className="space-y-2">
              {card.thread.map(note => (
                <div
                  key={note.id}
                  className={`px-3.5 py-2.5 rounded-xl ${
                    note.kind === 'question' ? 'bg-butter-50 ring-1 ring-butter-200' : note.author === 'user' ? 'bg-lav-50' : 'bg-ink-0 shadow-soft'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10.5px] text-ink-400 mb-1">
                    {note.author === 'board' || note.author === 'user' ? (
                      <span className="font-medium text-ink-600">{note.author}</span>
                    ) : (
                      <span className={`px-1.5 rounded-full font-medium ${peerTint(note.author)}`}>@{note.author}</span>
                    )}
                    <span>{note.kind}</span>
                    {note.proposal && <span className="px-1.5 rounded-full bg-lav-100 text-lav-700">{note.proposal.status}</span>}
                    <span className="ml-auto">{timeAgo(note.at)}</span>
                  </div>
                  <div className="text-ink-700">
                    <MarkdownContent content={note.text} />
                  </div>
                  {note.proposal && (
                    <pre className="mt-2 p-2 rounded-lg bg-ink-50 text-[10.5px] text-ink-600 overflow-x-auto">{JSON.stringify(note.proposal.patch, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {card.state === 'needs_user' && (
        <div className="px-4 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-butter-50 flex-shrink-0">
          <div className="text-[11.5px] text-butter-700 font-medium mb-2">The team is waiting for your answer on this card.</div>
          <div className="flex items-end gap-2 bg-ink-0 rounded-xl px-3 py-2 shadow-soft">
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Your answer…"
              className="flex-1 bg-transparent text-xs text-ink-900 placeholder-ink-400 focus:outline-none resize-none py-1"
            />
            <button
              onClick={submit}
              disabled={!answer.trim() || sending}
              title="Send answer"
              className="p-2 rounded-lg bg-lav-200 hover:bg-lav-300 text-lav-700 disabled:opacity-40 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const PeerChip: React.FC<{ peer: Peer; turn?: TurnRecord }> = ({ peer, turn }) => {
  const removed = peer.status === 'removed';
  const title = removed
    ? `Away: ${peer.removed?.reason || 'usage limit'}${peer.removed?.rejoinAt ? `. Rejoins about ${new Date(peer.removed.rejoinAt).toLocaleTimeString()}` : ''}`
    : `${HARNESS_LABELS[peer.harness] || peer.harness} · ${peer.model} · tier ${peer.tier} · ${peer.turns} turn(s)${turn ? ` · working on ${turn.cardId}` : ''}`;
  return (
    <span
      title={title}
      className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] ${removed ? 'bg-ink-50 text-ink-400' : 'bg-ink-0 shadow-soft text-ink-700'}`}
    >
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${removed ? 'bg-ink-100 text-ink-400' : peerTint(peer.id)}`}>
        {removed ? <UserMinus className="w-3 h-3" /> : turn ? <Loader2 className="w-3 h-3 animate-spin" /> : peer.id.charAt(0).toUpperCase()}
      </span>
      @{peer.id}
      <span className="text-ink-300">t{peer.tier}</span>
    </span>
  );
};

export const BoardView: React.FC<BoardViewProps> = ({ board, log, runningTurns, recentTurns, onAnswer, onSetReviewMode, onPause, onResume, onSetMinTier }) => {
  const [tab, setTab] = useState<'board' | 'changes' | 'turns'>('board');
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const cards = useMemo(() => (board ? board.order.map(id => board.cards[id]).filter(Boolean) : []), [board]);
  const needsUser = cards.filter(c => c.state === 'needs_user');
  const busyCards = new Set(runningTurns.map(t => t.cardId));
  const turnByPeer = new Map(runningTurns.map(t => [t.peer, t]));
  const changes = useMemo(() => log.filter(e => !HIDDEN_ACTIONS.has(e.action)).slice().reverse(), [log]);
  const turns = [...runningTurns, ...recentTurns.slice().reverse()];

  if (!board) {
    return <div className="h-full flex items-center justify-center text-xs text-ink-400">No board yet.</div>;
  }

  const openCard = openCardId ? board.cards[openCardId] : undefined;
  const goal = board.goal;
  const statusLabel =
    goal.status === 'idle' ? 'No goal yet' : goal.status === 'completed' ? 'Completed' : goal.status === 'paused' ? 'Paused' : goal.waitingReason ? 'Waiting' : 'Working';
  const statusTone =
    goal.status === 'completed'
      ? 'bg-mint-100 text-mint-700'
      : goal.status === 'paused' || goal.waitingReason
      ? 'bg-butter-100 text-butter-700'
      : goal.status === 'running'
      ? 'bg-sky-100 text-sky-700'
      : 'bg-ink-100 text-ink-500';

  return (
    <div className="h-full flex flex-col relative bg-ink-25">
      <div className="px-4 sm:px-6 pt-5 pb-3 space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${statusTone}`}>
              {goal.status === 'running' && !goal.waitingReason && runningTurns.length > 0 && <Loader2 className="w-3 h-3 animate-spin" />}
              {goal.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
              {goal.status === 'paused' && <PauseCircle className="w-3 h-3" />}
              {statusLabel}
            </span>
            <span className="hidden sm:inline text-ink-400 text-[11px]" title="Turns used / plan edits made on this goal">
              {board.counters.turns}/{board.limits.maxTurns} turns · {board.counters.planEdits} plan edits
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <select
              value={board.reviewMode}
              onChange={e => onSetReviewMode(e.target.value as ReviewMode)}
              title={REVIEW_MODES.find(m => m.id === board.reviewMode)?.hint}
              className="bg-ink-0 shadow-soft rounded-lg px-2 py-1 text-[11px] text-ink-700 focus:outline-none cursor-pointer max-md:!text-[14px] max-md:py-1.5"
            >
              {REVIEW_MODES.map(m => (
                <option key={m.id} value={m.id}>Review: {m.label}</option>
              ))}
            </select>
            {goal.status === 'running' && (
              <button onClick={onPause} title="Pause the goal" className="p-1.5 rounded-lg bg-ink-0 shadow-soft text-ink-500 hover:text-ink-800">
                <PauseCircle className="w-3.5 h-3.5" />
              </button>
            )}
            {goal.status === 'paused' && (
              <button onClick={onResume} title="Resume the goal" className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-lav-200 text-lav-700 text-[11px] font-medium hover:bg-lav-300">
                <PlayCircle className="w-3.5 h-3.5" /> Resume
              </button>
            )}
          </div>
        </div>

        {(goal.pauseReason || goal.waitingReason) && goal.status !== 'completed' && (
          <div className="text-[11.5px] text-butter-700 bg-butter-50 rounded-xl px-3 py-2 leading-snug">{goal.pauseReason || goal.waitingReason}</div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {Object.values(board.peers).map(peer => (
            <PeerChip key={peer.id} peer={peer} turn={turnByPeer.get(peer.id)} />
          ))}
          {Object.keys(board.peers).length === 0 && <span className="text-[11px] text-ink-400">No workers on this session.</span>}
        </div>

        <div className="flex items-center gap-4 text-[12px] border-b border-ink-100 overflow-x-auto overflow-y-hidden whitespace-nowrap">
          {([
            ['board', 'Board', <LayoutGrid key="i" className="w-3.5 h-3.5" />],
            ['changes', `Plan changes (${changes.length})`, <History key="i" className="w-3.5 h-3.5" />],
            ['turns', `Turns (${turns.length})`, <Loader2 key="i" className="w-3.5 h-3.5" />]
          ] as Array<[typeof tab, string, React.ReactNode]>).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 pb-2 -mb-px border-b-2 transition-colors ${
                tab === id ? 'border-lav-400 text-ink-900 font-medium' : 'border-transparent text-ink-400 hover:text-ink-700'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'board' && (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 space-y-5">
          {needsUser.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-butter-700 mb-2">
                <HelpCircle className="w-3.5 h-3.5" /> Needs you ({needsUser.length})
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {needsUser.map(card => (
                  <CardTile key={card.id} card={card} busy={false} onOpen={() => setOpenCardId(card.id)} />
                ))}
              </div>
            </div>
          )}

          {cards.length === 0 ? (
            <div className="text-xs text-ink-400 py-16 text-center">The board is empty. State a goal in the chat to start.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {COLUMNS.map(column => {
                const inColumn = cards.filter(c => column.states.includes(c.state));
                const tone = COLUMN_TONE[column.id];
                return (
                  <div key={column.id} className="min-w-0 rounded-2xl bg-ink-50 p-2">
                    <div className="flex items-center justify-between px-1.5 pt-1 pb-2.5">
                      <span className="flex items-center gap-2 text-[11.5px] font-medium text-ink-700">
                        <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                        {column.label}
                      </span>
                      <span className={`px-1.5 rounded-full text-[10px] font-medium ${tone.pill}`}>{inColumn.length}</span>
                    </div>
                    <div className="space-y-2">
                      {inColumn.map(card => (
                        <CardTile key={card.id} card={card} busy={busyCards.has(card.id)} onOpen={() => setOpenCardId(card.id)} />
                      ))}
                      {inColumn.length === 0 && <div className="h-14 rounded-xl border border-dashed border-ink-200" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'changes' && (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 text-xs select-text">
          {changes.length === 0 && <div className="text-ink-400 py-16 text-center">Nothing has changed yet.</div>}
          <div className="relative border-l border-ink-200 ml-1.5 space-y-3 pt-1">
            {changes.map(entry => (
              <div key={entry.version} className="relative pl-5">
                <span className={`absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full ${entry.reason ? 'bg-lav-300' : 'bg-ink-200'}`} />
                <div className="leading-relaxed">
                  {entry.actor === 'board' || entry.actor === 'user' || entry.actor === 'spec' ? (
                    <span className="font-medium text-ink-600">{entry.actor}</span>
                  ) : (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-medium ${peerTint(entry.actor)}`}>@{entry.actor}</span>
                  )}{' '}
                  <span className="text-ink-700">{ACTION_TEXT[entry.action] || entry.action.replace(/_/g, ' ')}</span>
                  {entry.cardId && (
                    <button onClick={() => setOpenCardId(entry.cardId!)} className="ml-1 font-mono text-lav-600 hover:text-lav-700 hover:underline">
                      {entry.cardId}
                    </button>
                  )}
                  {entry.detail && <span className="text-ink-400"> — {plain(entry.detail)}</span>}
                  <span className="ml-2 text-[10px] text-ink-300">{timeAgo(entry.at)}</span>
                </div>
                {entry.reason && <div className="text-ink-500 mt-0.5">Why: {plain(entry.reason)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'turns' && (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 space-y-2 text-xs select-text">
          {turns.length === 0 && <div className="text-ink-400 py-16 text-center">No agent turns yet.</div>}
          {turns.map(turn => (
            <div key={turn.id} className="px-3.5 py-2.5 rounded-xl bg-ink-0 shadow-soft">
              <div className="flex items-center gap-2 text-[11px]">
                {!turn.endedAt ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" />
                ) : turn.outcome === 'ok' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-mint-500" />
                ) : (
                  <Ban className="w-3.5 h-3.5 text-rose-500" />
                )}
                <span className={`px-1.5 rounded-full font-medium ${peerTint(turn.peer)}`}>@{turn.peer}</span>
                <span className="text-ink-500">{turn.reason}</span>
                {turn.cardId && <span className="font-mono text-ink-600">{turn.cardId}</span>}
                <span className="ml-auto text-[10px] text-ink-400">
                  {turn.endedAt ? `${Math.round((turn.endedAt - turn.startedAt) / 1000)}s · ${turn.outcome?.replace('_', ' ')}` : `running · ${timeAgo(turn.startedAt)}`}
                </span>
              </div>
              {turn.summary && <div className="mt-1.5"><MarkdownContent content={turn.summary} /></div>}
            </div>
          ))}
        </div>
      )}

      {openCard && <CardDetail card={openCard} board={board} onClose={() => setOpenCardId(null)} onAnswer={onAnswer} onSetMinTier={onSetMinTier} />}
    </div>
  );
};
