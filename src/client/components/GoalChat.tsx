import React, { useEffect, useRef, useState } from 'react';
import { Send, GitMerge, Trash2, FileCode, CheckCircle2, HelpCircle, PauseCircle, AlertCircle, LayoutGrid, MessageSquare } from 'lucide-react';
import { GoalChatMessage, MessageArtifact, Session, WorktreeDiffSummary } from '../../shared/types.ts';
import { BoardData, BoardLogEntry, ReviewMode, Tier, TurnRecord } from '../../shared/board.ts';
import { ArtifactPreview } from './ArtifactPreview.tsx';
import { MarkdownContent } from './MarkdownContent.tsx';
import { BoardView } from './BoardView.tsx';
import { Logo } from './Logo.tsx';

interface GoalChatProps {
  currentSession: Session | null;
  messages: GoalChatMessage[];
  board: BoardData | null;
  log: BoardLogEntry[];
  runningTurns: TurnRecord[];
  recentTurns: TurnRecord[];
  isSending: boolean;
  onSendGoal: (goal: string) => void;
  onAnswerCard: (cardId: string, answer: string) => Promise<void>;
  onSetReviewMode: (mode: ReviewMode) => void;
  onPause: () => void;
  onResume: () => void;
  onSetMinTier: (cardId: string, tier: Tier | null) => Promise<void>;
  onMergeWorktree: (sessionId: string) => Promise<any>;
  onDiscardWorktree: (sessionId: string) => Promise<any>;
  onOpenNewSession: () => void;
}

/** The finished work, with the user's two choices: merge it into the base branch or leave it. */
const DiffCard: React.FC<{
  session: Session;
  summary: WorktreeDiffSummary;
  onMerge: (sessionId: string) => Promise<any>;
  onDiscard: (sessionId: string) => Promise<any>;
}> = ({ session, summary, onMerge, onDiscard }) => {
  const [busy, setBusy] = useState<'merge' | 'discard' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [artifacts, setArtifacts] = useState<MessageArtifact[]>([]);

  useEffect(() => {
    fetch(`/api/v1/sessions/${session.id}/worktree/artifacts`)
      .then(r => r.json())
      .then(d => setArtifacts((d.artifacts || []).filter((a: MessageArtifact) => a.type !== 'other')))
      .catch(() => {});
  }, [session.id]);

  const run = async (kind: 'merge' | 'discard') => {
    setBusy(kind);
    try {
      const res = kind === 'merge' ? await onMerge(session.id) : await onDiscard(session.id);
      setResult({ ok: !!res?.success, text: res?.message || (res?.success ? 'Done.' : 'Failed.') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-ink-0 shadow-soft overflow-hidden">
      <div className="px-3.5 py-2.5 flex items-center gap-2 text-[11.5px] font-mono">
        <FileCode className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
        <span className="text-ink-700 truncate">{summary.branch}</span>
        <span className="ml-auto px-1.5 rounded-full bg-mint-100 text-mint-700">+{summary.totalAdditions}</span>
        <span className={`px-1.5 rounded-full ${summary.totalDeletions > 0 ? 'bg-rose-100 text-rose-700' : 'bg-ink-100 text-ink-500'}`}>-{summary.totalDeletions}</span>
        <span className="text-ink-400 font-sans">{summary.changedFilesCount} file(s)</span>
      </div>
      {summary.files.length > 0 && (
        <div className="max-h-40 overflow-y-auto px-3.5 pb-2 text-[11px] font-mono">
          {summary.files.map(f => (
            <div key={f.file} className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-ink-600 truncate">{f.file}</span>
              <span className="flex-shrink-0">
                <span className="text-mint-600">+{f.additions}</span> <span className="text-rose-500">-{f.deletions}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {artifacts.length > 0 && (
        <div className="px-3.5 py-2 border-t border-ink-100">
          <ArtifactPreview artifacts={artifacts} />
        </div>
      )}
      <div className="px-3.5 py-2.5 bg-ink-50 flex items-center gap-2 text-xs">
        <button
          onClick={() => run('merge')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lav-200 hover:bg-lav-300 text-lav-700 font-medium disabled:opacity-50 transition-colors"
        >
          <GitMerge className="w-3.5 h-3.5" /> {busy === 'merge' ? 'Merging…' : `Merge into ${summary.baseBranch}`}
        </button>
        <button
          onClick={() => run('discard')}
          disabled={busy !== null}
          title="Throw away uncommitted changes in the session worktree"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ink-500 hover:text-ink-800 hover:bg-ink-100 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Discard uncommitted
        </button>
        {result && <span className={result.ok ? 'text-mint-600' : 'text-rose-600'}>{result.text}</span>}
      </div>
    </div>
  );
};

const KIND_ICON: Partial<Record<NonNullable<GoalChatMessage['kind']>, React.ReactNode>> = {
  question: <HelpCircle className="w-3.5 h-3.5 text-butter-600" />,
  paused: <PauseCircle className="w-3.5 h-3.5 text-butter-600" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-mint-500" />,
  error: <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
};

export const GoalChat: React.FC<GoalChatProps> = ({
  currentSession,
  messages,
  board,
  log,
  runningTurns,
  recentTurns,
  isSending,
  onSendGoal,
  onAnswerCard,
  onSetReviewMode,
  onPause,
  onResume,
  onSetMinTier,
  onMergeWorktree,
  onDiscardWorktree,
  onOpenNewSession
}) => {
  const [input, setInput] = useState('');
  const [narrowTab, setNarrowTab] = useState<'chat' | 'board'>('chat');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!currentSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6 bg-ink-25">
        <Logo size={72} />
        <div>
          <div className="text-base font-semibold text-ink-900">No session yet</div>
          <p className="text-[13px] text-ink-500 max-w-sm mt-1.5 leading-relaxed">
            A session is an isolated git worktree and a team of agent workers. Create one, then state a goal and the team plans and works it on a shared board.
          </p>
        </div>
        <button onClick={onOpenNewSession} className="px-4 py-2 rounded-xl bg-lav-200 hover:bg-lav-300 text-lav-700 text-xs font-medium transition-colors">
          New session
        </button>
      </div>
    );
  }

  const status = board?.goal.status || 'idle';
  const waiting = board ? board.order.map(id => board.cards[id]).filter(c => c?.state === 'needs_user') : [];
  const placeholder =
    status === 'idle' || status === 'completed'
      ? 'State a goal, or the path of a spec file…'
      : waiting.length === 1
      ? `Answer the team's question on ${waiting[0].id}…`
      : status === 'paused'
      ? 'Type "resume", or add a request for the team…'
      : 'Add a request for the team; it becomes a card…';

  const send = () => {
    const text = input.trim();
    if (!text || isSending) return;
    onSendGoal(text);
    setInput('');
  };

  const chat = (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-3.5 select-text">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-lav-50 px-4 py-3.5 text-[12.5px] text-ink-600 leading-relaxed">
            <p className="font-medium text-ink-800 mb-1">State a goal to start.</p>
            <p>
              The workers on this session are peers. They break the goal into cards, claim cards, hand work to each other, and change the plan when
              something does not go as expected. You see every change, and they ask you when only you can decide.
            </p>
          </div>
        )}
        {messages.map(msg =>
          msg.sender === 'user' ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-md bg-lav-100 text-ink-900 text-[12.5px] whitespace-pre-wrap">{msg.content}</div>
            </div>
          ) : (
            <div key={msg.id} className="max-w-[94%]">
              <div
                className={`px-3.5 py-2.5 rounded-2xl rounded-bl-md text-xs ${
                  msg.kind === 'question'
                    ? 'bg-butter-50 ring-1 ring-butter-200'
                    : msg.kind === 'completed'
                    ? 'bg-mint-50'
                    : msg.kind === 'paused' || msg.kind === 'error'
                    ? 'bg-rose-50'
                    : 'bg-ink-0 shadow-soft'
                }`}
              >
                <div className="flex items-start gap-2">
                  {msg.kind && KIND_ICON[msg.kind] && <span className="mt-0.5 flex-shrink-0">{KIND_ICON[msg.kind]}</span>}
                  <div className="min-w-0 text-ink-800">
                    <MarkdownContent content={msg.content} />
                  </div>
                </div>
                {msg.kind === 'completed' && msg.diffSummary && (
                  <DiffCard session={currentSession} summary={msg.diffSummary} onMerge={onMergeWorktree} onDiscard={onDiscardWorktree} />
                )}
              </div>
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      <div className="px-3 sm:px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))] flex-shrink-0">
        <div className="flex items-end gap-2 bg-ink-0 rounded-2xl px-3.5 py-2.5 shadow-soft ring-1 ring-ink-100 focus-within:ring-lav-300 transition-shadow">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-[12.5px] text-ink-900 placeholder-ink-400 focus:outline-none resize-none py-1"
          />
          <button
            onClick={send}
            disabled={!input.trim() || isSending}
            title="Send"
            className="p-2 rounded-xl bg-lav-200 hover:bg-lav-300 text-lav-700 disabled:opacity-40 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  const boardPanel = (
    <BoardView
      board={board}
      log={log}
      runningTurns={runningTurns}
      recentTurns={recentTurns}
      onAnswer={onAnswerCard}
      onSetReviewMode={onSetReviewMode}
      onPause={onPause}
      onResume={onResume}
      onSetMinTier={onSetMinTier}
    />
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Narrow screens: one panel at a time */}
      <div className="lg:hidden flex items-center gap-1 px-4 py-2 border-b border-ink-100 text-[11.5px] flex-shrink-0">
        <button onClick={() => setNarrowTab('chat')} className={`flex items-center gap-1 px-2.5 py-1 rounded-full ${narrowTab === 'chat' ? 'bg-lav-100 text-lav-700' : 'text-ink-500'}`}>
          <MessageSquare className="w-3 h-3" /> Chat
        </button>
        <button onClick={() => setNarrowTab('board')} className={`flex items-center gap-1 px-2.5 py-1 rounded-full ${narrowTab === 'board' ? 'bg-lav-100 text-lav-700' : 'text-ink-500'}`}>
          <LayoutGrid className="w-3 h-3" /> Board{waiting.length > 0 ? ` (${waiting.length} need you)` : ''}
        </button>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className={`${narrowTab === 'chat' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 w-full lg:w-[38%] lg:max-w-lg lg:border-r border-ink-100 bg-ink-25`}>{chat}</div>
        <div className={`${narrowTab === 'board' ? 'block' : 'hidden'} lg:block flex-1 min-w-0 min-h-0`}>{boardPanel}</div>
      </div>
    </div>
  );
};
