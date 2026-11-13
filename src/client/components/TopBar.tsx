import React from 'react';
import { Terminal, RefreshCw, Sliders, GitBranch } from 'lucide-react';
import { CostWidget } from './CostWidget.tsx';
import { Logo } from './Logo.tsx';
import { Session, SessionCostSummary, DiscoveredModel, AgentHealthStatus } from '../../shared/types.ts';

interface TopBarProps {
  currentSession?: Session;
  costSummary?: SessionCostSummary;
  onOpenNewSession: () => void;
  onOpenCustomizations: () => void;
  onRefreshModels: () => void;
  isRefreshingModels?: boolean;
  availableModels?: DiscoveredModel[];
  agentHealth?: Record<string, AgentHealthStatus>;
  onOpenTerminal?: (cmd?: string) => void;
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  onOpenSettings?: () => void;
  /** Opens the sidebar drawer on phones. */
  onOpenNav?: () => void;
  onAskSmith?: () => void;
}

const HARNESSES: Array<{ id: string; label: string; login: string }> = [
  { id: 'claude', label: 'Claude', login: 'claude login' },
  { id: 'codex', label: 'Codex', login: 'codex login' },
  { id: 'opencode', label: 'OpenCode', login: 'opencode auth login' }
];

const iconButton = 'p-2 rounded-lg text-ink-400 hover:text-ink-800 hover:bg-ink-100 transition-colors';

export const TopBar: React.FC<TopBarProps> = ({
  currentSession,
  costSummary,
  onOpenCustomizations,
  onRefreshModels,
  isRefreshingModels,
  agentHealth = {},
  onOpenTerminal,
  onOpenNav,
  onAskSmith
}) => (
  <header className="h-14 px-3 md:px-5 pt-[env(safe-area-inset-top)] box-content flex items-center justify-between gap-2 md:gap-4 select-none flex-shrink-0 border-b border-ink-100 bg-ink-0">
    <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
      {onOpenNav && (
        <button onClick={onOpenNav} aria-label="Open menu" className="md:hidden flex-shrink-0 rounded-lg active:opacity-70">
          <Logo size={30} />
        </button>
      )}
      {currentSession ? (
        <>
          <span className="font-semibold text-sm text-ink-900 truncate max-w-[160px] sm:max-w-[280px]" title={currentSession.name}>
            {currentSession.name}
          </span>
          <span className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full bg-ink-50 text-ink-500 text-[11px] font-mono">
            <GitBranch className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[200px]">{currentSession.worktree?.branch || 'main'}</span>
          </span>
        </>
      ) : (
        <span className="text-sm text-ink-400">No session selected</span>
      )}
    </div>

    <div className="flex items-center gap-0.5 md:gap-1.5 flex-shrink-0">
      <div className="hidden xl:flex items-center gap-1 mr-1">
        {HARNESSES.map(h => {
          const health = agentHealth[h.id];
          const status = health?.status;
          const tone =
            status === 'ready'
              ? 'bg-mint-50 text-mint-700'
              : status === 'not_logged_in'
              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer'
              : status === 'not_installed'
              ? 'bg-ink-50 text-ink-400'
              : 'bg-butter-50 text-butter-700';
          const dot =
            status === 'ready' ? 'bg-mint-400' : status === 'not_logged_in' ? 'bg-rose-400' : status === 'not_installed' ? 'bg-ink-300' : 'bg-butter-400';
          const suffix = status === 'not_logged_in' ? ' · log in' : status === 'not_installed' ? ' · not installed' : '';
          return (
            <button
              key={h.id}
              onClick={() => status === 'not_logged_in' && onOpenTerminal && onOpenTerminal(h.login)}
              title={health?.message || h.label}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${tone} ${status === 'not_logged_in' ? '' : 'cursor-default'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              {h.label}
              {suffix && <span className="font-normal opacity-80">{suffix}</span>}
            </button>
          );
        })}
        <button onClick={onRefreshModels} title="Re-check agent CLIs and models" disabled={isRefreshingModels} className={iconButton}>
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingModels ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {onAskSmith && <button onClick={onAskSmith} className="px-3 py-1.5 rounded-lg bg-lav-100 text-lav-700 text-xs font-medium">Ask Smith</button>}
      {costSummary && <CostWidget costSummary={costSummary} />}

      {onOpenTerminal && (
        <button onClick={() => onOpenTerminal('')} title="Terminal" className={iconButton}>
          <Terminal className="w-4 h-4" />
        </button>
      )}
      <button onClick={onOpenCustomizations} title="Session skills and MCP servers" className={iconButton}>
        <Sliders className="w-4 h-4" />
      </button>
    </div>
  </header>
);
