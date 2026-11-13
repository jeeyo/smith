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

const CardTile: React.FC<{ card: Card; busy: boolean; onOpen: () => void }> = ({ card, busy, onOpen }) => {
  const muted = card.state === 'done' || card.state === 'cancelled';
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left p-2 rounded-lg border transition-colors ${
        card.state === 'needs_user'
          ? 'bg-amber-950/20 border-amber-800/50 hover:border-amber-600/60'
          : muted
          ? 'bg-zinc-950/40 border-zinc-800/60 hover:border-zinc-700'
          : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span className="font-mono text-[10px] text-zinc-500 mt-0.5 flex-shrink-0">{card.id}</span>
        <span className={`text-xs leading-snug ${muted ? 'text-zinc-500' : 'text-zinc-200'} ${card.state === 'cancelled' ? 'line-through' : ''}`}>
          {card.title}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[10px]">
        {card.kind !== 'work' && (
          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">
            {KIND_ICON[card.kind]} {card.kind}
          </span>
        )}
        {card.owner && (
          <span className="flex items-center gap-1 px-1 py-0.5 rounded bg-sky-950/50 text-sky-300 border border-sky-900/50">
            {busy && <Loader2 className="w-2.5 h-2.5 animate-spin" />}@{card.owner}
          </span>
        )}
        {card.state === 'blocked' && <span className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">blocked</span>}
        {card.state === 'cancelled' && <span className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">cancelled</span>}
        {card.minTier && <span className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">tier {card.minTier}+</span>}
        {card.bounces > 0 && card.state !== 'done' && <span className="px-1 py-0.5 rounded bg-rose-950/40 text-rose-300">returned ×{card.bounces}</span>}
        {card.kind === 'work' && !muted && (
          <span className="flex items-center gap-0.5 text-zinc-500 font-mono truncate max-w-full" title={card.fileScope.join(', ')}>
            <Lock className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{card.fileScope.join(', ')}</span>
          </span>
        )}
      </div>
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
    <div className="absolute inset-0 z-10 bg-zinc-950 flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-start justify-between gap-2 flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
            <span>{card.id}</span>
            <span>·</span>
            <span>{card.kind}</span>
            <span>·</span>
            <span className={card.state === 'needs_user' ? 'text-amber-400' : ''}>{card.state.replace('_', ' ')}</span>
            {card.owner && <span className="text-sky-300">@{card.owner}</span>}
          </div>
          <div className="text-sm font-medium text-zinc-100 mt-0.5">{card.title}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-200 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs select-text">
        {card.description && <div className="text-zinc-300 whitespace-pre-wrap">{card.description}</div>}

        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Acceptance</div>
          <ul className="list-disc pl-4 text-zinc-300 space-y-0.5">
            {card.acceptance.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">File scope</div>
            <div className="font-mono text-[11px] text-zinc-300 break-all">{card.fileScope.join(', ')}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Depends on</div>
            <div className="font-mono text-[11px] text-zinc-300">
              {card.dependsOn.length === 0
                ? 'nothing'
                : card.dependsOn.map(id => `${id} (${board.cards[id]?.state.replace('_', ' ') || 'gone'})`).join(', ')}
            </div>
          </div>
          {card.branch && (
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Branch</div>
              <div className="font-mono text-[11px] text-zinc-300 flex items-center gap-1 break-all">
                <GitBranch className="w-3 h-3 flex-shrink-0" /> {card.branch}
                {card.result?.commit && <span className="text-zinc-500">→ merged as {card.result.commit}</span>}
              </div>
            </div>
          )}
          {open && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Minimum tier</span>
              <select
                value={card.minTier || 0}
                onChange={e => onSetMinTier(card.id, Number(e.target.value) === 0 ? null : (Number(e.target.value) as Tier))}
                className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200"
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
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Result</div>
            <div className="text-zinc-300 whitespace-pre-wrap">{card.result.summary}</div>
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Thread</div>
          {card.thread.length === 0 ? (
            <div className="text-zinc-600">No notes yet.</div>
          ) : (
            <div className="space-y-1.5">
              {card.thread.map(note => (
                <div
                  key={note.id}
                  className={`p-2 rounded-lg border ${
                    note.kind === 'question'
                      ? 'bg-amber-950/20 border-amber-800/40'
                      : note.author === 'user'
                      ? 'bg-zinc-900 border-zinc-700'
                      : 'bg-zinc-900/50 border-zinc-800/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-0.5">
                    <span className={note.author === 'board' ? '' : 'text-sky-300'}>{note.author === 'board' || note.author === 'user' ? note.author : `@${note.author}`}</span>
                    <span>·</span>
                    <span>{note.kind}</span>
                    {note.proposal && <span className="px-1 rounded bg-zinc-800 text-zinc-300">{note.proposal.status}</span>}
                    <span className="ml-auto">{timeAgo(note.at)}</span>
                  </div>
                  <div className="text-zinc-300">
                    <MarkdownContent content={note.text} />
                  </div>
                  {note.proposal && (
                    <pre className="mt-1 p-1.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 overflow-x-auto">
                      {JSON.stringify(note.proposal.patch, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {card.state === 'needs_user' && (
        <div className="p-3 border-t border-amber-900/40 bg-amber-950/10 flex-shrink-0">
          <div className="text-[11px] text-amber-300 mb-1.5">The team is waiting for your answer on this card.</div>
          <div className="flex items-end gap-2">
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
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
            />
            <button
              onClick={submit}
              disabled={!answer.trim() || sending}
              className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-900 disabled:opacity-40"
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
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono ${
        removed ? 'bg-zinc-900 border-zinc-800 text-zinc-600' : turn ? 'bg-sky-950/40 border-sky-900/60 text-sky-200' : 'bg-zinc-900 border-zinc-800 text-zinc-300'
      }`}
    >
      {removed ? <UserMinus className="w-2.5 h-2.5" /> : turn ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
      @{peer.id}
      <span className="text-zinc-500">t{peer.tier}</span>
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

  if (!board) {
    return <div className="h-full flex items-center justify-center text-xs text-zinc-600">No board yet.</div>;
  }

  const openCard = openCardId ? board.cards[openCardId] : undefined;
  const goal = board.goal;
  const statusLabel =
    goal.status === 'idle' ? 'No goal yet' : goal.status === 'completed' ? 'Completed' : goal.status === 'paused' ? 'Paused' : goal.waitingReason ? 'Waiting' : 'Working';
  const statusClass =
    goal.status === 'completed' ? 'text-emerald-400' : goal.status === 'paused' ? 'text-amber-400' : goal.waitingReason ? 'text-amber-300' : goal.status === 'running' ? 'text-sky-300' : 'text-zinc-500';

  return (
    <div className="h-full flex flex-col relative bg-zinc-950">
      {/* Header: goal state, team, controls */}
      <div className="px-3 py-2 border-b border-zinc-800 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <span className={`font-medium flex items-center gap-1 ${statusClass}`}>
              {goal.status === 'running' && !goal.waitingReason && runningTurns.length > 0 && <Loader2 className="w-3 h-3 animate-spin" />}
              {goal.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
              {goal.status === 'paused' && <PauseCircle className="w-3 h-3" />}
              {statusLabel}
            </span>
            <span className="text-zinc-600 font-mono text-[10px]" title="Turns used / plan edits made on this goal">
              {board.counters.turns}/{board.limits.maxTurns} turns · {board.counters.planEdits} plan edits
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <select
              value={board.reviewMode}
              onChange={e => onSetReviewMode(e.target.value as ReviewMode)}
              title={REVIEW_MODES.find(m => m.id === board.reviewMode)?.hint}
              className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-300"
            >
              {REVIEW_MODES.map(m => (
                <option key={m.id} value={m.id}>Review: {m.label}</option>
              ))}
            </select>
            {goal.status === 'running' && (
              <button onClick={onPause} title="Pause the goal" className="p-1 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900">
                <PauseCircle className="w-3.5 h-3.5" />
              </button>
            )}
            {goal.status === 'paused' && (
              <button onClick={onResume} title="Resume the goal" className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 text-zinc-900 text-[11px] font-medium hover:bg-zinc-200">
                <PlayCircle className="w-3.5 h-3.5" /> Resume
              </button>
            )}
          </div>
        </div>

        {(goal.pauseReason || goal.waitingReason) && goal.status !== 'completed' && (
          <div className="text-[11px] text-amber-300/90 leading-snug">{goal.pauseReason || goal.waitingReason}</div>
        )}

        <div className="flex flex-wrap items-center gap-1">
          {Object.values(board.peers).map(peer => (
            <PeerChip key={peer.id} peer={peer} turn={turnByPeer.get(peer.id)} />
          ))}
          {Object.keys(board.peers).length === 0 && <span className="text-[11px] text-zinc-600">No workers on this session.</span>}
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          {([
            ['board', 'Board', <LayoutGrid key="i" className="w-3 h-3" />],
            ['changes', `Plan changes (${changes.length})`, <History key="i" className="w-3 h-3" />],
            ['turns', `Turns (${recentTurns.length + runningTurns.length})`, <Loader2 key="i" className="w-3 h-3" />]
          ] as Array<[typeof tab, string, React.ReactNode]>).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded ${tab === id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'board' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {needsUser.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400 mb-1">
                <HelpCircle className="w-3 h-3" /> Needs you ({needsUser.length})
              </div>
              <div className="space-y-1.5">
                {needsUser.map(card => (
                  <CardTile key={card.id} card={card} busy={false} onOpen={() => setOpenCardId(card.id)} />
                ))}
              </div>
            </div>
          )}

          {cards.length === 0 ? (
            <div className="text-xs text-zinc-600 py-8 text-center">The board is empty. State a goal in the chat to start.</div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
              {COLUMNS.map(column => {
                const inColumn = cards.filter(c => column.states.includes(c.state));
                return (
                  <div key={column.id} className="min-w-0">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                      <span>{column.label}</span>
                      <span className="font-mono">{inColumn.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {inColumn.map(card => (
                        <CardTile key={card.id} card={card} busy={busyCards.has(card.id)} onOpen={() => setOpenCardId(card.id)} />
                      ))}
                      {inColumn.length === 0 && <div className="h-8 rounded-lg border border-dashed border-zinc-900" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'changes' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs select-text">
          {changes.length === 0 && <div className="text-zinc-600 py-8 text-center">Nothing has changed yet.</div>}
          {changes.map(entry => (
            <div key={entry.version} className="flex items-start gap-2 py-1 border-b border-zinc-900">
              <span className="font-mono text-[10px] text-zinc-600 w-12 flex-shrink-0 pt-0.5">{timeAgo(entry.at)}</span>
              <div className="min-w-0">
                <span className={entry.actor === 'board' ? 'text-zinc-400' : 'text-sky-300'}>
                  {entry.actor === 'board' || entry.actor === 'user' || entry.actor === 'spec' ? entry.actor : `@${entry.actor}`}
                </span>{' '}
                <span className="text-zinc-300">{ACTION_TEXT[entry.action] || entry.action.replace(/_/g, ' ')}</span>
                {entry.cardId && (
                  <button onClick={() => { setOpenCardId(entry.cardId!); }} className="ml-1 font-mono text-zinc-400 hover:text-zinc-100 underline decoration-dotted">
                    {entry.cardId}
                  </button>
                )}
                {entry.detail && <span className="text-zinc-500"> — {entry.detail}</span>}
                {entry.reason && <div className="text-zinc-400 mt-0.5">Why: {entry.reason}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'turns' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs select-text">
          {[...runningTurns, ...recentTurns.slice().reverse()].length === 0 && <div className="text-zinc-600 py-8 text-center">No agent turns yet.</div>}
          {[...runningTurns, ...recentTurns.slice().reverse()].map(turn => (
            <div key={turn.id} className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/70">
              <div className="flex items-center gap-1.5 text-[11px]">
                {!turn.endedAt ? (
                  <Loader2 className="w-3 h-3 animate-spin text-sky-300" />
                ) : turn.outcome === 'ok' ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Ban className="w-3 h-3 text-rose-400" />
                )}
                <span className="text-sky-300">@{turn.peer}</span>
                <span className="text-zinc-500">{turn.reason}</span>
                {turn.cardId && <span className="font-mono text-zinc-400">{turn.cardId}</span>}
                <span className="ml-auto font-mono text-[10px] text-zinc-600">
                  {turn.endedAt ? `${Math.round((turn.endedAt - turn.startedAt) / 1000)}s · ${turn.outcome?.replace('_', ' ')}` : `running · ${timeAgo(turn.startedAt)}`}
                </span>
              </div>
              {turn.summary && <div className="text-zinc-400 mt-1 whitespace-pre-wrap line-clamp-4">{turn.summary}</div>}
            </div>
          ))}
        </div>
      )}

      {openCard && <CardDetail card={openCard} board={board} onClose={() => setOpenCardId(null)} onAnswer={onAnswer} onSetMinTier={onSetMinTier} />}
    </div>
  );
};
