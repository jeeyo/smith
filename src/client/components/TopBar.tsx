import React from 'react';
import { Terminal, RefreshCw, Sliders, Plus, GitBranch, Settings, PanelLeftOpen } from 'lucide-react';
import { CostWidget } from './CostWidget.tsx';
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
}

export const TopBar: React.FC<TopBarProps> = ({
  currentSession,
  costSummary,
  onOpenNewSession,
  onOpenCustomizations,
  onRefreshModels,
  isRefreshingModels,
  availableModels = [],
  agentHealth = {},
  onOpenTerminal,
  onToggleSidebar,
  isSidebarCollapsed,
  onOpenSettings
}) => {
  const harnesses: Array<{ id: string; label: string; login?: string }> = [
    { id: 'claude', label: 'Claude', login: 'claude login' },
    { id: 'codex', label: 'Codex', login: 'codex login' },
    { id: 'opencode', label: 'OpenCode', login: 'opencode auth login' }
  ];

  return (
    <header className="h-13 border-b border-zinc-800 bg-zinc-950 px-2.5 sm:px-4 py-2 flex items-center justify-between select-none flex-shrink-0">
      {/* Brand & Active Session Info */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {isSidebarCollapsed && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title="Expand Sidebar"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-zinc-800 transition-colors flex-shrink-0"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 flex-shrink-0">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold text-sm tracking-tight text-zinc-100">Smith</span>
          </div>
        </div>

        {currentSession ? (
          <div className="flex items-center gap-2 pl-3 border-l border-zinc-800 text-xs min-w-0">
            <span className="font-medium text-zinc-200 truncate max-w-[180px] sm:max-w-[260px]" title={currentSession.name}>
              {currentSession.name}
            </span>
            <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 text-[11px] font-mono">
              <GitBranch className="w-3 h-3 text-zinc-400 flex-shrink-0" />
              <span className="truncate max-w-[120px]">{currentSession.worktree?.branch || 'main'}</span>
            </div>
          </div>
        ) : (
          <div className="hidden sm:flex items-center pl-3 border-l border-zinc-800 text-xs text-zinc-500 font-mono">
            No active session
          </div>
        )}
      </div>

      {/* Middle: agent CLI health */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
        {harnesses.map((h, i) => {
          const health = agentHealth[h.id];
          const ready = health?.status === 'ready';
          const needsLogin = health?.status === 'not_logged_in';
          const missing = health?.status === 'not_installed';
          return (
            <React.Fragment key={h.id}>
              {i > 0 && <span className="text-zinc-600">·</span>}
              <button
                onClick={() => needsLogin && h.login && onOpenTerminal && onOpenTerminal(h.login)}
                title={health?.message || h.label}
                className={`flex items-center gap-1 font-mono text-[11px] ${needsLogin ? 'text-rose-400 hover:underline cursor-pointer' : missing ? 'text-zinc-600 cursor-default' : 'text-zinc-300 cursor-default'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-400' : needsLogin ? 'bg-rose-400' : missing ? 'bg-zinc-700' : 'bg-amber-400'}`} />
                <span>{h.label}{needsLogin ? ' (login needed)' : missing ? ' (not installed)' : ''}</span>
              </button>
            </React.Fragment>
          );
        })}

        <button
          onClick={onRefreshModels}
          title="Re-check agent CLIs and models"
          disabled={isRefreshingModels}
          className="ml-1 p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Right: cost and controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
        {/* Real-time USD Cost Widget */}
        {costSummary && (
          <CostWidget
            costSummary={costSummary}
          />
        )}

        {/* In-App Terminal Quick Launch */}
        {onOpenTerminal && (
          <button
            onClick={() => onOpenTerminal('')}
            title="Open In-App Terminal"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        )}

        {/* App Settings Configuration */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="App settings"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Customizations / Session Skills & MCP Servers */}
        <button
          onClick={onOpenCustomizations}
          title="Session Skills & MCP Servers"
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>

        {/* New Session Button */}
        <button
          onClick={onOpenNewSession}
          title="New Session"
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Session</span>
        </button>
      </div>
    </header>
  );
};
