import React, { useState } from 'react';
import { CheckCircle2, Clock, Lock, Play, Plus, AlertTriangle, ShieldCheck, DollarSign } from 'lucide-react';
import { Task, AgentId } from '../../shared/types.ts';

interface PlaybookDAGProps {
  tasks: Task[];
  activeAgents: AgentId[];
  onClaimTask: (taskId: string, agentId: AgentId) => void;
  onCompleteTask: (taskId: string, agentId: AgentId, notes?: string) => void;
  onReleaseTask: (taskId: string, agentId: AgentId) => void;
  onDelegateSubtask: (subtask: { title: string; description: string; suggestedAgent?: AgentId; fileScope?: string[]; dependencies?: string[] }) => void;
}

export const PlaybookDAG: React.FC<PlaybookDAGProps> = ({
  tasks,
  activeAgents,
  onClaimTask,
  onCompleteTask,
  onReleaseTask,
  onDelegateSubtask
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAgent, setNewAgent] = useState<AgentId>(activeAgents[0] || 'claude');
  const [newFileScope, setNewFileScope] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onDelegateSubtask({
      title: newTitle.trim(),
      description: newDesc.trim() || 'Cooperative task',
      suggestedAgent: newAgent,
      fileScope: newFileScope ? newFileScope.split(',').map(s => s.trim()) : ['*']
    });
    setNewTitle('');
    setNewDesc('');
    setNewFileScope('');
    setShowAddModal(false);
  };

  const getStatusBadge = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Done</span>;
      case 'in_progress':
        return <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded-full"><Play className="w-3 h-3" /> In Progress</span>;
      case 'blocked':
        return <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded-full"><Lock className="w-3 h-3" /> Blocked</span>;
      default:
        return <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> Unassigned</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>Cooperative Playbook DAG</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">arXiv:2610.22319 Non-Racing</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Tasks negotiate atomic leases and file-scope locks among agents to prevent race conditions.</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs shadow-md shadow-sky-500/20 transition-all"
        >
          <Plus className="w-4 h-4" /> Delegate Subtask
        </button>
      </div>

      {/* Task List DAG Cards */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">No tasks in the Playbook DAG. Click &quot;Delegate Subtask&quot; to begin.</div>
        ) : (
          tasks.map(t => (
            <div
              key={t.id}
              className={`p-4 rounded-xl border transition-all ${
                t.status === 'in_progress'
                  ? 'bg-sky-950/20 border-sky-800/80 shadow-md shadow-sky-950/30'
                  : t.status === 'completed'
                  ? 'bg-slate-950/40 border-slate-800/60 opacity-80'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-200">{t.title}</span>
                    {getStatusBadge(t.status)}
                    {t.assignedAgent && (
                      <span className="text-[11px] font-semibold text-slate-300 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 capitalize">
                        @{t.assignedAgent}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{t.description}</p>
                </div>

                {/* Task Resource Cost */}
                {t.costUsd > 0 && (
                  <div className="flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-1 rounded-lg">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>${t.costUsd.toFixed(4)} USD</span>
                  </div>
                )}
              </div>

              {/* File Scope Locks & Actions */}
              <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Locked Scope:</span>
                  </span>
                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-300">
                    {t.fileScope.map((scope, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">{scope}</span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {t.status === 'unassigned' && (
                    <button
                      onClick={() => onClaimTask(t.id, activeAgents[0] || 'claude')}
                      className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-sm"
                    >
                      Claim as {activeAgents[0] || 'claude'}
                    </button>
                  )}
                  {t.status === 'in_progress' && (
                    <>
                      <button
                        onClick={() => onCompleteTask(t.id, t.assignedAgent || activeAgents[0])}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm"
                      >
                        Mark Complete
                      </button>
                      <button
                        onClick={() => onReleaseTask(t.id, t.assignedAgent || activeAgents[0])}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
                      >
                        Release Lock
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delegate Subtask Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100">Delegate Subtask to Shared DAG</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Subtask Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Implement user token rotation"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Instructions / Description</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Specific requirements, expected signatures, and tests..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Suggested Agent</label>
                <select
                  value={newAgent}
                  onChange={e => setNewAgent(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 capitalize"
                >
                  {activeAgents.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Locked File Scope (Comma-separated)</label>
                <input
                  type="text"
                  value={newFileScope}
                  onChange={e => setNewFileScope(e.target.value)}
                  placeholder="src/auth/*, tests/auth.test.ts"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold shadow-md shadow-sky-500/20"
                >
                  Create Subtask
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
