import React, { useState, useEffect, useRef } from 'react';
import { Server, Cpu, FolderGit2, CheckCircle2, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { AgentHealthStatus } from '../../shared/types.ts';
import { Logo } from './Logo.tsx';

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
  agentHealth: Record<string, AgentHealthStatus>;
  sessionsLoaded: boolean;
  sessionsCount: number;
}

export const StartupProgressModal: React.FC<StartupProgressModalProps> = ({
  isOpen,
  onDismiss,
  agentHealth,
  sessionsLoaded,
  sessionsCount
}) => {
  const [serverOk, setServerOk] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  // Probe server readiness
  // Polls only while the dialog is open and the server has not answered yet.
  useEffect(() => {
    if (!isOpen || serverOk) return;
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
  }, [isOpen, serverOk]);

  const activeAgentsCount = Object.values(agentHealth).filter(a => a.installed).length;
  const totalAgentsCount = Object.keys(agentHealth).length;

  const stages: StartupStage[] = [
    {
      id: 'server',
      label: 'Smith server',
      description: serverOk ? `Active on port ${window.location.port || '4100'}` : 'Connecting to local backend service...',
      icon: <Server className="w-4 h-4" />,
      status: serverOk ? 'success' : 'running',
      detail: serverOk ? 'HTTP/WS ready' : 'Waiting for /api/v1/health'
    },
    {
      id: 'agents',
      label: 'Agent CLIs',
      description: totalAgentsCount > 0
        ? `${activeAgentsCount} of ${totalAgentsCount} agent CLIs found`
        : 'Looking for Claude Code, Codex and OpenCode…',
      icon: <Cpu className="w-4 h-4" />,
      status: totalAgentsCount > 0 ? 'success' : 'running',
      detail: totalAgentsCount > 0 ? `${activeAgentsCount} ready` : 'Probing...'
    },
    {
      id: 'sessions',
      label: 'Sessions',
      description: sessionsLoaded ? `${sessionsCount} session(s) loaded from disk` : 'Reading ~/.smith…',
      icon: <FolderGit2 className="w-4 h-4" />,
      status: sessionsLoaded ? 'success' : 'running',
      detail: sessionsLoaded ? 'Loaded' : 'Reading...'
    }
  ];

  // Auto-dismiss once server & sessions are ready. The parent passes a new onDismiss on every
  // render, so it is read through a ref: depending on it would restart the timer on each
  // live update and keep the dialog open for as long as updates keep arriving.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    if (serverOk && sessionsLoaded && !isDismissing) {
      const timer = setTimeout(() => {
        setIsDismissing(true);
        setTimeout(() => onDismissRef.current(), 400);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [serverOk, sessionsLoaded, isDismissing]);

  if (!isOpen) return null;

  const completedCount = stages.filter(s => s.status === 'success').length;
  const progressPct = Math.round((completedCount / stages.length) * 100);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-ink-25 p-4 transition-opacity duration-300 ${isDismissing ? 'opacity-0' : 'opacity-100'}`}>
      <div className="bg-ink-0 rounded-2xl w-full max-w-md shadow-float overflow-hidden p-6 text-ink-900">
        {/* Header */}
        <div className="flex items-center justify-between pb-5">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Starting Smith</h2>
              <p className="text-xs text-ink-600">Connecting to the local server</p>
            </div>
          </div>
          <span className="text-xs font-mono text-ink-500">{progressPct}%</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-ink-50 rounded-full h-1.5 mb-6 overflow-hidden">
          <div
            className="bg-lav-300 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.max(10, progressPct)}%` }}
          />
        </div>

        {/* Stages Checklist */}
        <div className="space-y-2 mb-6">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`flex items-start justify-between p-3 rounded-xl transition-colors ${
                stage.status === 'warning' ? 'bg-butter-50' : 'bg-ink-50'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className={`p-1.5 rounded-lg mt-0.5 ${
                  stage.status === 'success'
                    ? 'text-mint-600 bg-mint-100'
                    : stage.status === 'warning'
                    ? 'text-butter-600 bg-butter-100'
                    : 'text-lav-600 bg-lav-100'
                }`}>
                  {stage.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink-800">{stage.label}</div>
                  <div className="text-[11px] text-ink-600 truncate">{stage.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {stage.status === 'success' && (
                  <CheckCircle2 className="w-4 h-4 text-mint-600" />
                )}
                {stage.status === 'running' && (
                  <Loader2 className="w-4 h-4 text-lav-600 animate-spin" />
                )}
                {stage.status === 'warning' && (
                  <AlertCircle className="w-4 h-4 text-butter-600" />
                )}
                {stage.status === 'pending' && (
                  <span className="w-2 h-2 rounded-full bg-ink-200" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-ink-500 italic">
            {serverOk ? 'Ready to work' : 'Waiting for services...'}
          </p>
          <button
            onClick={onDismiss}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-100 hover:bg-ink-200 text-xs font-medium text-ink-700 hover:text-ink-900 transition-colors"
          >
            <span>Skip to App</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
