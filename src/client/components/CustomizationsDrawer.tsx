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
      <div className="absolute inset-0 bg-ink-900/15 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md bg-ink-50 border-l border-ink-100 shadow-float flex flex-col text-ink-900">
          {/* Header */}
          <div className="p-4 border-b border-ink-100 flex items-center justify-between bg-ink-0 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-ink-700" />
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Customizations</h2>
                <p className="text-[11px] text-ink-600">Team conventions and extra tools; they apply from each worker's next turn</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded text-ink-600 hover:text-ink-800">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
            {/* Skills Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-ink-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-ink-600" /> Skills
                </span>
                <span className="text-[11px] text-ink-500">{selectedSkills.length} selected</span>
              </div>
              <div className="space-y-1.5">
                {allSkills.map(s => {
                  const isChecked = selectedSkills.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleSkill(s.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                        isChecked ? 'bg-ink-0 border-ink-300' : 'bg-ink-25 border-ink-100 hover:border-ink-300'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-ink-800">{s.name}</div>
                        <div className="text-[11px] text-ink-600 mt-0.5">{s.description}</div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isChecked ? 'bg-lav-200 border-lav-300 text-lav-700' : 'border-ink-300 bg-ink-100'
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
                <span className="font-semibold text-xs text-ink-700 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-ink-600" /> MCP Servers
                </span>
                <span className="text-[11px] text-ink-500">Claude Code and OpenCode workers</span>
              </div>
              <div className="space-y-1.5">
                {allMCPs.map(mcp => {
                  const isEnabled = selectedMCPs[mcp.id]?.enabled ?? mcp.enabled;
                  return (
                    <div
                      key={mcp.id}
                      onClick={() => toggleMCP(mcp)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                        isEnabled ? 'bg-ink-0 border-ink-300' : 'bg-ink-25 border-ink-100 hover:border-ink-300'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-ink-800">{mcp.name}</div>
                        <div className="text-[11px] text-ink-600 mt-0.5">{mcp.description}</div>
                        <div className="font-mono text-[10px] text-ink-500 mt-0.5">{mcp.command} {mcp.args.join(' ')}</div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isEnabled ? 'bg-lav-200 border-lav-300 text-lav-700' : 'border-ink-300 bg-ink-100'
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
          <div className="p-4 border-t border-ink-100 bg-ink-0 flex items-center justify-end gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-ink-100 hover:bg-ink-100 text-ink-600 hover:text-ink-800 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-3.5 py-1.5 rounded-xl bg-lav-200 hover:bg-lav-300 text-lav-700 font-medium text-xs transition-colors"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
