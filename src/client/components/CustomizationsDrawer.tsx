import React, { useState } from 'react';
import { X, Sliders, Check, Wrench, Layers, Shield, Bot } from 'lucide-react';
import { SessionCustomizations, Skill, CustomMCPServer, Plugin, ObserverConfig, OrchestratorConfig, AgentId, DiscoveredModel } from '../../shared/types.ts';

interface CustomizationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customizations: SessionCustomizations;
  allSkills: Skill[];
  allMCPs: CustomMCPServer[];
  allPlugins: Plugin[];
  availableModels?: DiscoveredModel[];
  agentHealth?: Record<string, any>;
  onApplyChanges: (updated: Partial<SessionCustomizations>) => void;
}

export const CustomizationsDrawer: React.FC<CustomizationsDrawerProps> = ({
  isOpen,
  onClose,
  customizations,
  allSkills,
  allMCPs,
  allPlugins,
  availableModels = [],
  agentHealth,
  onApplyChanges
}) => {
  const [selectedSkills, setSelectedSkills] = useState<string[]>(customizations.skills || []);
  const [selectedMCPs, setSelectedMCPs] = useState<Record<string, CustomMCPServer>>(customizations.mcpServers || {});
  
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
  const [orchestratorAgent, setOrchestratorAgent] = useState<AgentId>((customizations.orchestrator?.agentId as AgentId) || 'antigravity');
  const [orchestratorModels, setOrchestratorModels] = useState<Record<string, string>>({
    antigravity: customizations.orchestrator?.agentId === 'antigravity' ? customizations.orchestrator?.model : 'gemini-4-argon',
    claude: customizations.orchestrator?.agentId === 'claude' ? customizations.orchestrator?.model : 'claude-opus-5-5',
    codex: customizations.orchestrator?.agentId === 'codex' ? customizations.orchestrator?.model : 'gpt-6.1-sol',
    opencode: customizations.orchestrator?.agentId === 'opencode' ? customizations.orchestrator?.model : 'gemini-4-argon'
  });

  // Observer Agent Configuration
  const [observerAgent, setObserverAgent] = useState<AgentId>((customizations.observer?.agentId as AgentId) || 'antigravity');
  const [observerModels, setObserverModels] = useState<Record<string, string>>({
    antigravity: customizations.observer?.agentId === 'antigravity' ? customizations.observer?.model : 'gemini-4-argon',
    claude: customizations.observer?.agentId === 'claude' ? customizations.observer?.model : 'claude-opus-5-5',
    codex: customizations.observer?.agentId === 'codex' ? customizations.observer?.model : 'gpt-6.1-sol',
    opencode: customizations.observer?.agentId === 'opencode' ? customizations.observer?.model : 'gemini-4-argon'
  });
  const [observerEnabled, setObserverEnabled] = useState<boolean>(customizations.observer?.enabled ?? true);

  if (!isOpen) return null;

  const toggleSkill = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skillId));
    } else {
      setSelectedSkills([...selectedSkills, skillId]);
    }
  };

  const toggleMCP = (mcp: CustomMCPServer) => {
    const existing = selectedMCPs[mcp.id];
    setSelectedMCPs({
      ...selectedMCPs,
      [mcp.id]: {
        ...mcp,
        enabled: !existing?.enabled
      }
    });
  };

  const handleApply = () => {
    onApplyChanges({
      skills: selectedSkills,
      mcpServers: selectedMCPs,
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
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md bg-zinc-900 border-l border-zinc-800 shadow-xl flex flex-col text-zinc-100">
          {/* Header */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-zinc-300" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Customizations</h2>
                <p className="text-[11px] text-zinc-400">Hot-update orchestrator lead, skills, MCPs & observer</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
            {/* Lead Orchestrator Agent Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-zinc-300 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-sky-400" /> Lead Orchestrator Agent
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">Conductor & Planner</span>
              </div>

              <div className="space-y-1.5">
                {(['antigravity', 'claude', 'codex', 'opencode'] as AgentId[]).map(agentId => {
                  const isSelected = orchestratorAgent === agentId;
                  const agentModels = availableModels.filter(m => m.agentId === agentId);
                  const currentModel = orchestratorModels[agentId] || (agentId === 'antigravity' ? 'gemini-4-argon' : agentId === 'claude' ? 'claude-opus-5-5' : agentId === 'codex' ? 'gpt-6.1-sol' : 'gemini-4-argon');
                  const avail = isAgentAvailable(agentId);

                  return (
                    <div
                      key={`drawer-orch-${agentId}`}
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
                          name="drawerOrchestratorAgent"
                          disabled={!avail.available}
                          checked={isSelected}
                          onChange={() => setOrchestratorAgent(agentId)}
                          className="rounded-full border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-0 disabled:opacity-30"
                        />
                        <span className="font-medium text-zinc-200 capitalize">{agentId}</span>
                        {agentId === 'antigravity' && (
                          <span className="text-[10px] text-zinc-500 font-mono">(Default Lead)</span>
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

            {/* Skills Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-zinc-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-zinc-400" /> Skills
                </span>
                <span className="text-[11px] text-zinc-500">{selectedSkills.length} selected</span>
              </div>
              <div className="space-y-1.5">
                {allSkills.map(s => {
                  const isChecked = selectedSkills.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleSkill(s.id)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                        isChecked ? 'bg-zinc-950 border-zinc-700' : 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-zinc-200">{s.name}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">{s.description}</div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isChecked ? 'bg-zinc-100 border-zinc-100 text-zinc-900' : 'border-zinc-700 bg-zinc-800'
                      }`}>
                        {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom MCP Servers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-zinc-300 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-zinc-400" /> MCP Servers
                </span>
                <span className="text-[11px] text-zinc-500">Auto Hot-Reloaded</span>
              </div>
              <div className="space-y-1.5">
                {allMCPs.map(mcp => {
                  const isEnabled = selectedMCPs[mcp.id]?.enabled ?? mcp.enabled;
                  return (
                    <div
                      key={mcp.id}
                      onClick={() => toggleMCP(mcp)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                        isEnabled ? 'bg-zinc-950 border-zinc-700' : 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-zinc-200">{mcp.name}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">{mcp.description}</div>
                        <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{mcp.command} {mcp.args.join(' ')}</div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isEnabled ? 'bg-zinc-100 border-zinc-100 text-zinc-900' : 'border-zinc-700 bg-zinc-800'
                      }`}>
                        {isEnabled && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Observer Agent Harness */}
            <div className="pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-zinc-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" /> Observer Agent Harness
                </span>
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
                      key={`obs-drawer-${agentId}`}
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
                          name="drawerObserverAgent"
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
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium text-xs transition-colors"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
