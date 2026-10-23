import React, { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { GoalChat } from './components/GoalChat.tsx';
import { CustomizationsDrawer } from './components/CustomizationsDrawer.tsx';
import { NewSessionModal } from './components/NewSessionModal.tsx';
import { TerminalModal } from './components/TerminalModal.tsx';
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

export const App: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [availableModels, setAvailableModels] = useState<DiscoveredModel[]>([]);
  const [costSummary, setCostSummary] = useState<SessionCostSummary | undefined>();
  const [hindsightConnected, setHindsightConnected] = useState<boolean>(false);
  const [agentHealth, setAgentHealth] = useState<Record<string, AgentHealthStatus>>({});
  const [agentBinaries, setAgentBinaries] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<GoalChatMessage[]>([]);
  const [isOrchestrating, setIsOrchestrating] = useState<boolean>(false);

  // Layout & Navigation State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Modals & Drawers
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [allMCPs, setAllMCPs] = useState<CustomMCPServer[]>([]);
  const [allPlugins, setAllPlugins] = useState<Plugin[]>([]);
  const [isCustomizationsOpen, setIsCustomizationsOpen] = useState(false);
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalInitialCmd, setTerminalInitialCmd] = useState('claude login');

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

        if (type === 'cost:updated') {
          if (currentSession && payload.sessionId === currentSession.id) {
            setCostSummary(payload.sessionSummary);
          }
        } else if (type === 'goal:planning' || type === 'goal:tasks_created' || type === 'goal:task_progress' || type === 'goal:task_completed' || type === 'goal:completed') {
          if (currentSession && payload.sessionId === currentSession.id) {
            if (payload.message) {
              setChatMessages(prev => {
                const idx = prev.findIndex(m => m.id === payload.message.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = payload.message;
                  return updated;
                }
                return [...prev, payload.message];
              });
            }
            if (type === 'goal:completed') {
              setIsOrchestrating(false);
              fetchCost(currentSession.id);
            }
          }
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
      setHindsightConnected(data.hindsight?.connected || false);
      if (data.agents) setAgentHealth(data.agents);
      if (data.agentBinaries) setAgentBinaries(data.agentBinaries);
    } catch {
      setHindsightConnected(false);
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
      setSessions(data.sessions || []);
      if (data.sessions && data.sessions.length > 0 && !currentSession) {
        selectSession(data.sessions[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectSession = async (session: Session) => {
    setCurrentSession(session);
    fetchChat(session.id);
    fetchCost(session.id);
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

  const handleSendGoal = async (goal: string) => {
    if (!currentSession) {
      // Auto-create a session if none exists
      try {
        const createRes = await fetch('/api/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: goal.substring(0, 30),
            repoPath: 'c:\\Users\\jeeyo\\Desktop\\johnson',
            macroGoal: goal,
            agents: [
              { agentId: 'claude', model: 'claude-opus-5-5', mode: 'acp' },
              { agentId: 'codex', model: 'gpt-6.1-sol', mode: 'acp' },
              { agentId: 'antigravity', model: 'gemini-4-argon', mode: 'acp' }
            ]
          })
        });
        const newSession = await createRes.json();
        setSessions(prev => [newSession, ...prev]);
        setCurrentSession(newSession);
        dispatchGoal(newSession.id, goal);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    dispatchGoal(currentSession.id, goal);
  };

  const dispatchGoal = async (sessionId: string, goal: string) => {
    setIsOrchestrating(true);
    // Optimistically add user message
    const tempUserMsg: GoalChatMessage = {
      id: `temp-${Date.now()}`,
      sender: 'user',
      content: goal,
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      });
      const data = await res.json();
      if (data.message) {
        fetchChat(sessionId);
        fetchCost(sessionId);
      }
    } catch (err) {
      console.error('Goal dispatch error', err);
    } finally {
      setIsOrchestrating(false);
    }
  };

  const handleCreateSession = async (input: SessionCreateInput) => {
    try {
      const res = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      const newSession = await res.json();
      setSessions(prev => [newSession, ...prev]);
      setIsSettingsOpen(false);
      selectSession(newSession);
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
    } finally {
      setIsRefreshingModels(false);
    }
  };

  const handleApplyCustomizations = async (updated: any) => {
    if (!currentSession) return;
    try {
      const res = await fetch(`/api/v1/sessions/${currentSession.id}/customizations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      setCurrentSession(prev => prev ? ({ ...prev, customizations: data.customizations }) : prev);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenTerminal = (cmd: string = 'claude login') => {
    let resolvedCmd = cmd;
    if (resolvedCmd === 'claude login') {
      const claudeBin = agentBinaries.claude;
      resolvedCmd = claudeBin ? `& "${claudeBin}" login` : 'claude login';
    }
    setTerminalInitialCmd(resolvedCmd);
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

  const handleAnswerQuestion = async (messageId: string, questionId: string, selectedOptions: string[], customAnswer?: string) => {
    if (!currentSession) return;
    try {
      const res = await fetch(`/api/v1/sessions/${currentSession.id}/chat/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, questionId, selectedOptions, customAnswer })
      });
      if (res.ok) {
        await fetchChat(currentSession.id);
        await fetchCost(currentSession.id);
      }
    } catch (err) {
      console.error('Failed to answer question', err);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Left Sidebar: Collapsible Chat List & App Settings Trigger */}
      <Sidebar
        sessions={sessions}
        currentSession={currentSession}
        onSelectSession={(session) => {
          setIsSettingsOpen(false);
          selectSession(session);
        }}
        onOpenNewSession={() => {
          setIsSettingsOpen(false);
          setIsNewSessionOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isSettingsOpen={isSettingsOpen}
        onDeleteSession={handleDeleteSession}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        agentHealth={agentHealth}
        hindsightConnected={hindsightConnected}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <TopBar
          currentSession={currentSession || undefined}
          costSummary={costSummary}
          hindsightConnected={hindsightConnected}
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
              isOrchestrating={isOrchestrating}
              onSendGoal={handleSendGoal}
              availableModels={availableModels}
              costSummary={costSummary}
              onOpenTerminal={handleOpenTerminal}
              onMergeWorktree={handleMergeWorktree}
              onDiscardWorktree={handleDiscardWorktree}
              onAnswerQuestion={handleAnswerQuestion}
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
        onRefreshHealth={fetchHealth}
      />

      {currentSession && (
        <CustomizationsDrawer
          isOpen={isCustomizationsOpen}
          onClose={() => setIsCustomizationsOpen(false)}
          customizations={currentSession.customizations}
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
