import React, { useState } from 'react';
import { X, Sliders, Check, Wrench, Layers } from 'lucide-react';
import { SessionCustomizations, Skill, CustomMCPServer, Plugin, DiscoveredModel } from '../../shared/types.ts';

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
      mcpServers: selectedMCPs
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
                <p className="text-[11px] text-zinc-400">Team conventions and extra tools; they apply from each worker's next turn</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
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
                <span className="text-[11px] text-zinc-500">Claude Code and OpenCode workers</span>
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
