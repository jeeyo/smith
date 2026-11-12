import React, { useState } from 'react';
import { Database, Sparkles, AlertTriangle, BookOpen, Clock, ShieldCheck, Plus } from 'lucide-react';
import { HindsightFact, HindsightExperience, HindsightAntiPattern } from '../../shared/types.ts';

interface MemoryExplorerProps {
  bankId: string;
  connected: boolean;
  facts: HindsightFact[];
  experiences: HindsightExperience[];
  antiPatterns: HindsightAntiPattern[];
  lastReflectedState?: string;
  onRetainFact: (text: string) => void;
  onReflectGoal: () => void;
  isReflecting?: boolean;
}

export const MemoryExplorer: React.FC<MemoryExplorerProps> = ({
  bankId,
  connected,
  facts,
  experiences,
  antiPatterns,
  lastReflectedState,
  onRetainFact,
  onReflectGoal,
  isReflecting
}) => {
  const [activeTab, setActiveTab] = useState<'facts' | 'anti_patterns' | 'experiences' | 'reflection'>('facts');
  const [newFactText, setNewFactText] = useState('');

  const handleAddFact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFactText.trim()) return;
    onRetainFact(newFactText.trim());
    setNewFactText('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Vectorize Hindsight Memory Bank</span>
            <span className="font-mono text-[10px] text-slate-400">({bankId})</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Authoritative shared memory across Claude, Codex, Gemini, and OpenCode.</p>
        </div>

        <button
          onClick={onReflectGoal}
          disabled={isReflecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isReflecting ? 'Reflecting...' : 'Reflect Beliefs'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 pt-3 border-b border-slate-800/80 text-xs">
        <button
          onClick={() => setActiveTab('facts')}
          className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
            activeTab === 'facts' ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          World Facts ({facts.length})
        </button>
        <button
          onClick={() => setActiveTab('anti_patterns')}
          className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
            activeTab === 'anti_patterns' ? 'border-rose-400 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Anti-Patterns ({antiPatterns.length})
        </button>
        <button
          onClick={() => setActiveTab('experiences')}
          className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
            activeTab === 'experiences' ? 'border-indigo-400 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Experiences ({experiences.length})
        </button>
        <button
          onClick={() => setActiveTab('reflection')}
          className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
            activeTab === 'reflection' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Synthesized Playbook State
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto py-4">
        {activeTab === 'facts' && (
          <div className="space-y-3">
            <form onSubmit={handleAddFact} className="flex gap-2 mb-4">
              <input
                type="text"
                value={newFactText}
                onChange={e => setNewFactText(e.target.value)}
                placeholder="Retain new architectural decision or invariant into Hindsight..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs shadow-md"
              >
                Retain
              </button>
            </form>

            {facts.length === 0 ? (
              <div className="text-slate-500 text-xs py-8 text-center">No facts recorded yet in this bank.</div>
            ) : (
              facts.map(f => (
                <div key={f.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span className="uppercase text-sky-400 font-semibold">{f.category || 'Fact'}</span>
                    <span>{new Date(f.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div>{f.text}</div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'anti_patterns' && (
          <div className="space-y-3">
            {antiPatterns.length === 0 ? (
              <div className="text-slate-500 text-xs py-8 text-center">No anti-patterns reported. Teammates are operating cleanly!</div>
            ) : (
              antiPatterns.map(ap => (
                <div key={ap.id} className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/60 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-rose-400 font-bold uppercase">
                    <span>Anti-Pattern Warning (@{ap.agentId})</span>
                    <span>{new Date(ap.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-200"><strong>Error:</strong> {ap.error}</div>
                  <div className="text-slate-400 text-[11px]"><strong>Context:</strong> {ap.context}</div>
                  <div className="text-emerald-400 text-[11px] font-medium pt-1 border-t border-rose-900/40">
                    <strong>Resolution:</strong> {ap.solution}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'experiences' && (
          <div className="space-y-3">
            {experiences.length === 0 ? (
              <div className="text-slate-500 text-xs py-8 text-center">No agent experiences logged yet.</div>
            ) : (
              experiences.map(exp => (
                <div key={exp.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-semibold text-slate-300 capitalize">@{exp.agentId}</span>
                    <span className={exp.outcome === 'success' ? 'text-emerald-400' : 'text-rose-400'}>{exp.outcome.toUpperCase()}</span>
                  </div>
                  <div className="text-slate-200">{exp.action}</div>
                  {exp.diffSummary && <div className="text-[11px] font-mono text-slate-400">{exp.diffSummary}</div>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'reflection' && (
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs leading-relaxed text-slate-300 font-mono whitespace-pre-wrap">
            {lastReflectedState || 'Click "Reflect Beliefs" above to synthesize the current project state from Hindsight.'}
          </div>
        )}
      </div>
    </div>
  );
};
