import React, { useState } from 'react';
import {
  MessageSquare,
  Plus,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  Terminal,
  GitBranch,
  ShieldCheck,
  CheckSquare,
  Check,
  X
} from 'lucide-react';
import { Session, AgentHealthStatus } from '../../shared/types.ts';

interface SidebarProps {
  sessions: Session[];
  currentSession: Session | null;
  onSelectSession: (session: Session) => void;
  onOpenNewSession: () => void;
  onOpenSettings: () => void;
  isSettingsOpen: boolean;
  onDeleteSession: (sessionId: string) => void;
  onDeleteMultipleSessions?: (sessionIds: string[]) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  agentHealth: Record<string, AgentHealthStatus>;
  hindsightConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSession,
  onSelectSession,
  onOpenNewSession,
  onOpenSettings,
  isSettingsOpen,
  onDeleteSession,
  onDeleteMultipleSessions,
  isCollapsed,
  onToggleCollapse,
  agentHealth,
  hindsightConnected
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  const filteredSessions = sessions.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.macroGoal && s.macroGoal.toLowerCase().includes(q));
  });

  const readyAgentsCount = Object.values(agentHealth).filter(a => a.status === 'ready' || a.authenticated).length;

  const isAllSelected = filteredSessions.length > 0 && filteredSessions.every(s => selectedSessionIds.has(s.id));

  const toggleSessionSelection = (id: string) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmBatchDelete(false);
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(filteredSessions.map(s => s.id)));
    }
    setConfirmBatchDelete(false);
  };

  const executeBatchDelete = () => {
    const ids = Array.from(selectedSessionIds);
    if (ids.length === 0) return;
    if (onDeleteMultipleSessions) {
      onDeleteMultipleSessions(ids);
    } else {
      ids.forEach(id => onDeleteSession(id));
    }
    setSelectedSessionIds(new Set());
    setIsSelectionMode(false);
    setConfirmBatchDelete(false);
  };

  if (isCollapsed) {
    return (
      <aside className="w-14 bg-zinc-950 border-r border-zinc-800/80 flex flex-col items-center py-3 select-none flex-shrink-0 z-20">
        <button
          onClick={onToggleCollapse}
          title="Expand Sidebar"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors mb-3"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenNewSession}
          title="New Chat / Session"
          className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 transition-colors mb-3"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-1.5 px-2">
          {sessions.map(s => {
            const isActive = !isSettingsOpen && currentSession?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onSelectSession(s)}
                title={`${s.name}\n${s.macroGoal || ''}`}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs font-semibold ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        {/* Bottom icon actions */}
        <div className="pt-2 border-t border-zinc-900 flex flex-col items-center gap-2">
          <div
            title={hindsightConnected ? 'Hindsight Active' : 'Hindsight Offline'}
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: hindsightConnected ? '#34d399' : '#52525b' }}
          />
          <button
            onClick={onOpenSettings}
            title="App Settings"
            className={`p-2 rounded-lg transition-colors ${
              isSettingsOpen
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 sm:w-72 bg-zinc-950 border-r border-zinc-800/80 flex flex-col h-full select-none flex-shrink-0 z-20">
      {/* Brand & Collapse Header */}
      <div className="h-13 px-3.5 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 flex-shrink-0">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm tracking-tight text-zinc-100">Smith</span>
          </div>
        </div>

        <button
          onClick={onToggleCollapse}
          title="Collapse Sidebar"
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3 pb-2">
        <button
          onClick={onOpenNewSession}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 active:bg-zinc-800 border border-zinc-800 text-zinc-200 hover:text-zinc-100 text-xs font-medium transition-all shadow-sm group"
        >
          <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Search Input */}
      {sessions.length > 3 && (
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/80 border border-zinc-800/90 rounded-md pl-8 pr-7 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sessions / Chat List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800">
        <div className="px-2 py-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <span>Chats & Sessions ({filteredSessions.length})</span>
          {filteredSessions.length > 0 && !isSelectionMode && (
            <button
              onClick={() => {
                setIsSelectionMode(true);
                setSelectedSessionIds(new Set());
                setConfirmBatchDelete(false);
              }}
              className="text-[11px] lowercase tracking-normal text-zinc-400 hover:text-zinc-200 transition-colors font-sans hover:underline flex items-center gap-1"
            >
              <CheckSquare className="w-3 h-3 text-zinc-400" />
              <span>Select</span>
            </button>
          )}
        </div>

        {/* Multi-Selection Control Bar */}
        {isSelectionMode && (
          <div className="mx-1 mb-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={handleToggleSelectAll}
                className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 font-medium"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isAllSelected
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : selectedSessionIds.size > 0
                      ? 'bg-zinc-800 border-zinc-600 text-emerald-400'
                      : 'border-zinc-700 bg-zinc-950'
                  }`}
                >
                  {isAllSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  {!isAllSelected && selectedSessionIds.size > 0 && (
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-sm" />
                  )}
                </div>
                <span className="text-[11px]">Select All ({filteredSessions.length})</span>
              </button>

              <button
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedSessionIds(new Set());
                  setConfirmBatchDelete(false);
                }}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors"
              >
                Done
              </button>
            </div>

            {selectedSessionIds.size > 0 && (
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400 font-mono">
                  {selectedSessionIds.size} selected
                </span>

                {confirmBatchDelete ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={executeBatchDelete}
                      className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition-colors shadow-sm"
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setConfirmBatchDelete(false)}
                      className="px-1.5 py-0.5 rounded text-zinc-400 hover:text-zinc-200 text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmBatchDelete(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 text-[11px] font-medium transition-colors"
                  >
                    <Trash2 className="w-3 h-3 text-rose-400" />
                    <span>Delete ({selectedSessionIds.size})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {filteredSessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">
            {searchQuery ? 'No matching chats found' : 'No chats yet. Create one to begin.'}
          </div>
        ) : (
          filteredSessions.map(s => {
            const isActive = !isSettingsOpen && currentSession?.id === s.id;
            const isConfirming = confirmDeleteId === s.id;
            const isSelected = selectedSessionIds.has(s.id);

            return (
              <div
                key={s.id}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleSessionSelection(s.id);
                  } else if (!isConfirming) {
                    onSelectSession(s);
                  }
                }}
                className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-xs ${
                  isSelectionMode && isSelected
                    ? 'bg-zinc-850 border border-emerald-700/70 text-zinc-100 shadow-sm'
                    : isActive
                    ? 'bg-zinc-850/90 text-zinc-100 border border-zinc-700/80 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/70 border border-transparent'
                }`}
              >
                {isSelectionMode ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSessionSelection(s.id);
                    }}
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-500'
                    }`}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                ) : (
                  <MessageSquare
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-400'
                    }`}
                  />
                )}

                <div className="flex-1 min-w-0 pr-6">
                  <div className="font-medium truncate leading-tight text-zinc-200">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                    {s.worktree?.branch && (
                      <span className="flex items-center gap-0.5 font-mono text-[10px] text-zinc-400">
                        <GitBranch className="w-2.5 h-2.5" />
                        {s.worktree.branch}
                      </span>
                    )}
                    {s.macroGoal && (
                      <span className="truncate">· {s.macroGoal}</span>
                    )}
                  </div>
                </div>

                {/* Single Delete / Actions (hidden in multi-select mode) */}
                {!isSelectionMode && (
                  <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    {isConfirming ? (
                      <div className="flex items-center gap-1 bg-zinc-900 px-1.5 py-0.5 rounded border border-rose-900/60">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(s.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold px-1"
                        >
                          Delete
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(s.id);
                        }}
                        title="Delete Chat"
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer: System Status & App Settings */}
      <div className="p-3 border-t border-zinc-850 bg-zinc-950/80 flex flex-col gap-2">
        {/* Status preview */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: hindsightConnected ? '#34d399' : '#71717a' }}
            />
            <span>Hindsight {hindsightConnected ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-1 text-zinc-500 text-[10px] font-mono">
            <ShieldCheck className="w-3 h-3 text-zinc-400" />
            <span>{readyAgentsCount} Agents</span>
          </div>
        </div>

        {/* App Settings Trigger */}
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${
            isSettingsOpen
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 font-medium shadow-sm'
              : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent'
          }`}
        >
          <Settings className="w-3.5 h-3.5 text-zinc-400" />
          <span className="flex-1 text-left">App Configuration</span>
          <span className="text-[10px] text-zinc-500 font-mono">Settings</span>
        </button>
      </div>
    </aside>
  );
};
