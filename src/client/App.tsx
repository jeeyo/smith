import React, { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { GoalChat } from './components/GoalChat.tsx';
import { CustomizationsDrawer } from './components/CustomizationsDrawer.tsx';
import { NewSessionModal } from './components/NewSessionModal.tsx';
import { TerminalModal } from './components/TerminalModal.tsx';
import { StartupProgressModal } from './components/StartupProgressModal.tsx';
import {
  Session,
  DiscoveredModel,
  SessionCostSummary,
  GoalChatMessage,
  AgentHealthStatus,
  Skill,
  CustomMCPServer,
  Plugin,
  SessionCreateInput
} from '../shared/types.ts';
import { BoardData, BoardLogEntry, ReviewMode, Tier, TurnRecord } from '../shared/board.ts';

export const App: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [availableModels, setAvailableModels] = useState<DiscoveredModel[]>([]);
  const [costSummary, setCostSummary] = useState<SessionCostSummary | undefined>();
  const [agentHealth, setAgentHealth] = useState<Record<string, AgentHealthStatus>>({});
  const [agentBinaries, setAgentBinaries] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<GoalChatMessage[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [boardLog, setBoardLog] = useState<BoardLogEntry[]>([]);
  const [runningTurns, setRunningTurns] = useState<TurnRecord[]>([]);
  const [recentTurns, setRecentTurns] = useState<TurnRecord[]>([]);

  // Layout & Navigation State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Modals & Drawers
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [allMCPs, setAllMCPs] = useState<CustomMCPServer[]>([]);
  const [allPlugins, setAllPlugins] = useState<Plugin[]>([]);
  const [isCustomizationsOpen, setIsCustomizationsOpen] = useState(false);
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalInitialCmd, setTerminalInitialCmd] = useState('');
  const [isStartupModalOpen, setIsStartupModalOpen] = useState(true);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // If loaded on Tauri custom domain, redirect to local server port
  useEffect(() => {
    if (window.location.hostname === 'tauri.localhost' || window.location.protocol === 'tauri:') {
      console.log('[Tauri] Redirecting webview to backend server at http://127.0.0.1:4100');
      window.location.replace('http://127.0.0.1:4100');
    }
  }, []);

  // Initial Data Fetch
  useEffect(() => {
    fetchHealth();
    fetchModels();
    fetchCustomizations();
    fetchSessions();
  }, []);

  // WebSocket Event Stream
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);

        if (!currentSession || payload.sessionId !== currentSession.id) return;

        if (type === 'cost:updated') {
          setCostSummary(payload.sessionSummary);
        } else if (type === 'board:updated') {
          setBoard(payload.board);
          setRunningTurns(payload.runningTurns || []);
          if (payload.entry) setBoardLog(prev => [...prev.slice(-299), payload.entry]);
        } else if (type === 'chat:message') {
          setChatMessages(prev => {
            const withoutTemp = prev.filter(m => !(m.id.startsWith('temp-') && m.sender === payload.message.sender && m.content === payload.message.content));
            return withoutTemp.some(m => m.id === payload.message.id) ? withoutTemp : [...withoutTemp, payload.message];
          });
        } else if (type === 'turn:started') {
          setRunningTurns(prev => [...prev.filter(t => t.id !== payload.turn.id), payload.turn]);
        } else if (type === 'turn:ended') {
          setRunningTurns(prev => prev.filter(t => t.id !== payload.turn.id));
          setRecentTurns(prev => [...prev.slice(-29), payload.turn]);
          fetchCost(currentSession.id);
        }
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    return () => ws.close();
  }, [currentSession?.id]);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/v1/health');
      const data = await res.json();
      if (data.agents) setAgentHealth(data.agents);
      if (data.agentBinaries) setAgentBinaries(data.agentBinaries);
    } catch {
      // The server is not up yet; the startup dialog keeps polling.
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/v1/system/models');
      const data = await res.json();
      setAvailableModels(data.models || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomizations = async () => {
    try {
      const res = await fetch('/api/v1/customizations');
      const data = await res.json();
      setAllSkills(data.skills || []);
      setAllMCPs(data.mcpServers || []);
      setAllPlugins(data.plugins || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/v1/sessions');
      const data = await res.json();
      const sessionList: Session[] = data.sessions || [];
      setSessions(sessionList);
      if (sessionList.length > 0 && !currentSession) {
        const lastActiveId = localStorage.getItem('smith_active_session_id');
        const matched = sessionList.find(s => s.id === lastActiveId);
        selectSession(matched || sessionList[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSessionsLoaded(true);
    }
  };

  const selectSession = async (session: Session) => {
    setCurrentSession(session);
    try {
      localStorage.setItem('smith_active_session_id', session.id);
    } catch {}
    fetchChat(session.id);
    fetchCost(session.id);
    fetchBoard(session.id);
  };

  const fetchBoard = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/board`);
      if (!res.ok) return;
      const data = await res.json();
      setBoard(data.board);
      setBoardLog(data.log || []);
      setRunningTurns(data.runningTurns || []);
      setRecentTurns(data.recentTurns || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchChat = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/chat`);
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCost = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/cost`);
      const data = await res.json();
      setCostSummary(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => {
          const updated = prev.filter(s => s.id !== sessionId);
          if (currentSession?.id === sessionId) {
            if (updated.length > 0) {
              selectSession(updated[0]);
            } else {
              setCurrentSession(null);
              setChatMessages([]);
              setBoard(null);
              setCostSummary(undefined);
            }
          }
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  const handleDeleteMultipleSessions = async (sessionIds: string[]) => {
    if (!sessionIds || sessionIds.length === 0) return;
    try {
      const res = await fetch('/api/v1/sessions/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds })
      });

      if (res.ok) {
        setSessions(prev => {
          const updated = prev.filter(s => !sessionIds.includes(s.id));
          if (currentSession && sessionIds.includes(currentSession.id)) {
            if (updated.length > 0) {
              selectSession(updated[0]);
            } else {
              setCurrentSession(null);
              setChatMessages([]);
              setBoard(null);
              setCostSummary(undefined);
            }
          }
          return updated;
        });
      } else {
        await Promise.all(sessionIds.map(id => fetch(`/api/v1/sessions/${id}`, { method: 'DELETE' })));
        setSessions(prev => {
          const updated = prev.filter(s => !sessionIds.includes(s.id));
          if (currentSession && sessionIds.includes(currentSession.id)) {
            if (updated.length > 0) {
              selectSession(updated[0]);
            } else {
              setCurrentSession(null);
              setChatMessages([]);
              setBoard(null);
              setCostSummary(undefined);
            }
          }
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to delete multiple sessions', err);
    }
  };

  const handleSendGoal = async (goal: string) => {
    if (!currentSession) {
      setIsNewSessionOpen(true);
      return;
    }
    const sessionId = currentSession.id;
    setIsSending(true);
    // Shown at once; replaced by the stored message when the server echoes it.
    setChatMessages(prev => [...prev, { id: `temp-${Date.now()}`, sender: 'user', content: goal, timestamp: Date.now() }]);
    try {
      await fetch(`/api/v1/sessions/${sessionId}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      });
      fetchChat(sessionId);
      fetchBoard(sessionId);
    } catch (err) {
      console.error('Failed to send', err);
    } finally {
      setIsSending(false);
    }
  };

  const boardAction = async (path: string, method: string, body?: unknown) => {
    if (!currentSession) return;
    const sessionId = currentSession.id;
    try {
      await fetch(`/api/v1/sessions/${sessionId}/board${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      fetchBoard(sessionId);
    } catch (err) {
      console.error('Board action failed', err);
    }
  };

  const handleAnswerCard = async (cardId: string, answer: string) => {
    await boardAction(`/cards/${cardId}/answer`, 'POST', { answer });
    if (currentSession) fetchChat(currentSession.id);
  };
  const handleSetReviewMode = (mode: ReviewMode) => boardAction('/settings', 'PUT', { reviewMode: mode });
  const handleSetMinTier = (cardId: string, tier: Tier | null) => boardAction(`/cards/${cardId}`, 'PUT', { minTier: tier });

  const handleCreateSession = async (input: SessionCreateInput) => {
    try {
      const res = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      const newSession = await res.json();
      if (!res.ok) {
        window.alert(newSession.error || 'Could not create the session.');
        return;
      }
      setSessions(prev => [newSession, ...prev]);
      setIsSettingsOpen(false);
      selectSession(newSession);
    } catch (err) {
      console.error(err);
    }
  };

  /** Re-probes the agent CLIs, for example after logging in; waiting goals then pick up. */
  const recheckAgents = async () => {
    try {
      const res = await fetch('/api/v1/system/agents/status?refresh=true');
      const data = await res.json();
      if (data.agents) setAgentHealth(data.agents);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshModels = async () => {
    setIsRefreshingModels(true);
    try {
      const res = await fetch('/api/v1/system/models/refresh', { method: 'POST' });
      const data = await res.json();
      setAvailableModels(data.models || []);
      await recheckAgents();
    } finally {
      setIsRefreshingModels(false);
    }
  };

  /** Saves the session's skills and tools; returns the server's complaint, if any. */
  const handleApplyCustomizations = async (updated: any): Promise<string | null> => {
    if (!currentSession) return 'No session selected.';
    const sessionId = currentSession.id;
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/customizations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Could not save.';
      const apply = (s: Session) => (s.id === sessionId ? { ...s, customizations: data.customizations } : s);
      setCurrentSession(prev => (prev ? apply(prev) : prev));
      setSessions(prev => prev.map(apply));
      return null;
    } catch (err: any) {
      return err?.message || 'Could not reach the server.';
    }
  };

  const handleOpenTerminal = (cmd: string = '') => {
    setTerminalInitialCmd(cmd);
    setIsTerminalOpen(true);
  };

  const handleMergeWorktree = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/worktree/merge`, { method: 'POST' });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const handleDiscardWorktree = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/worktree/discard`, { method: 'POST' });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  /** On phones the sidebar is a drawer, and any choice made in it closes the drawer. */
  const renderSidebar = (asDrawer: boolean) => {
    const closeDrawer = () => asDrawer && setIsMobileNavOpen(false);
    return (
      <Sidebar
        sessions={sessions}
        currentSession={currentSession}
        onSelectSession={(session) => {
          setIsSettingsOpen(false);
          selectSession(session);
          closeDrawer();
        }}
        onOpenNewSession={() => {
          setIsSettingsOpen(false);
          setIsNewSessionOpen(true);
          closeDrawer();
        }}
        onOpenSettings={() => {
          setIsSettingsOpen(true);
          closeDrawer();
        }}
        isSettingsOpen={isSettingsOpen}
        onDeleteSession={handleDeleteSession}
        onDeleteMultipleSessions={handleDeleteMultipleSessions}
        isCollapsed={asDrawer ? false : isSidebarCollapsed}
        onToggleCollapse={asDrawer ? closeDrawer : () => setIsSidebarCollapsed(prev => !prev)}
        agentHealth={agentHealth}
      />
    );
  };

  return (
    <div className="flex h-dvh w-full bg-ink-25 text-ink-900 overflow-hidden font-sans">
      {/* Sidebar: fixed on wider screens, a drawer on phones */}
      <div className="hidden md:flex h-full">{renderSidebar(false)}</div>
      {isMobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {renderSidebar(true)}
          <button aria-label="Close menu" className="flex-1 bg-ink-900/20" onClick={() => setIsMobileNavOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <TopBar
          currentSession={currentSession || undefined}
          costSummary={costSummary}
          onOpenNewSession={() => {
            setIsSettingsOpen(false);
            setIsNewSessionOpen(true);
          }}
          onOpenCustomizations={() => setIsCustomizationsOpen(true)}
          onRefreshModels={handleRefreshModels}
          isRefreshingModels={isRefreshingModels}
          availableModels={availableModels}
          agentHealth={agentHealth}
          onOpenTerminal={handleOpenTerminal}
          onToggleSidebar={() => setIsSidebarCollapsed(prev => !prev)}
          isSidebarCollapsed={isSidebarCollapsed}
          onOpenSettings={() => setIsSettingsOpen(prev => !prev)}
          onOpenNav={() => setIsMobileNavOpen(true)}
        />

        {/* View Switcher: App Settings or Single Goal Chat Interface */}
        {isSettingsOpen ? (
          <SettingsView
            onClose={() => setIsSettingsOpen(false)}
            onSaved={() => {
              fetchHealth();
              fetchModels();
            }}
          />
        ) : (
          <main className="flex-1 overflow-hidden flex flex-col">
            <GoalChat
              currentSession={currentSession}
              messages={chatMessages}
              board={board}
              log={boardLog}
              runningTurns={runningTurns}
              recentTurns={recentTurns}
              isSending={isSending}
              onSendGoal={handleSendGoal}
              onAnswerCard={handleAnswerCard}
              onSetReviewMode={handleSetReviewMode}
              onPause={() => boardAction('/pause', 'POST')}
              onResume={() => boardAction('/resume', 'POST')}
              onSetMinTier={handleSetMinTier}
              onMergeWorktree={handleMergeWorktree}
              onDiscardWorktree={handleDiscardWorktree}
              onOpenNewSession={() => setIsNewSessionOpen(true)}
            />
          </main>
        )}
      </div>

      {/* Overlay Modals & Drawers */}
      <NewSessionModal
        isOpen={isNewSessionOpen}
        onClose={() => setIsNewSessionOpen(false)}
        availableModels={availableModels}
        agentHealth={agentHealth}
        onCreateSession={handleCreateSession}
      />

      <TerminalModal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        initialCommand={terminalInitialCmd}
        onRefreshHealth={recheckAgents}
      />

      <StartupProgressModal
        isOpen={isStartupModalOpen}
        onDismiss={() => setIsStartupModalOpen(false)}
        agentHealth={agentHealth}
        sessionsLoaded={sessionsLoaded}
        sessionsCount={sessions.length}
      />

      {currentSession && (
        <CustomizationsDrawer
          isOpen={isCustomizationsOpen}
          onClose={() => setIsCustomizationsOpen(false)}
          customizations={currentSession.customizations}
          workers={currentSession.agents}
          allSkills={allSkills}
          allMCPs={allMCPs}
          allPlugins={allPlugins}
          availableModels={availableModels}
          agentHealth={agentHealth}
          onApplyChanges={handleApplyCustomizations}
        />
      )}
    </div>
  );
};
