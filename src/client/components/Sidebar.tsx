import React, { useState } from 'react';
import { Plus, Settings, PanelLeftClose, PanelLeftOpen, Search, Trash2, GitBranch, CheckSquare, Check, X } from 'lucide-react';
import { Session, AgentHealthStatus } from '../../shared/types.ts';
import { Logo } from './Logo.tsx';

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
}

/** A soft colour per session, so sessions are easy to tell apart at a glance. */
const SESSION_TINTS = ['bg-mint-200', 'bg-lav-200', 'bg-sky-200', 'bg-peach-200', 'bg-butter-200', 'bg-rose-200'];
function tintFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SESSION_TINTS[h % SESSION_TINTS.length];
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
  agentHealth
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

  const readyCount = Object.values(agentHealth).filter(a => a.status === 'ready').length;
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

  const exitSelection = () => {
    setIsSelectionMode(false);
    setSelectedSessionIds(new Set());
    setConfirmBatchDelete(false);
  };

  const executeBatchDelete = () => {
    const ids = Array.from(selectedSessionIds);
    if (ids.length === 0) return;
    if (onDeleteMultipleSessions) onDeleteMultipleSessions(ids);
    else ids.forEach(id => onDeleteSession(id));
    exitSelection();
  };

  if (isCollapsed) {
    return (
      <aside className="w-14 bg-ink-50 border-r border-ink-100 flex flex-col items-center py-3 gap-3 select-none flex-shrink-0 z-20">
        <button onClick={onToggleCollapse} title="Expand sidebar" className="rounded-lg hover:opacity-80 transition-opacity">
          <Logo size={28} />
        </button>
        <button
          onClick={onOpenNewSession}
          title="New session"
          className="w-8 h-8 rounded-lg bg-lav-200 hover:bg-lav-300 text-lav-700 flex items-center justify-center transition-colors"
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
                title={s.name}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold text-ink-700 transition-all ${tintFor(s.id)} ${
                  isActive ? 'ring-2 ring-lav-300 ring-offset-2 ring-offset-ink-50' : 'opacity-70 hover:opacity-100'
                }`}
              >
                {s.name.trim().charAt(0).toUpperCase() || '·'}
              </button>
            );
          })}
        </div>
        <button
          onClick={onOpenSettings}
          title="Settings"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isSettingsOpen ? 'bg-ink-0 text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100'
          }`}
        >
          <Settings className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-72 max-w-[85vw] md:w-64 bg-ink-50 border-r border-ink-100 flex flex-col h-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] select-none flex-shrink-0 z-20">
      {/* Brand */}
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-semibold text-[15px] tracking-tight text-ink-900">Smith</span>
        </div>
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          className="p-1.5 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={onOpenNewSession}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-lav-200 hover:bg-lav-300 text-lav-700 text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New session</span>
        </button>
      </div>

      {sessions.length > 3 && (
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-ink-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search sessions"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-ink-0 border border-ink-100 rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink-800 placeholder-ink-400 focus:outline-none focus:border-lav-300 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 text-ink-400 hover:text-ink-700">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pt-1 pb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-ink-400">
        <span>Sessions</span>
        {filteredSessions.length > 0 && !isSelectionMode && (
          <button
            onClick={() => setIsSelectionMode(true)}
            className="normal-case tracking-normal text-[11px] text-ink-400 hover:text-ink-700 flex items-center gap-1 transition-colors"
          >
            <CheckSquare className="w-3 h-3" />
            Select
          </button>
        )}
      </div>

      {isSelectionMode && (
        <div className="mx-3 mb-2 p-2 rounded-xl bg-ink-0 border border-ink-100 text-[11px] space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setSelectedSessionIds(isAllSelected ? new Set() : new Set(filteredSessions.map(s => s.id)));
                setConfirmBatchDelete(false);
              }}
              className="flex items-center gap-2 text-ink-700"
            >
              <span
                className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                  isAllSelected ? 'bg-lav-200 border-lav-300 text-lav-700' : 'border-ink-300 bg-ink-0'
                }`}
              >
                {isAllSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </span>
              Select all
            </button>
            <button onClick={exitSelection} className="text-ink-500 hover:text-ink-800 px-1.5 py-0.5 rounded-md hover:bg-ink-50">
              Done
            </button>
          </div>
          {selectedSessionIds.size > 0 && (
            <div className="pt-2 border-t border-ink-100 flex items-center justify-between">
              <span className="text-ink-500">{selectedSessionIds.size} selected</span>
              {confirmBatchDelete ? (
                <div className="flex items-center gap-1">
                  <button onClick={executeBatchDelete} className="px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-700 font-medium">
                    Delete
                  </button>
                  <button onClick={() => setConfirmBatchDelete(false)} className="px-1.5 py-0.5 text-ink-500 hover:text-ink-800">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmBatchDelete(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete {selectedSessionIds.size}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {filteredSessions.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-ink-400">{searchQuery ? 'No matching sessions' : 'No sessions yet'}</div>
        ) : (
          filteredSessions.map(s => {
            const isActive = !isSettingsOpen && currentSession?.id === s.id;
            const isConfirming = confirmDeleteId === s.id;
            const isSelected = selectedSessionIds.has(s.id);
            return (
              <div
                key={s.id}
                onClick={() => {
                  if (isSelectionMode) toggleSessionSelection(s.id);
                  else if (!isConfirming) onSelectSession(s);
                }}
                className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all text-xs ${
                  isActive || (isSelectionMode && isSelected) ? 'bg-ink-0 shadow-soft' : 'hover:bg-ink-100/70'
                }`}
              >
                {isSelectionMode ? (
                  <span
                    className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-lav-200 border-lav-300 text-lav-700' : 'border-ink-300 bg-ink-0'
                    }`}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                ) : (
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tintFor(s.id)}`} />
                )}
                <div className="flex-1 min-w-0 pr-5">
                  <div className={`truncate leading-tight ${isActive ? 'font-medium text-ink-900' : 'text-ink-700'}`}>{s.name}</div>
                  <div className="text-[10.5px] text-ink-400 truncate flex items-center gap-1 mt-0.5 font-mono">
                    <GitBranch className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{s.worktree?.branch || 'main'}</span>
                  </div>
                </div>

                {!isSelectionMode && (
                  <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    {isConfirming ? (
                      <div className="flex items-center gap-0.5 bg-ink-0 px-1 py-0.5 rounded-lg shadow-soft">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteSession(s.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-[10px] text-rose-600 hover:text-rose-700 font-medium px-1"
                        >
                          Delete
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="text-[10px] text-ink-500 hover:text-ink-800 px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmDeleteId(s.id);
                        }}
                        title="Delete session"
                        className="p-1 rounded-md text-ink-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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

      <div className="p-3 space-y-1">
        <div className="flex items-center gap-1.5 px-2.5 text-[11px] text-ink-500">
          <span className={`w-1.5 h-1.5 rounded-full ${readyCount > 0 ? 'bg-mint-400' : 'bg-ink-300'}`} />
          {readyCount > 0 ? `${readyCount} agent CLI${readyCount === 1 ? '' : 's'} ready` : 'No agent CLI ready'}
        </div>
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-all ${
            isSettingsOpen ? 'bg-ink-0 text-ink-900 font-medium shadow-soft' : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100/70'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>
    </aside>
  );
};
