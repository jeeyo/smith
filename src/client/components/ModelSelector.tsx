import React, { useState } from 'react';
import { Cpu, ChevronDown, Check, Zap, Sparkles } from 'lucide-react';
import { DiscoveredModel } from '../../shared/types.ts';

interface ModelSelectorProps {
  currentModel: string;
  agentId: string;
  availableModels: DiscoveredModel[];
  onSelectModel: (newModel: string) => void;
  onRefreshModels?: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  agentId,
  availableModels,
  onSelectModel
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Filter models strictly for this agent (no leaking across agents)
  const agentModels = availableModels.filter(m => m.agentId === agentId);

  const selectedModelObj = availableModels.find(m => m.id === currentModel);

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700/80 hover:border-sky-500/50 transition-all shadow-sm"
        title="Click to hot-reload model mid-session"
      >
        <Zap className="w-3 h-3 text-amber-400 animate-pulse" />
        <span className="font-mono">{selectedModelObj?.name || currentModel}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl z-50 py-1.5 backdrop-blur-md">
            <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-semibold tracking-wider uppercase">
              <span>Switch Model (Hot-Reload)</span>
              <Sparkles className="w-3 h-3 text-sky-400" />
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {agentModels.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">No discovered models</div>
              ) : (
                agentModels.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800/80 transition-colors ${
                      m.id === currentModel ? 'text-sky-300 bg-sky-950/40 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">{m.name}</span>
                      {m.capabilities && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          {m.capabilities.reasoning && <span className="text-amber-400/90">Reasoning</span>}
                          {m.capabilities.speed && <span>• {m.capabilities.speed}</span>}
                          {m.provider && <span>• {m.provider}</span>}
                        </div>
                      )}
                    </div>
                    {m.id === currentModel && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
