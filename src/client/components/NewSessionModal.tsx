import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Users, ShieldCheck } from 'lucide-react';
import { AgentHealthStatus, DiscoveredModel, SessionCreateInput } from '../../shared/types.ts';
import { HarnessId, ReviewMode, Tier } from '../../shared/board.ts';
import { FolderPicker } from './FolderPicker.tsx';

export interface WorkerSlot {
  key: string;
  agentId: HarnessId;
  model: string;
  tier: Tier;
  /** True once the user has set the tier by hand, so a model change no longer overrides it. */
  tierPinned?: boolean;
}

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: DiscoveredModel[];
  agentHealth?: Record<string, AgentHealthStatus>;
  onCreateSession: (input: SessionCreateInput) => Promise<string | null>;
}

export const HARNESS_LABELS: Record<HarnessId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode'
};

export const REVIEW_MODES: Array<{ id: ReviewMode; label: string; hint: string }> = [
  { id: 'fast', label: 'Fast', hint: 'No card reviews. For small goals.' },
  { id: 'normal', label: 'Normal', hint: 'Larger or riskier cards are reviewed by another worker.' },
  { id: 'thorough', label: 'Thorough', hint: 'Every card is reviewed by another worker.' }
];

/** Mirrors the server's suggestion so the form shows the tier a worker will get. */
export function suggestTier(model: string): Tier {
  const m = (model || '').toLowerCase();
  if (/haiku|mini|nano|lite|flash|small|ollama|local|qwen|deepseek|llama/.test(m)) return 1;
  if (/opus|fable|mythos|ultra|\bo1\b|\bo3\b|pro\b|gpt-5|gpt-6/.test(m)) return 3;
  return 2;
}

let slotCounter = 0;
const newKey = () => `w-${++slotCounter}`;

export const NewSessionModal: React.FC<NewSessionModalProps> = ({ isOpen, onClose, availableModels, agentHealth, onCreateSession }) => {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [branchError, setBranchError] = useState('');
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('normal');
  const [workers, setWorkers] = useState<WorkerSlot[]>([]);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const harnessState = (id: HarnessId): { usable: boolean; label?: string } => {
    const health = agentHealth?.[id];
    if (!health) return { usable: true };
    if (!health.installed || health.status === 'not_installed') return { usable: false, label: 'not installed' };
    if (health.status === 'not_logged_in') return { usable: true, label: 'login needed' };
    if (health.status === 'error') return { usable: false, label: 'not working' };
    return { usable: true };
  };

  const modelsFor = (id: HarnessId) => availableModels.filter(m => m.agentId === id);
  const defaultModel = (id: HarnessId) => {
    const models = modelsFor(id);
    return (models.find(m => m.isDefault) || models[0])?.id || '';
  };

  // When the dialog opens: the default workspace, and one worker per usable harness.
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    fetch('/api/v1/system/config')
      .then(r => r.json())
      .then(cfg => setRepoPath(prev => prev || cfg.app?.defaultRepoPath || ''))
      .catch(() => {});
    setWorkers(prev => {
      if (prev.length > 0) return prev;
      const usable = (Object.keys(HARNESS_LABELS) as HarnessId[]).filter(h => harnessState(h).usable && agentHealth?.[h]);
      const picks: HarnessId[] = usable.length >= 2 ? usable.slice(0, 2) : usable.length === 1 ? [usable[0], usable[0]] : ['claude'];
      return picks.map(h => {
        const model = defaultModel(h);
        return { key: newKey(), agentId: h, model, tier: suggestTier(model) };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !repoPath.trim()) { setBranches([]); setBaseBranch(''); return; }
    const abort = new AbortController();
    setBranchesLoading(true); setBranchError(''); setBranches([]);
    const timer = setTimeout(() => {
      fetch(`/api/v1/system/branches?${new URLSearchParams({ path: repoPath.trim() })}`, { signal: abort.signal })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
        .then(data => { setBranches(data.branches); setBaseBranch(previous => data.branches.includes(previous) ? previous : data.defaultBranch); })
        .catch(err => { if (err.name !== 'AbortError') { setBranchError(err.message); setBaseBranch(''); } })
        .finally(() => { if (!abort.signal.aborted) setBranchesLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [isOpen, repoPath]);

  if (!isOpen) return null;

  const updateWorker = (key: string, patch: Partial<WorkerSlot>) => {
    setWorkers(prev =>
      prev.map(w => {
        if (w.key !== key) return w;
        const next = { ...w, ...patch };
        if (patch.agentId && patch.agentId !== w.agentId) next.model = defaultModel(patch.agentId);
        if ((patch.model !== undefined || patch.agentId) && !next.tierPinned) next.tier = suggestTier(next.model);
        return next;
      })
    );
  };

  const addWorker = () => {
    const harness = ((Object.keys(HARNESS_LABELS) as HarnessId[]).find(h => harnessState(h).usable) || 'claude') as HarnessId;
    const model = defaultModel(harness);
    setWorkers(prev => [...prev, { key: newKey(), agentId: harness, model, tier: suggestTier(model) }]);
  };

  const handleCreate = async () => {
    if (isCreating) return;
    if (!name.trim()) return setError('Give the session a name.');
    if (!repoPath.trim()) return setError('Set the repository path.');
    if (branchesLoading || !baseBranch || branchError) return setError(branchError || 'Choose a repository and an existing base branch.');
    const valid = workers.filter(w => w.model.trim());
    if (valid.length === 0) return setError('Add at least one worker with a model.');
    setError('');
    setIsCreating(true);
    try {
      const complaint = await onCreateSession({
        name: name.trim(),
        repoPath: repoPath.trim(),
        baseBranch: baseBranch.trim() || 'main',
        reviewMode,
        agents: valid.map(w => ({ agentId: w.agentId, model: w.model.trim(), tier: w.tier }))
      });
      if (complaint) {
        setError(complaint);
        return;
      }
      setName('');
      setWorkers([]);
      onClose();
    } catch {
      setError('Could not create the session. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const inputClass =
    'w-full bg-ink-50 rounded-xl px-3 py-2 text-xs text-ink-900 placeholder-ink-400 ring-1 ring-transparent focus:outline-none focus:ring-lav-300 focus:bg-ink-0 transition';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-[2px] p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="new-session-title" aria-busy={isCreating} className="bg-ink-0 rounded-2xl w-full max-w-xl max-h-[92dvh] flex flex-col text-ink-900 shadow-float">
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2 flex items-start justify-between">
          <div>
            <h2 id="new-session-title" className="text-base font-semibold">New session</h2>
            <p className="text-[12px] text-ink-500 mt-0.5">An isolated git worktree and a team of workers. You state the goal in the chat afterwards.</p>
          </div>
          <button onClick={onClose} disabled={isCreating} aria-label="Close new session" className="p-1.5 rounded-lg text-ink-400 hover:text-ink-800 hover:bg-ink-50 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 text-xs">
          <fieldset disabled={isCreating} className="min-w-0 space-y-5">
            <div>
              <label htmlFor="session-name" className="block text-[11px] font-medium text-ink-500 mb-1.5">Name</label>
              <input id="session-name" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Checkout rewrite" className={inputClass} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-2">
              <div className="sm:col-span-2">
                <label htmlFor="session-repo" className="block text-[11px] font-medium text-ink-500 mb-1.5">Repository path</label>
                <div className="flex gap-2">
                  <input id="session-repo" value={repoPath} onChange={e => setRepoPath(e.target.value)} placeholder="/Users/you/code/project" className={`${inputClass} font-mono min-w-0`} />
                  <button onClick={() => setFolderPickerOpen(true)} className="px-3 rounded-xl bg-lav-100 text-lav-700" aria-label="Browse repository folders">Browse</button>
                </div>
              </div>
              <div>
                <label htmlFor="session-base" className="block text-[11px] font-medium text-ink-500 mb-1.5">Base branch</label>
                <select id="session-base" value={baseBranch} disabled={branchesLoading || branches.length === 0} onChange={e => setBaseBranch(e.target.value)} className={`${inputClass} font-mono`}>
                  {!baseBranch && <option value="">{branchesLoading ? 'Loading…' : 'Choose folder first'}</option>}
                  {branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                </select>
              </div>
            </div>
            {branchError && <p role="alert" className="text-rose-700">{branchError}</p>}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-ink-800 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-ink-400" /> Workers
                </span>
                <button onClick={addWorker} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-lav-700 hover:bg-lav-50 font-medium">
                  <Plus className="w-3 h-3" /> Add worker
                </button>
              </div>
              <p className="text-[11px] text-ink-500 mb-2">
                All workers are peers; none leads. Workers on the same CLI and model share one subscription limit, and leave the team together when it is reached.
              </p>
              <div className="space-y-1.5">
                {workers.map((w, i) => {
                  const models = modelsFor(w.agentId);
                  const state = harnessState(w.agentId);
                  return (
                    <div key={w.key} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 p-1.5 rounded-xl bg-ink-50">
                      <span className="w-6 text-center text-ink-300 font-mono">{i + 1}</span>
                      <select
                        value={w.agentId}
                        onChange={e => updateWorker(w.key, { agentId: e.target.value as HarnessId })}
                        className="bg-ink-0 rounded-lg px-2 py-1.5 text-ink-800 focus:outline-none"
                      >
                        {(Object.keys(HARNESS_LABELS) as HarnessId[]).map(h => {
                          const s = harnessState(h);
                          return (
                            <option key={h} value={h} disabled={!s.usable}>
                              {HARNESS_LABELS[h]}{s.label ? ` (${s.label})` : ''}
                            </option>
                          );
                        })}
                      </select>
                      {models.length > 0 ? (
                        <select
                          value={w.model}
                          onChange={e => updateWorker(w.key, { model: e.target.value })}
                          className="flex-1 min-w-[150px] bg-ink-0 rounded-lg px-2 py-1.5 text-ink-800 font-mono focus:outline-none"
                        >
                          {!models.some(m => m.id === w.model) && <option value={w.model}>{w.model || 'choose a model'}</option>}
                          {models.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={w.model}
                          onChange={e => updateWorker(w.key, { model: e.target.value })}
                          placeholder="model id"
                          className="flex-1 min-w-[150px] bg-ink-0 rounded-lg px-2 py-1.5 text-ink-800 font-mono focus:outline-none"
                        />
                      )}
                      <select
                        value={w.tier}
                        title="How capable this model is. A card can require a minimum tier."
                        onChange={e => updateWorker(w.key, { tier: Number(e.target.value) as Tier, tierPinned: true })}
                        className="bg-ink-0 rounded-lg px-2 py-1.5 text-ink-800 focus:outline-none"
                      >
                        <option value={1}>Tier 1</option>
                        <option value={2}>Tier 2</option>
                        <option value={3}>Tier 3</option>
                      </select>
                      <button
                        onClick={() => setWorkers(prev => prev.filter(x => x.key !== w.key))}
                        title="Remove worker"
                        className="p-1.5 rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {!state.usable && <span className="text-rose-600 text-[10px]">{state.label}</span>}
                    </div>
                  );
                })}
                {workers.length === 0 && <div className="text-ink-500 py-2">No workers yet.</div>}
              </div>
            </div>

            <div>
              <span className="font-medium text-ink-800 flex items-center gap-1.5 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-ink-400" /> Review mode
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {REVIEW_MODES.map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setReviewMode(mode.id)}
                    className={`p-3 rounded-xl text-left transition-all ${
                      reviewMode === mode.id ? 'bg-lav-50 ring-2 ring-lav-300' : 'bg-ink-50 hover:bg-ink-100'
                    }`}
                  >
                    <div className="font-medium text-ink-800">{mode.label}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5 leading-snug">{mode.hint}</div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-500 mt-1.5">The finished goal is verified in every mode. You can change the mode while the team works.</p>
            </div>
          </fieldset>
        </div>

        {error && <div role="alert" className="shrink-0 max-h-28 overflow-y-auto px-5 sm:px-6 pt-2 text-xs text-rose-600 break-words">{error}</div>}

        <div className="shrink-0 px-5 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={isCreating} className="px-3.5 py-2 rounded-xl hover:bg-ink-50 text-ink-500 hover:text-ink-800 font-medium text-xs disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={isCreating || branchesLoading} className="px-4 py-2 rounded-xl bg-lav-200 hover:bg-lav-300 text-lav-700 font-medium text-xs disabled:opacity-50">
            {isCreating ? 'Creating…' : 'Create session'}
          </button>
        </div>
      </div>
      {folderPickerOpen && <FolderPicker initialPath={repoPath || undefined} onClose={() => setFolderPickerOpen(false)} onSelect={folder => { setRepoPath(folder); setFolderPickerOpen(false); }} />}
    </div>
  );
};
