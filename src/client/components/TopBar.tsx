import React from 'react';
import { Terminal, RefreshCw, Sliders, Plus, GitBranch, Settings, PanelLeftOpen } from 'lucide-react';
import { CostWidget } from './CostWidget.tsx';
import { Session, SessionCostSummary, DiscoveredModel, AgentHealthStatus } from '../../shared/types.ts';

interface TopBarProps {
  currentSession?: Session;
  costSummary?: SessionCostSummary;
  hindsightConnected: boolean;
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
  hindsightConnected,
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
  const codexHealth = agentHealth['codex'];
  const claudeHealth = agentHealth['claude'];
  const antigravityHealth = agentHealth['antigravity'];

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

      {/* Middle: Live Agent Health & Model Badges */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
        {/* Antigravity status */}
        <span
          title="Google Antigravity: Operational & Connected"
          className="flex items-center gap-1 font-mono text-[11px] text-zinc-300"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Antigravity</span>
        </span>

        <span className="text-zinc-600">·</span>

        {/* Codex status */}
        <span
          title={codexHealth?.message || 'OpenAI Codex'}
          className={`flex items-center gap-1 font-mono text-[11px] ${
            codexHealth?.status === 'rate_limited' ? 'text-amber-400' : 'text-zinc-300'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${
            codexHealth?.status === 'rate_limited' ? 'bg-amber-400' : 'bg-emerald-400'
          }`} />
          <span>Codex {codexHealth?.status === 'rate_limited' ? `(${codexHealth.resetTime || 'Limit'})` : ''}</span>
        </span>

        <span className="text-zinc-600">·</span>

        {/* Claude status */}
        <button
          onClick={() => claudeHealth?.status === 'not_logged_in' && onOpenTerminal && onOpenTerminal('claude login')}
          title={claudeHealth?.message || 'Claude Code'}
          className={`flex items-center gap-1 font-mono text-[11px] hover:underline cursor-pointer ${
            claudeHealth?.status === 'not_logged_in' ? 'text-rose-400' : 'text-zinc-300'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${
            claudeHealth?.status === 'not_logged_in' ? 'bg-rose-400' : 'bg-emerald-400'
          }`} />
          <span>Claude {claudeHealth?.status === 'not_logged_in' ? '(Login Needed)' : ''}</span>
        </button>

        <button
          onClick={onRefreshModels}
          title="Re-probe agent models & auth health"
          disabled={isRefreshingModels}
          className="ml-1 p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Right: Cost Counter, Hindsight & Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
        {/* Hindsight Status */}
        <div
          title={hindsightConnected ? 'Vectorize Hindsight Connected' : 'Hindsight Offline'}
          className="flex items-center gap-1.5 px-1.5 sm:px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${hindsightConnected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          <span className="hidden md:inline">Hindsight</span>
        </div>

        {/* Real-time USD Cost Widget */}
        {costSummary && (
          <CostWidget
            costSummary={costSummary}
          />
        )}

        {/* In-App Terminal Quick Launch */}
        {onOpenTerminal && (
          <button
            onClick={() => onOpenTerminal('powershell.exe')}
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
            title="App-Level Configuration & Settings"
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
