import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Send, CheckCircle2, XCircle, AlertCircle, Sparkles, DollarSign, Layers } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { AgentId, AgentStatus, DiscoveredModel, ACPPermissionRequest } from '../../shared/types.ts';
import { ModelSelector } from './ModelSelector.tsx';

interface AgentPaneProps {
  sessionId: string;
  agentId: AgentId;
  currentModel: string;
  status: AgentStatus;
  availableModels: DiscoveredModel[];
  onHotReloadModel: (newModel: string) => void;
  onSendPrompt: (prompt: string) => void;
  onRespondPermission: (permissionId: string, allowed: boolean) => void;
  messages: Array<{ sender: string; content: string; timestamp: number }>;
  pendingPermission?: ACPPermissionRequest;
  agentCostUsd?: number;
  agentCostFormatted?: string;
}

export const AgentPane: React.FC<AgentPaneProps> = ({
  sessionId,
  agentId,
  currentModel,
  status,
  availableModels,
  onHotReloadModel,
  onSendPrompt,
  onRespondPermission,
  messages,
  pendingPermission,
  agentCostFormatted
}) => {
  const [viewMode, setViewMode] = useState<'acp' | 'terminal'>('acp');
  const [inputPrompt, setInputPrompt] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);

  // Initialize Xterm when switching to terminal view
  useEffect(() => {
    if (viewMode === 'terminal' && terminalRef.current && !xtermInstance.current) {
      const term = new Terminal({
        theme: {
          background: '#090d16',
          foreground: '#e2e8f0',
          cursor: '#38bdf8'
        },
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        cursorBlink: true
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(terminalRef.current);
      fit.fit();

      term.writeln(`\x1b[1;36m=== Smith ADE Terminal: ${agentId} (${currentModel}) ===\x1b[0m`);
      term.writeln(`\x1b[90mSession: ${sessionId}\x1b[0m\r\n`);

      xtermInstance.current = term;
      fitAddon.current = fit;
    }
  }, [viewMode, agentId, currentModel, sessionId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim()) return;
    onSendPrompt(inputPrompt.trim());
    setInputPrompt('');
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'thinking':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-950/60 border border-sky-800/80 px-2 py-0.5 rounded-full animate-pulse">
            <Sparkles className="w-3 h-3 text-sky-400 animate-spin" /> Thinking...
          </span>
        );
      case 'running_tool':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" /> Running Tool
          </span>
        );
      case 'waiting_permission':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-950/60 border border-rose-800/80 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3 text-rose-400" /> Awaiting Approval
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700/80 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Idle
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Pane Header */}
      <div className="h-12 border-b border-slate-800 px-3.5 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs uppercase text-sky-400">
            {agentId.substring(0, 2)}
          </div>
          <span className="font-semibold text-sm text-slate-200 capitalize">{agentId}</span>
          {getStatusBadge()}
        </div>

        <div className="flex items-center gap-2">
          {/* Dynamic Model Dropdown (Hot-Reload) */}
          <ModelSelector
            currentModel={currentModel}
            agentId={agentId}
            availableModels={availableModels}
            onSelectModel={onHotReloadModel}
          />

          {/* Real-time Agent USD Cost Pill */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] font-mono text-emerald-400 font-semibold" title="Accumulated Agent Resource Cost">
            <DollarSign className="w-3 h-3 text-emerald-400" />
            <span>{agentCostFormatted || '$0.00'}</span>
          </div>

          {/* View Mode Toggle: ACP vs Terminal */}
          <div className="flex rounded-lg bg-slate-800/80 p-0.5 border border-slate-700 text-[11px]">
            <button
              onClick={() => setViewMode('acp')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                viewMode === 'acp' ? 'bg-sky-500 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ACP
            </button>
            <button
              onClick={() => setViewMode('terminal')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                viewMode === 'terminal' ? 'bg-sky-500 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Term
            </button>
          </div>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
        {viewMode === 'terminal' ? (
          <div ref={terminalRef} className="w-full h-full" />
        ) : (
          <>
            {/* Stream Messages */}
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-center">
                <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
                <p>Agent {agentId} is ready in worktree.</p>
                <p className="text-[11px] text-slate-600">Send an instruction or prompt below.</p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-slate-300 leading-relaxed whitespace-pre-wrap">
                  <div className="text-[10px] text-sky-400 font-semibold mb-1 flex items-center justify-between">
                    <span>{m.sender.toUpperCase()}</span>
                    <span className="text-slate-500 font-normal">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div>{m.content}</div>
                </div>
              ))
            )}

            {/* Interactive Permission Request Card */}
            {pendingPermission && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-slate-200 shadow-xl space-y-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wide">
                  <AlertCircle className="w-4 h-4" />
                  <span>Permission Request</span>
                </div>
                <p className="text-xs text-slate-300">{pendingPermission.description}</p>
                <pre className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-amber-300 overflow-x-auto">
                  {JSON.stringify(pendingPermission.parameters, null, 2)}
                </pre>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onRespondPermission(pendingPermission.id, true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => onRespondPermission(pendingPermission.id, false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-md transition-all"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Deny
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Prompt Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-950/50 flex items-center gap-2">
        <input
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder={`Instruct ${agentId} (${currentModel})...`}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors font-sans"
        />
        <button
          type="submit"
          disabled={!inputPrompt.trim() || status === 'thinking'}
          className="p-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white shadow-md shadow-sky-500/20 transition-all"
          title="Send instruction to agent"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
