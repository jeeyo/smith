import React, { useState, useEffect } from 'react';
import { Server, Brain, Cpu, FolderGit2, CheckCircle2, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { AgentHealthStatus } from '../../shared/types.ts';

interface StartupStage {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'success' | 'warning';
  detail?: string;
}

interface StartupProgressModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  hindsightConnected: boolean;
  agentHealth: Record<string, AgentHealthStatus>;
  sessionsLoaded: boolean;
  sessionsCount: number;
}

export const StartupProgressModal: React.FC<StartupProgressModalProps> = ({
  isOpen,
  onDismiss,
  hindsightConnected,
  agentHealth,
  sessionsLoaded,
  sessionsCount
}) => {
  const [serverOk, setServerOk] = useState(false);
  const [hindsightStatus, setHindsightStatus] = useState<'pending' | 'running' | 'success' | 'warning'>('pending');
  const [isDismissing, setIsDismissing] = useState(false);

  // Probe server readiness
  useEffect(() => {
    let active = true;
    const probe = async () => {
      try {
        const res = await fetch('/api/v1/health');
        if (res.ok && active) {
          setServerOk(true);
        }
      } catch {
        if (active) setServerOk(false);
      }
    };
    probe();
    const interval = setInterval(probe, 800);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Update Hindsight status
  useEffect(() => {
    if (!serverOk) {
      setHindsightStatus('pending');
    } else if (hindsightConnected) {
      setHindsightStatus('success');
    } else {
      setHindsightStatus('running');
      // If after 4s server is ok but hindsight isn't yet connected, mark as warning/background
      const t = setTimeout(() => {
        if (!hindsightConnected) {
          setHindsightStatus('warning');
        }
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [serverOk, hindsightConnected]);

  const activeAgentsCount = Object.values(agentHealth).filter(a => a.installed).length;
  const totalAgentsCount = Object.keys(agentHealth).length;

  const stages: StartupStage[] = [
    {
      id: 'server',
      label: 'Smith Orchestrator Core',
      description: serverOk ? 'Active on port 4100' : 'Connecting to local backend service...',
      icon: <Server className="w-4 h-4" />,
      status: serverOk ? 'success' : 'running',
      detail: serverOk ? 'HTTP/WS ready' : 'Waiting for /api/v1/health'
    },
    {
      id: 'hindsight',
      label: 'Hindsight Memory Daemon',
      description: hindsightConnected
        ? 'Vectorized memory engine online'
        : hindsightStatus === 'warning'
        ? 'Warming up in background (Python uvx daemon)'
        : 'Starting Hindsight daemon...',
      icon: <Brain className="w-4 h-4" />,
      status: hindsightStatus,
      detail: hindsightConnected ? 'Connected' : hindsightStatus === 'warning' ? 'Background daemon' : 'Starting...'
    },
    {
      id: 'agents',
      label: 'Agent Runtimes',
      description: totalAgentsCount > 0
        ? `${activeAgentsCount} of ${totalAgentsCount} CLI runtimes detected`
        : 'Scanning Claude, Codex, Antigravity...',
      icon: <Cpu className="w-4 h-4" />,
      status: totalAgentsCount > 0 ? 'success' : 'running',
      detail: totalAgentsCount > 0 ? `${activeAgentsCount} ready` : 'Probing...'
    },
    {
      id: 'sessions',
      label: 'Workspace & Chat Store',
      description: sessionsLoaded ? `${sessionsCount} session(s) loaded from disk` : 'Reading ~/.smith/chats...',
      icon: <FolderGit2 className="w-4 h-4" />,
      status: sessionsLoaded ? 'success' : 'running',
      detail: sessionsLoaded ? 'Loaded' : 'Reading...'
    }
  ];

  // Auto-dismiss once server & sessions are ready
  useEffect(() => {
    if (serverOk && sessionsLoaded && !isDismissing) {
      const timer = setTimeout(() => {
        setIsDismissing(true);
        setTimeout(onDismiss, 400);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [serverOk, sessionsLoaded, isDismissing, onDismiss]);

  if (!isOpen) return null;

  const completedCount = stages.filter(s => s.status === 'success').length;
  const progressPct = Math.round((completedCount / stages.length) * 100);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-opacity duration-300 ${isDismissing ? 'opacity-0' : 'opacity-100'}`}>
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shadow-inner">
              S
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Starting Smith ADE</h2>
              <p className="text-xs text-zinc-400">Initializing desktop environment & services</p>
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-500">{progressPct}%</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-zinc-900 rounded-full h-1.5 mb-6 overflow-hidden border border-zinc-800/50">
          <div
            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 transition-all duration-300"
            style={{ width: `${Math.max(10, progressPct)}%` }}
          />
        </div>

        {/* Stages Checklist */}
        <div className="space-y-3.5 mb-6">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`flex items-start justify-between p-3 rounded-xl border transition-colors ${
                stage.status === 'success'
                  ? 'bg-zinc-900/40 border-zinc-800/60'
                  : stage.status === 'warning'
                  ? 'bg-amber-950/10 border-amber-800/30'
                  : 'bg-zinc-900/20 border-zinc-800/40'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className={`p-1.5 rounded-lg mt-0.5 ${
                  stage.status === 'success'
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : stage.status === 'warning'
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'text-indigo-400 bg-indigo-500/10'
                }`}>
                  {stage.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-200">{stage.label}</div>
                  <div className="text-[11px] text-zinc-400 truncate">{stage.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {stage.status === 'success' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                {stage.status === 'running' && (
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                )}
                {stage.status === 'warning' && (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
                {stage.status === 'pending' && (
                  <span className="w-2 h-2 rounded-full bg-zinc-700" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-zinc-500 italic">
            {serverOk ? 'Ready to work' : 'Waiting for services...'}
          </p>
          <button
            onClick={onDismiss}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <span>Skip to App</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
