import React, { useState } from 'react';
import { X, Layers, Shield, Bot, Plus, Trash2 } from 'lucide-react';
import { AgentId, AgentHealthStatus, DiscoveredModel, SessionCreateInput } from '../../shared/types.ts';

export interface WorkerSlot {
  id: string;
  agentId: AgentId;
  model: string;
}

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: DiscoveredModel[];
  agentHealth?: Record<string, AgentHealthStatus>;
  onCreateSession: (input: SessionCreateInput) => void;
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
  isOpen,
  onClose,
  availableModels,
  agentHealth,
  onCreateSession
}) => {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('c:\\Users\\jeeyo\\Desktop\\johnson');
  const [baseBranch, setBaseBranch] = useState('main');

  const isAgentAvailable = (agentId: string): { available: boolean; label?: string } => {
    const health = agentHealth?.[agentId];
    if (!health) {
      if (agentId === 'opencode') return { available: false, label: 'Not Installed' };
      return { available: true };
    }
    if (!health.installed || health.status === 'not_installed') {
      return { available: false, label: 'Not Installed' };
    }
    if (health.status === 'error') {
      return { available: false, label: 'Misconfigured' };
    }
    return { available: true };
  };

  // Lead Orchestrator Configuration
  const [orchestratorAgent, setOrchestratorAgent] = useState<AgentId>('antigravity');
  const [orchestratorModels, setOrchestratorModels] = useState<Record<string, string>>({
    antigravity: 'gemini-4-argon',
    claude: 'claude-opus-5-5',
    codex: 'gpt-6.1-sol',
    opencode: 'claude-opus-5-5'
  });
  
  // Dynamic Worker Slots (multiple workers per agent supported!)
  const [workers, setWorkers] = useState<WorkerSlot[]>([
    { id: 'w-1', agentId: 'claude', model: 'claude-opus-5-5' },
    { id: 'w-2', agentId: 'codex', model: 'gpt-6.1-sol' },
    { id: 'w-3', agentId: 'antigravity', model: 'gemini-4-argon' }
  ]);

  // Observer Agent Configuration
  const [observerEnabled, setObserverEnabled] = useState<boolean>(true);
  const [observerAgent, setObserverAgent] = useState<AgentId>('antigravity');
  const [observerModels, setObserverModels] = useState<Record<string, string>>({
    antigravity: 'gemini-4-argon',
    claude: 'claude-opus-5-5',
    codex: 'gpt-6.1-sol',
    opencode: 'claude-opus-5-5'
  });

  if (!isOpen) return null;

  const handleAddWorker = () => {
    const candidateAgents: AgentId[] = ['claude', 'antigravity', 'codex'];
    const chosenAgent = candidateAgents.find(a => isAgentAvailable(a).available) || 'antigravity';
    const models = availableModels.filter(m => m.agentId === chosenAgent);
    const chosenModel = models[0]?.id || (chosenAgent === 'antigravity' ? 'gemini-4-argon' : chosenAgent === 'claude' ? 'claude-opus-5-5' : 'gpt-6.1-sol');

    setWorkers(prev => [
      ...prev,
      {
        id: `w-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        agentId: chosenAgent,
        model: chosenModel
      }
    ]);
  };

  const handleRemoveWorker = (slotId: string) => {
    if (workers.length <= 1) return;
    setWorkers(prev => prev.filter(w => w.id !== slotId));
  };

  const handleWorkerAgentChange = (slotId: string, newAgentId: AgentId) => {
    const models = availableModels.filter(m => m.agentId === newAgentId);
    const defaultModel = models[0]?.id || (newAgentId === 'antigravity' ? 'gemini-4-argon' : newAgentId === 'claude' ? 'claude-opus-5-5' : newAgentId === 'codex' ? 'gpt-6.1-sol' : 'gemini-4-argon');
    setWorkers(prev => prev.map(w => w.id === slotId ? { ...w, agentId: newAgentId, model: defaultModel } : w));
  };

  const handleWorkerModelChange = (slotId: string, newModel: string) => {
    setWorkers(prev => prev.map(w => w.id === slotId ? { ...w, model: newModel } : w));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repoPath.trim()) return;

    if (workers.length === 0) {
      alert('Please configure at least one worker agent');
      return;
    }

    const agents = workers.map((w, idx) => ({
      workerId: `worker-${idx + 1}-${w.agentId}`,
      agentId: w.agentId,
      model: w.model,
      mode: 'acp' as const
    }));

    onCreateSession({
      name: name.trim(),
      repoPath: repoPath.trim(),
      baseBranch: baseBranch.trim() || 'main',
      agents,
      orchestrator: {
        agentId: orchestratorAgent,
        model: orchestratorModels[orchestratorAgent] || 'gemini-4-argon'
      },
      observer: {
        agentId: observerAgent,
        model: observerModels[observerAgent] || 'gemini-4-argon',
        enabled: observerEnabled
      }
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">New Session</h2>
              <p className="text-[11px] text-zinc-400">Configure orchestrator lead, parallel worker agents & telemetry observer</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-zinc-300 mb-1">Session Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Auth Service Refactor"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-600 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-300 mb-1">Repository Path</label>
              <input
                type="text"
                value={repoPath}
                onChange={e => setRepoPath(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-300 font-mono text-[11px] focus:outline-none focus:border-zinc-600"
                required
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-300 mb-1">Base Git Branch</label>
              <input
                type="text"
                value={baseBranch}
                onChange={e => setBaseBranch(e.target.value)}
                placeholder="main"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-300 font-mono text-[11px] focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          {/* Lead Orchestrator Agent & Model Selection */}
          <div className="pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-medium text-zinc-300 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-sky-400" />
                Lead Orchestrator Agent
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">Conductor & Planner</span>
            </div>

            <div className="space-y-1.5">
              {(['antigravity', 'claude', 'codex', 'opencode'] as AgentId[]).map(agentId => {
                const isSelected = orchestratorAgent === agentId;
                const agentModels = availableModels.filter(m => m.agentId === agentId);
                const currentModel = orchestratorModels[agentId] || (agentId === 'antigravity' ? 'gemini-4-argon' : agentId === 'claude' ? 'claude-opus-5-5' : agentId === 'codex' ? 'gpt-6.1-sol' : 'gemini-4-argon');
                const avail = isAgentAvailable(agentId);

                return (
                  <div
                    key={`orch-${agentId}`}
                    onClick={() => avail.available && setOrchestratorAgent(agentId)}
                    className={`p-2 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                      !avail.available
                        ? 'bg-zinc-950/20 border-zinc-800/40 opacity-40 cursor-not-allowed'
                        : isSelected
                        ? 'bg-zinc-950 border-sky-500/60 shadow-sm cursor-pointer'
                        : 'bg-zinc-950/40 border-zinc-800/60 opacity-60 hover:opacity-90 cursor-pointer'
                    }`}
                  >
                    <label className={`flex items-center gap-2 ${avail.available ? 'cursor-pointer' : 'cursor-not-allowed'}`} onClick={e => e.stopPropagation()}>
                      <input
                        type="radio"
                        name="newSessionOrchestratorAgent"
                        disabled={!avail.available}
                        checked={isSelected}
                        onChange={() => setOrchestratorAgent(agentId)}
                        className="rounded-full border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-0 disabled:opacity-30"
                      />
                      <span className="font-medium text-zinc-200 capitalize">{agentId}</span>
                      {agentId === 'antigravity' && (
                        <span className="text-[10px] text-zinc-500 font-mono">(Argon default)</span>
                      )}
                      {!avail.available && (
                        <span className="text-[10px] text-rose-400 font-mono">({avail.label})</span>
                      )}
                    </label>

                    {isSelected && avail.available && (
                      <select
                        value={currentModel}
                        onChange={e => {
                          e.stopPropagation();
                          const val = e.target.value;
                          setOrchestratorModels(prev => ({ ...prev, [agentId]: val }));
                        }}
                        onClick={e => e.stopPropagation()}
                        className="bg-zinc-900 border border-sky-500/50 rounded px-2 py-1 text-[11px] font-mono text-sky-300 focus:outline-none"
                      >
                        {agentModels.length > 0 ? (
                          agentModels.map(m => (
                            <option key={m.id} value={m.id}>{m.id}</option>
                          ))
                        ) : (
                          <option value={currentModel}>{currentModel}</option>
                        )}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Worker Agents & Model Selection - Multiple Workers per Agent Supported */}
          <div className="pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block font-medium text-zinc-300">Worker Agents & Models</label>
                <span className="text-[10px] text-zinc-500">Parallel ACP execution workers (supports multiple workers per agent)</span>
              </div>
              <button
                type="button"
                onClick={handleAddWorker}
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-sky-400" />
                <span>Add Worker</span>
              </button>
            </div>

            <div className="space-y-2">
              {workers.map((w, idx) => {
                const agentModels = availableModels.filter(m => m.agentId === w.agentId);

                return (
                  <div
                    key={w.id}
                    className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-zinc-400 font-semibold w-16 flex-shrink-0">
                        Worker #{idx + 1}
                      </span>

                      {/* Agent selector dropdown */}
                      <select
                        value={w.agentId}
                        onChange={e => handleWorkerAgentChange(w.id, e.target.value as AgentId)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] font-medium text-zinc-200 focus:outline-none focus:border-zinc-500"
                      >
                        {(['antigravity', 'claude', 'codex', 'opencode'] as AgentId[]).map(aId => {
                          const avail = isAgentAvailable(aId);
                          return (
                            <option key={aId} value={aId} disabled={!avail.available}>
                              {aId.charAt(0).toUpperCase() + aId.slice(1)} {!avail.available ? `(${avail.label})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Model selector dropdown */}
                    <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                      <select
                        value={w.model}
                        onChange={e => handleWorkerModelChange(w.id, e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-zinc-500 max-w-[210px] truncate"
                      >
                        {agentModels.length > 0 ? (
                          agentModels.map(m => (
                            <option key={m.id} value={m.id}>{m.id}</option>
                          ))
                        ) : (
                          <option value={w.model}>{w.model}</option>
                        )}
                      </select>

                      {/* Remove Worker Button */}
                      {workers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveWorker(w.id)}
                          title="Remove Worker"
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observer Agent & Model Selection */}
          <div className="pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-medium text-zinc-300 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                Observer Agent (5th Telemetry Auditor)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={observerEnabled}
                  onChange={e => setObserverEnabled(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
                />
                <span>Active</span>
              </label>
            </div>

            <div className="space-y-1.5">
              {(['antigravity', 'claude', 'codex', 'opencode'] as AgentId[]).map(agentId => {
                const isSelected = observerAgent === agentId;
                const agentModels = availableModels.filter(m => m.agentId === agentId);
                const currentModel = observerModels[agentId] || (agentId === 'antigravity' ? 'gemini-4-argon' : agentId === 'claude' ? 'claude-opus-5-5' : agentId === 'codex' ? 'gpt-6.1-sol' : 'gemini-4-argon');
                const avail = isAgentAvailable(agentId);

                return (
                  <div
                    key={`obs-${agentId}`}
                    onClick={() => observerEnabled && avail.available && setObserverAgent(agentId)}
                    className={`p-2 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                      !observerEnabled || !avail.available
                        ? 'bg-zinc-950/20 border-zinc-800/40 opacity-40 cursor-not-allowed'
                        : isSelected
                        ? 'bg-zinc-950 border-emerald-500/60 shadow-sm cursor-pointer'
                        : 'bg-zinc-950/40 border-zinc-800/60 opacity-60 hover:opacity-90 cursor-pointer'
                    }`}
                  >
                    <label className={`flex items-center gap-2 ${observerEnabled && avail.available ? 'cursor-pointer' : 'cursor-not-allowed'}`} onClick={e => e.stopPropagation()}>
                      <input
                        type="radio"
                        name="newSessionObserverAgent"
                        disabled={!observerEnabled || !avail.available}
                        checked={isSelected}
                        onChange={() => setObserverAgent(agentId)}
                        className="rounded-full border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0 disabled:opacity-30"
                      />
                      <span className="font-medium text-zinc-200 capitalize">{agentId}</span>
                      {agentId === 'antigravity' && (
                        <span className="text-[10px] text-zinc-500 font-mono">(Argon default)</span>
                      )}
                      {!avail.available && (
                        <span className="text-[10px] text-rose-400 font-mono">({avail.label})</span>
                      )}
                    </label>

                    {isSelected && observerEnabled && avail.available && (
                      <select
                        value={currentModel}
                        onChange={e => {
                          e.stopPropagation();
                          const val = e.target.value;
                          setObserverModels(prev => ({ ...prev, [agentId]: val }));
                        }}
                        onClick={e => e.stopPropagation()}
                        className="bg-zinc-900 border border-emerald-500/50 rounded px-2 py-1 text-[11px] font-mono text-emerald-300 focus:outline-none"
                      >
                        {agentModels.length > 0 ? (
                          agentModels.map(m => (
                            <option key={m.id} value={m.id}>{m.id}</option>
                          ))
                        ) : (
                          <option value={currentModel}>{currentModel}</option>
                        )}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex justify-end gap-2 border-t border-zinc-800 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-medium transition-colors"
            >
              Create Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
