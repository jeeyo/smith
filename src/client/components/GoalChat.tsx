import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Lock,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Shield,
  ShieldCheck,
  Layers,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  GitMerge,
  Trash2,
  FileCode,
  Terminal as TerminalIcon,
  Check,
  Radio,
  Database,
  Bug,
  HelpCircle,
  Bot
} from 'lucide-react';
import { GoalChatMessage, Session, DiscoveredModel, SessionCostSummary, WorktreeDiffSummary, MessageArtifact, InteractiveQuestion } from '../../shared/types.ts';
import { ArtifactPreview } from './ArtifactPreview.tsx';
import { MarkdownContent } from './MarkdownContent.tsx';

interface GoalChatProps {
  currentSession: Session | null;
  messages: GoalChatMessage[];
  isOrchestrating: boolean;
  onSendGoal: (goal: string) => void;
  availableModels: DiscoveredModel[];
  costSummary?: SessionCostSummary;
  onOpenTerminal?: (initialCmd?: string) => void;
  onMergeWorktree?: (sessionId: string) => Promise<any>;
  onDiscardWorktree?: (sessionId: string) => Promise<any>;
  onStartExecution?: (sessionId: string) => Promise<void>;
  onAnswerQuestion?: (messageId: string, questionId: string, selectedOptions: string[], customAnswer?: string) => Promise<void>;
}

const InteractiveQuestionCard: React.FC<{
  question: InteractiveQuestion;
  messageId: string;
  onAnswer?: (messageId: string, questionId: string, selectedOptions: string[], customAnswer?: string) => Promise<void>;
}> = ({ question, messageId, onAnswer }) => {
  const [selected, setSelected] = useState<string[]>(question.selectedOptions || []);
  const [customText, setCustomText] = useState(question.customAnswer || '');
  const [submitting, setSubmitting] = useState(false);

  const toggleOption = (opt: string) => {
    if (question.answered) return;
    if (question.isMultiSelect) {
      setSelected(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
    } else {
      setSelected([opt]);
    }
  };

  const handleConfirm = async () => {
    if (!onAnswer || submitting || (selected.length === 0 && !customText.trim())) return;
    setSubmitting(true);
    try {
      await onAnswer(messageId, question.id, selected, customText.trim());
    } finally {
      setSubmitting(false);
    }
  };

  if (question.answered) {
    return (
      <div className="p-3 rounded-lg bg-zinc-950/80 border border-emerald-900/50 text-xs transition-colors">
        <div className="flex items-center justify-between text-zinc-300">
          <div className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-zinc-200">{question.prompt}</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
            @{question.askingAgent}
          </span>
        </div>
        <div className="mt-1.5 pl-5.5 text-[11px] text-emerald-400 font-medium">
          ✓ Decision: {question.customAnswer || question.selectedOptions?.join(', ')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-zinc-800 text-xs space-y-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-medium text-zinc-100">
            <HelpCircle className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span>{question.prompt}</span>
          </div>
          {question.context && (
            <p className="text-[11px] text-zinc-400 mt-1 pl-5.5">{question.context}</p>
          )}
        </div>
        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 flex-shrink-0">
          @{question.askingAgent} {question.askingModel ? `(${question.askingModel})` : ''}
        </span>
      </div>

      {/* Options List */}
      <div className="pl-5.5 space-y-1.5 pt-1">
        {question.options.map((opt, idx) => {
          const isChosen = selected.includes(opt);
          return (
            <div
              key={idx}
              onClick={() => toggleOption(opt)}
              className={`p-2 rounded-md border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                isChosen
                  ? 'bg-sky-950/40 border-sky-500/60 text-sky-200 font-medium'
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  isChosen ? 'border-sky-400 bg-sky-500' : 'border-zinc-700 bg-zinc-800'
                }`}>
                  {isChosen && <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />}
                </div>
                <span className="text-[11px]">{opt}</span>
              </div>
              {isChosen && <Check className="w-3 h-3 text-sky-400" />}
            </div>
          );
        })}

        {/* Custom Answer Input */}
        {question.allowCustom && (
          <div className="pt-1">
            <input
              type="text"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Or write custom instructions..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-700 placeholder-zinc-500"
            />
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-1">
          <button
            onClick={handleConfirm}
            disabled={submitting || (selected.length === 0 && !customText.trim())}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 font-medium text-[11px] transition-colors"
          >
            <span>{submitting ? 'Submitting...' : 'Submit Choice'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const GoalChat: React.FC<GoalChatProps> = ({
  currentSession,
  messages,
  isOrchestrating,
  onSendGoal,
  onStartExecution,
  availableModels,
  costSummary,
  onOpenTerminal,
  onMergeWorktree,
  onDiscardWorktree,
  onAnswerQuestion
}) => {
  const [inputGoal, setInputGoal] = useState('');
  const [expandedOps, setExpandedOps] = useState<Record<string, boolean>>({});
  const [opsTabs, setOpsTabs] = useState<Record<string, 'ops' | 'memory' | 'broadcast' | 'observer'>>({});
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [mergeStates, setMergeStates] = useState<Record<string, { status: 'idle' | 'merging' | 'merged' | 'discarded'; commit?: string }>>({});
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const mentionTargets = React.useMemo(() => {
    const list: Array<{ id: string; name: string; role: string; model: string }> = [
      {
        id: 'orchestrator',
        name: '@orchestrator',
        role: 'Orchestrator',
        model: currentSession?.customizations?.orchestrator?.model || 'gemini-4-argon'
      },
      {
        id: 'observer',
        name: '@observer',
        role: 'Telemetry Auditor',
        model: currentSession?.customizations?.observer?.model || 'gemini-4-argon'
      }
    ];

    if (currentSession?.agents) {
      for (const [key, agent] of Object.entries(currentSession.agents)) {
        list.push({
          id: key,
          name: `@${key}`,
          role: agent.config?.agentId || 'worker',
          model: agent.config?.model || 'active'
        });
      }
    }

    return list;
  }, [currentSession]);

  const filteredMentions = React.useMemo(() => {
    if (!mentionQuery) return mentionTargets;
    const q = mentionQuery.toLowerCase();
    return mentionTargets.filter(m => m.id.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
  }, [mentionTargets, mentionQuery]);

  const handleSelectMention = (item: { id: string }) => {
    if (!textareaRef.current) return;
    const before = inputGoal.substring(0, mentionStartIndex);
    const after = inputGoal.substring(textareaRef.current.selectionStart || inputGoal.length);
    const updated = `${before}@${item.id} ${after}`;
    setInputGoal(updated);
    setShowMentionPopup(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const nextPos = before.length + item.id.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputGoal(val);

    const cursorPos = e.target.selectionStart;
    const textUpToCursor = val.substring(0, cursorPos);
    const match = textUpToCursor.match(/@([a-zA-Z0-9_-]*)$/);

    if (match) {
      setShowMentionPopup(true);
      setMentionQuery(match[1]);
      setMentionStartIndex(cursorPos - match[0].length);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionPopup(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOrchestrating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGoal.trim() || isOrchestrating) return;
    const text = inputGoal.trim();
    setInputGoal('');
    onSendGoal(text);
  };

  const toggleOps = (id: string) => {
    setExpandedOps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleDiff = (id: string) => {
    setExpandedDiffs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMergeClick = async (msgId: string) => {
    if (!currentSession || !onMergeWorktree) return;
    setMergeStates(prev => ({ ...prev, [msgId]: { status: 'merging' } }));
    try {
      const res = await onMergeWorktree(currentSession.id);
      setMergeStates(prev => ({ ...prev, [msgId]: { status: 'merged', commit: res?.commit || 'HEAD' } }));
    } catch {
      setMergeStates(prev => ({ ...prev, [msgId]: { status: 'idle' } }));
    }
  };

  const handleDiscardClick = async (msgId: string) => {
    if (!currentSession || !onDiscardWorktree) return;
    try {
      await onDiscardWorktree(currentSession.id);
      setMergeStates(prev => ({ ...prev, [msgId]: { status: 'discarded' } }));
    } catch {}
  };

  const sampleGoals = [
    'Build an authentication service with Ed25519 tokens, route guards, and integration tests',
    'Refactor REST endpoints to OpenAPI 3.0 specification with swagger generation',
    'Scaffold rate-limiting middleware with Redis blacklist and stress test suite'
  ];

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto bg-zinc-950 text-zinc-100">
      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-300">
              <Layers className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-100 mb-2">Declare your goal</h1>
            <p className="text-sm text-zinc-400 max-w-md mb-8">
              Smith orchestrates Claude, Codex, and Gemini behind the scenes using cooperative non-racing task leases (arXiv:2610.22319) and Vectorize Hindsight memory.
            </p>

            {/* Quick Starters */}
            <div className="flex flex-col gap-2 w-full max-w-lg text-left">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">Example Goals</span>
              {sampleGoals.map((g, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendGoal(g)}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 transition-colors group"
                >
                  <span className="truncate pr-2">{g}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isAgent = msg.sender === 'agent';
            const isOpsOpen = !!expandedOps[msg.id];
            const isDiffOpen = !!expandedDiffs[msg.id];
            const mergeState = mergeStates[msg.id]?.status || 'idle';

            const senderTitle = isUser
              ? 'You'
              : isAgent
              ? msg.agentId === 'observer'
                ? `Observer (@observer · Telemetry Auditor)`
                : `Worker Agent (@${msg.agentId})`
              : `Smith Orchestrator (@${msg.orchestratorAgentId || currentSession?.customizations?.orchestrator?.agentId || 'antigravity'} · ${msg.orchestratorModel || currentSession?.customizations?.orchestrator?.model || 'gemini-2.5-pro'})`;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
              >
                {/* Sender Label */}
                <div className="flex items-center gap-2 px-1 text-xs text-zinc-400">
                  <span className="font-medium text-zinc-300">
                    {senderTitle}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!isUser && msg.status && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-mono ${
                      msg.status === 'completed' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60' :
                      msg.status === 'executing' ? 'bg-amber-950/40 text-amber-400 border-amber-800/60' :
                      msg.status === 'awaiting_approval' ? 'bg-sky-950/40 text-sky-400 border-sky-800/60' :
                      'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {msg.status === 'awaiting_approval' ? 'Awaiting Approval' : msg.status}
                    </span>
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`rounded-xl text-sm leading-relaxed ${
                    isUser
                      ? 'bg-zinc-800 border border-zinc-700 text-zinc-100 px-4 py-3 max-w-2xl'
                      : isAgent
                      ? msg.agentId === 'observer'
                        ? 'bg-zinc-900 border border-sky-800/70 text-zinc-200 p-5 w-full shadow-sm'
                        : 'bg-zinc-900 border border-emerald-800/70 text-zinc-200 p-5 w-full shadow-sm'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200 p-5 w-full shadow-sm'
                  }`}
                >
                  <MarkdownContent content={msg.content} />

                  {/* Awaiting Approval Action Card */}
                  {msg.status === 'awaiting_approval' && onStartExecution && currentSession && (
                    <div className="mt-4 p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span>Plan Formulated (Elephant Protocol) — Awaiting Approval</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Review the plan and answer any questions above. Click Start or type "start" to dispatch tasks to session workers.
                        </p>
                      </div>
                      <button
                        onClick={() => onStartExecution(currentSession.id)}
                        disabled={isOrchestrating}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors shadow-sm flex-shrink-0"
                      >
                        <span>▶ Start Execution</span>
                      </button>
                    </div>
                  )}

                  {/* Interactive Questions Asked by Orchestrator or Collaborating Agents */}
                  {msg.questions && msg.questions.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {msg.questions.map((q) => (
                        <InteractiveQuestionCard
                          key={q.id}
                          question={q}
                          messageId={msg.id}
                          onAnswer={onAnswerQuestion}
                        />
                      ))}
                    </div>
                  )}

                  {/* Operational Warnings / Agent Diagnostic Alerts */}
                  {msg.warnings && msg.warnings.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {msg.warnings.map((w, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200 flex items-start gap-2.5"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between flex-wrap gap-1.5">
                              <span className="font-semibold text-amber-300">{w.title}</span>
                              {w.type === 'auth_required' && onOpenTerminal && (
                                <button
                                  onClick={() => onOpenTerminal(w.agentId === 'claude' ? 'claude login' : 'powershell.exe')}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[11px] font-sans transition-colors"
                                >
                                  <TerminalIcon className="w-3 h-3 text-amber-400" />
                                  <span>Launch Terminal Auth</span>
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-300 mt-0.5">{w.message}</div>
                            {w.remediation && (
                              <div className="mt-1.5 text-[11px] font-mono text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 inline-block">
                                {w.remediation}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cooperative Plan Card */}
                  {msg.plan && msg.plan.subtasks && msg.plan.subtasks.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-zinc-800/80">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="text-xs font-semibold text-zinc-300">
                            {msg.plan.isDelta ? 'Conversational Delta (Targeted Scope Lock)' : 'Cooperative Task DAG (Zero Racing · arXiv:2610.22319)'}
                          </span>
                          {msg.plan.isDelta && (
                            <span className="px-1.5 py-0.2 rounded bg-sky-950/60 text-sky-300 border border-sky-800/80 text-[10px] font-mono">
                              DELTA
                            </span>
                          )}
                        </div>
                        {msg.plan.worktreeBranch && (
                          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                            <GitBranch className="w-3 h-3 text-zinc-400" />
                            <span>{msg.plan.worktreeBranch}</span>
                          </div>
                        )}
                      </div>

                      {/* Subtasks Matrix */}
                      <div className="space-y-2">
                        {msg.plan.subtasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs gap-2 sm:gap-0"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {task.status === 'completed' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                              ) : task.status === 'in_progress' ? (
                                <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin flex-shrink-0" />
                              ) : (
                                <Clock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                              )}
                              <span className={`font-medium truncate ${task.status === 'completed' ? 'text-zinc-200' : 'text-zinc-300'}`}>
                                {task.title}
                              </span>
                            </div>

                            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 flex-shrink-0 sm:ml-3">
                              {/* Locked File Scope */}
                              <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                <Lock className="w-2.5 h-2.5 text-zinc-500" />
                                <span>{task.fileScope.join(', ')}</span>
                              </div>

                              {/* Agent Assignment Badge (With Health Reroute Pill) */}
                              {task.routedFrom ? (
                                <span
                                  title={task.routingReason || `Auto-routed from @${task.routedFrom}`}
                                  className="font-mono text-[11px] text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80 flex items-center gap-1"
                                >
                                  <span>@{task.agentId}</span>
                                  <span className="text-zinc-400 text-[10px]">(routed from @{task.routedFrom})</span>
                                </span>
                              ) : (
                                <span className="font-mono text-[11px] text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                                  @{task.agentId}
                                </span>
                              )}

                              {/* Task USD Cost */}
                              {task.costUsd !== undefined && task.costUsd > 0 && (
                                <span className="font-mono text-[11px] text-zinc-400">
                                  ${task.costUsd.toFixed(4)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Hindsight Anti-patterns consulted */}
                      {msg.plan.antiPatternsConsulted && msg.plan.antiPatternsConsulted.length > 0 && (
                        <div className="mt-3 p-2 rounded bg-zinc-950/70 border border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                          <span>
                            <strong>Vectorize Hindsight memory:</strong> Checked {msg.plan.antiPatternsConsulted.length} known anti-pattern(s) to avoid repeating past failure modes.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Git Worktree Diff & One-Click Merge Card */}
                  {msg.diffSummary && (
                    <div className="mt-4 pt-4 border-t border-zinc-800/80">
                      <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <FileCode className="w-4 h-4 text-zinc-400" />
                            <span className="font-semibold text-zinc-200">Worktree Diff Preview</span>
                            <span className="font-mono text-[11px] text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-900/50">
                              +{msg.diffSummary.totalAdditions}
                            </span>
                            <span className="font-mono text-[11px] text-rose-400 bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-900/50">
                              -{msg.diffSummary.totalDeletions}
                            </span>
                            <span className="text-zinc-500 text-[11px]">across {msg.diffSummary.changedFilesCount} files</span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2">
                            {mergeState === 'merged' ? (
                              <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800/80">
                                <Check className="w-3 h-3" />
                                <span>Merged into main cleanly</span>
                              </span>
                            ) : mergeState === 'discarded' ? (
                              <span className="font-mono text-[11px] text-zinc-400 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                                Changes discarded
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleMergeClick(msg.id)}
                                  disabled={mergeState === 'merging'}
                                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
                                >
                                  <GitMerge className="w-3.5 h-3.5" />
                                  <span>{mergeState === 'merging' ? 'Merging...' : 'Merge to main'}</span>
                                </button>
                                <button
                                  onClick={() => handleDiscardClick(msg.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Discard</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Collapsible File List Accordion */}
                        <div>
                          <button
                            onClick={() => toggleDiff(msg.id)}
                            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                          >
                            {isDiffOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>{isDiffOpen ? 'Hide changed files' : `View ${msg.diffSummary.files.length} changed files`}</span>
                          </button>

                          {isDiffOpen && (
                            <div className="mt-2 space-y-1 font-mono text-[11px]">
                              {msg.diffSummary.files.map((f, fIdx) => (
                                <div key={fIdx} className="flex items-center justify-between p-1.5 rounded bg-zinc-900/60 border border-zinc-800/60">
                                  <span className="text-zinc-300 truncate">{f.file}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                    <span className="text-emerald-400">+{f.additions}</span>
                                    <span className="text-rose-400">-{f.deletions}</span>
                                    <span className="text-[10px] uppercase px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                      {f.status}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Real Session Artifacts (files on disk generated in worktree) */}
                  {msg.artifacts && msg.artifacts.length > 0 && (
                    <ArtifactPreview artifacts={msg.artifacts} />
                  )}

                  {/* The Observer Independent Verification & Safety Harness */}
                  {msg.observerAudits && msg.observerAudits.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-zinc-800/80">
                      <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span className="font-semibold text-zinc-200">The Observer · Independent Verification Harness</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 text-[10px] font-mono">
                              PASSIVE AUDIT
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-zinc-400">
                            {msg.observerAudits.filter(a => a.verdict === 'verified').length}/{msg.observerAudits.length} Audits Certified
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {msg.observerAudits.map((audit) => (
                            <div key={audit.id} className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs space-y-1.5">
                              <div className="flex items-center justify-between flex-wrap gap-1">
                                <div className="flex items-center gap-1.5 font-medium">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                    audit.verdict === 'verified' ? 'bg-emerald-400' : 'bg-rose-400'
                                  }`} />
                                  <span className="text-zinc-200">@{audit.targetAgent}: {audit.summary}</span>
                                </div>
                                <span className="font-mono text-[10px] text-zinc-500">
                                  {(audit.confidence * 100).toFixed(0)}% confidence
                                </span>
                              </div>

                              {audit.milestonesVerified.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {audit.milestonesVerified.map((m, mIdx) => (
                                    <span key={mIdx} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-emerald-400 border border-emerald-900/60">
                                      <Check className="w-2.5 h-2.5" />
                                      <span>{m}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Behind-the-Scenes Operations & Telemetry Drawer */}
                  {msg.operations && msg.operations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/80">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <button
                          onClick={() => toggleOps(msg.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {isOpsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span>Behind the scenes ({msg.operations.length} operations, memory & peer telemetry)</span>
                        </button>

                        {isOpsOpen && (
                          <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 text-[11px]">
                            <button
                              onClick={() => setOpsTabs(prev => ({ ...prev, [msg.id]: 'ops' }))}
                              className={`px-2 py-0.5 rounded transition-colors ${
                                (opsTabs[msg.id] || 'ops') === 'ops' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              Operations
                            </button>
                            <button
                              onClick={() => setOpsTabs(prev => ({ ...prev, [msg.id]: 'memory' }))}
                              className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                                opsTabs[msg.id] === 'memory' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <Database className="w-2.5 h-2.5" />
                              <span>Dual Memory</span>
                            </button>
                            <button
                              onClick={() => setOpsTabs(prev => ({ ...prev, [msg.id]: 'broadcast' }))}
                              className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                                opsTabs[msg.id] === 'broadcast' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <Radio className="w-2.5 h-2.5" />
                              <span>Peer Broadcast</span>
                            </button>
                            <button
                              onClick={() => setOpsTabs(prev => ({ ...prev, [msg.id]: 'observer' }))}
                              className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                                opsTabs[msg.id] === 'observer' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <Shield className="w-2.5 h-2.5" />
                              <span>Observer</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {isOpsOpen && (
                        <div className="mt-2.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] max-h-64 overflow-y-auto">
                          {/* Tab 1: Operations Stream */}
                          {(opsTabs[msg.id] || 'ops') === 'ops' && (
                            <div className="space-y-1.5">
                              {msg.operations.map((op, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-zinc-400 leading-normal">
                                  <span className="text-zinc-500 flex-shrink-0">
                                    {new Date(op.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  </span>
                                  <span className="text-zinc-300 font-semibold flex-shrink-0">[{op.agentId}]</span>
                                  <span className="text-zinc-300">{op.action}:</span>
                                  <span className="text-zinc-500">{op.detail}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Tab 2: Dual-Layer Memory */}
                          {opsTabs[msg.id] === 'memory' && (
                            <div className="space-y-3 font-sans text-xs">
                              <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                <div className="flex items-center justify-between text-zinc-300 font-semibold">
                                  <span>1. Shared Team Memory Workspace</span>
                                  <span className="font-mono text-[10px] text-zinc-500">.smith/memory/sessions/team/knowledge.md</span>
                                </div>
                                <p className="text-[11px] text-zinc-400">
                                  Synchronized across all agent environments. Preserves shared conventions, architecture schemas, and certified milestones.
                                </p>
                              </div>

                              <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                <div className="flex items-center justify-between text-zinc-300 font-semibold">
                                  <span>2. Private Agent Scratchpad Directories</span>
                                  <span className="font-mono text-[10px] text-zinc-500">.smith/memory/sessions/agents/&#123;agentId&#125;/scratchpad.md</span>
                                </div>
                                <p className="text-[11px] text-zinc-400">
                                  Private task stack and execution plans per agent. Isolated from peer interference.
                                </p>
                              </div>

                              <div className="p-2 rounded bg-emerald-950/20 border border-emerald-900/40 text-[11px] text-emerald-300 flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                <span>Compaction Survival Active: Durable discoveries flushed to team workspace before context roll-overs.</span>
                              </div>
                            </div>
                          )}

                          {/* Tab 3: Peer Broadcast Chat Layer */}
                          {opsTabs[msg.id] === 'broadcast' && (
                            <div className="space-y-2 font-sans text-xs">
                              <div className="text-[11px] text-zinc-400">
                                Live decentralized channel: Dynamic role proposals, consensus votes, emergency coordinate alerts, and error retractions.
                              </div>
                              <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800/80 space-y-2 font-mono text-[11px]">
                                <div className="text-sky-300">
                                  <strong>[PROPOSAL]</strong> @antigravity: Proposed initial role decomposition and architecture lock.
                                </div>
                                <div className="text-emerald-300">
                                  <strong>[CONSENSUS]</strong> @codex: Accepted proposal. Ratified dynamic role allocation.
                                </div>
                                <div className="text-zinc-400">
                                  <strong>[PEER INGESTION]</strong> Messages injected directly into teammate turn execution cycles.
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tab 4: Observer Telemetry Audits */}
                          {opsTabs[msg.id] === 'observer' && (
                            <div className="space-y-2 font-sans text-xs">
                              <div className="text-[11px] text-zinc-400">
                                Passive telemetry audit: Evaluates ground truth on disk to eliminate hallucination and specification gaming.
                              </div>
                              {msg.observerAudits && msg.observerAudits.length > 0 ? (
                                <div className="space-y-2">
                                  {msg.observerAudits.map(a => (
                                    <div key={a.id} className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800/80 space-y-1 font-mono text-[11px]">
                                      <div className="flex items-center justify-between">
                                        <span className="text-emerald-400 font-bold">[{a.verdict.toUpperCase()}] @{a.targetAgent}</span>
                                        <span className="text-zinc-500">{(a.confidence * 100).toFixed(0)}% confidence</span>
                                      </div>
                                      <div className="text-zinc-300 font-sans text-xs">{a.summary}</div>
                                      <div className="text-zinc-500 text-[10px]">
                                        Files verified: {a.groundTruthCheck.filesVerified.length} · Missing: {a.groundTruthCheck.missingFiles.length} · Spec gaming flags: {a.groundTruthCheck.specGamingSigns.length}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-zinc-500 font-mono text-[11px]">Observer telemetry stream active.</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Cost & Resource Footer */}
                  {msg.cost && (
                    <div className="mt-3 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 text-[11px] text-zinc-500 font-mono border-t border-zinc-800/40">
                      <span>Compute Cost: <strong className="text-zinc-300">{msg.cost.formatted} USD</strong></span>
                      <span>Tokens Consumed: <strong className="text-zinc-300">{msg.cost.tokens.toLocaleString()}</strong></span>
                      <span>Subscription Charges: <strong className="text-emerald-400">$0.00</strong> (Local Auth)</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Live Orchestrating Spinner */}
        {isOrchestrating && (
          <div className="flex items-center gap-2.5 p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
            <div className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
            <span>Smith orchestrator executing cooperative tasks across agents behind the scenes...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Pinned to Bottom */}
      <div className="border-t border-zinc-800 bg-zinc-950 p-4">
        <form onSubmit={handleSubmit} className="relative">
          {/* @ Mention Autocomplete Popup Menu */}
          {showMentionPopup && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-80 max-h-56 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1.5 z-50 divide-y divide-zinc-800/60">
              <div className="px-3 py-1 text-[10px] uppercase font-semibold text-zinc-500 tracking-wider flex items-center justify-between">
                <span>Select Agent / Worker</span>
                <span className="text-[9px] text-zinc-600 font-normal">↑↓ navigate · Enter select</span>
              </div>
              <div className="py-1">
                {filteredMentions.map((item, idx) => {
                  const isSelected = idx === selectedMentionIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectMention(item)}
                      onMouseEnter={() => setSelectedMentionIndex(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                        isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-medium ${item.id === 'observer' ? 'text-sky-400' : item.id === 'orchestrator' ? 'text-amber-400' : 'text-emerald-400'}`}>
                          @{item.id}
                        </span>
                        <span className="text-[11px] text-zinc-400">({item.role})</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[100px]">{item.model}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={inputGoal}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (showMentionPopup && filteredMentions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSelectedMentionIndex(prev => (prev + 1) % filteredMentions.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSelectedMentionIndex(prev => (prev - 1 + filteredMentions.length) % filteredMentions.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  handleSelectMention(filteredMentions[selectedMentionIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowMentionPopup(false);
                  return;
                }
              }

              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Declare a goal, ask a question, or type @ to mention an agent (e.g. '@observer ...', '@worker-1 ...')..."
            rows={2}
            disabled={isOrchestrating}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 pr-24 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 resize-none transition-colors disabled:opacity-60"
          />

          <div className="absolute right-3 bottom-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={!inputGoal.trim() || isOrchestrating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-800 text-zinc-900 disabled:text-zinc-500 text-xs font-medium transition-colors"
            >
              <span>Run</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 text-[11px] text-zinc-500 gap-1.5 sm:gap-0">
          <span className="truncate">Press Enter to dispatch. Smith breaks down tasks & locks file scopes automatically.</span>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span>Non-Racing: <strong>Active</strong></span>
            <span>Subscriptions: <strong>Active</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
