import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Check,
  RefreshCw,
  Cpu,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FolderGit2,
  Sparkles,
  Search
} from 'lucide-react';
import type { AppLevelConfig } from '../../shared/types.ts';

interface SettingsViewProps {
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose, onSaved }) => {
  const [activeTab, setActiveTab] = useState<'agents' | 'app'>('agents');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form State
  const [agentBinaries, setAgentBinaries] = useState<Record<string, string>>({
    claude: 'claude',
    codex: 'codex',
    opencode: 'opencode'
  });

  const [app, setApp] = useState({
    gitPath: 'git',
    defaultRepoPath: '',
    port: 4100,
    theme: 'dark' as 'dark' | 'light' | 'system',
    currency: 'USD',
    budgetAlertThreshold: 20
  });

  const [detectedBinaries, setDetectedBinaries] = useState<Record<string, string>>({});

  // Binary probe statuses
  const [probeStatuses, setProbeStatuses] = useState<Record<string, { checking: boolean; exists?: boolean; resolvedPath?: string }>>({});

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/system/config');
      const data = await res.json();
      if (data.agentBinaries) setAgentBinaries(data.agentBinaries);
      if (data.app) setApp(data.app);
      if (data.detectedBinaries) setDetectedBinaries(data.detectedBinaries);
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setIsLoading(false);
    }
  };

  const probeBinary = async (agentKey: string, binaryPath: string) => {
    setProbeStatuses(prev => ({ ...prev, [agentKey]: { checking: true } }));
    try {
      const res = await fetch('/api/v1/system/config/probe-binary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ binaryPath })
      });
      const data = await res.json();
      setProbeStatuses(prev => ({
        ...prev,
        [agentKey]: { checking: false, exists: data.exists, resolvedPath: data.resolvedPath }
      }));
    } catch (err) {
      setProbeStatuses(prev => ({
        ...prev,
        [agentKey]: { checking: false, exists: false }
      }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/v1/system/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentBinaries,
          app
        })
      });
      if (res.ok) {
        setSaveSuccess(true);
        if (onSaved) onSaved();
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save configuration', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (Object.keys(detectedBinaries).length > 0) {
      setAgentBinaries(prev => ({ ...prev, ...detectedBinaries }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-ink-0 text-ink-600">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-ink-0 text-ink-900 overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-2 bg-ink-25 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-ink-600 hover:text-ink-900 hover:bg-ink-50 border border-ink-100 transition-colors"
            title="Back to Chat"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-ink-900 flex items-center gap-2">
              <span>Settings</span>
            </h1>
            <p className="text-[11px] text-ink-500 hidden sm:block">
              Agent CLI paths and workspace defaults.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs text-mint-600 font-medium px-2 py-1 rounded bg-mint-50 border border-mint-200 animate-fade-in">
              <Check className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}

          <button
            onClick={handleResetDefaults}
            className="hidden sm:block px-2.5 py-1.5 rounded-xl text-xs text-ink-600 hover:text-ink-800 hover:bg-ink-50 transition-colors"
          >
            Reset Defaults
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lav-200 hover:bg-lav-300 text-lav-700 text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save<span className="hidden sm:inline"> changes</span></span>
          </button>
        </div>
      </div>

      {/* Main Settings Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Settings Navigation Tabs: a row on phones, a column beside the content otherwise */}
        <div className="md:w-56 bg-ink-25 px-3 pb-2 md:p-3 flex md:block gap-1 md:space-y-1 flex-shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('agents')}
            className={`md:w-full flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
              activeTab === 'agents'
                ? 'bg-ink-0 text-ink-900 shadow-soft'
                : 'text-ink-600 hover:text-ink-800 hover:bg-ink-100/70'
            }`}
          >
            <Cpu className="w-4 h-4 text-mint-600" />
            <span>Agent Binaries</span>
          </button>

          <button
            onClick={() => setActiveTab('app')}
            className={`md:w-full flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
              activeTab === 'app'
                ? 'bg-ink-0 text-ink-900 shadow-soft'
                : 'text-ink-600 hover:text-ink-800 hover:bg-ink-100/70'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-butter-600" />
            <span>App & Workspace</span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl ">
          {/* TAB 1: AGENT BINARIES */}
          {activeTab === 'agents' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-mint-600" />
                  <span>Agent CLIs</span>
                </h2>
                <p className="text-xs text-ink-600 mt-1">
                  Paths to the agent CLIs. Smith runs each worker's turns through these, using the login you already have in each CLI.
                </p>
              </div>

              {/* Claude Code */}
              <div className="p-5 rounded-2xl bg-ink-0 shadow-soft space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-ink-800">Claude Code CLI</span>
                    <p className="text-[11px] text-ink-500">
                      Executable used for Anthropic Claude workers and interactive terminal login.
                    </p>
                  </div>
                  {detectedBinaries.claude && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, claude: detectedBinaries.claude }));
                        probeBinary('claude', detectedBinaries.claude);
                      }}
                      className="flex-shrink-0 whitespace-nowrap text-[10.5px] text-butter-700 flex items-center gap-1 px-2 py-0.5 rounded-full bg-butter-50 hover:bg-butter-100"
                    >
                      <Sparkles className="w-3 h-3 text-butter-600" />
                      <span>Use detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.claude || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, claude: e.target.value })}
                    placeholder="claude or ~/.claude/local/claude"
                    className="flex-1 bg-ink-50 rounded-xl px-3 py-2 text-xs text-ink-800 font-mono ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                  />
                  <button
                    onClick={() => probeBinary('claude', agentBinaries.claude)}
                    disabled={probeStatuses['claude']?.checking}
                    className="px-3 py-1.5 rounded-xl bg-ink-100 hover:bg-ink-100 border border-ink-300 text-xs text-ink-800 transition-colors flex items-center gap-1"
                  >
                    {probeStatuses['claude']?.checking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Verify</span>
                  </button>
                </div>

                {probeStatuses['claude'] && !probeStatuses['claude'].checking && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {probeStatuses['claude'].exists ? (
                      <span className="flex items-center gap-1 text-mint-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['claude'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Binary not found at this path</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* OpenAI Codex */}
              <div className="p-5 rounded-2xl bg-ink-0 shadow-soft space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-ink-800">OpenAI Codex CLI</span>
                    <p className="text-[11px] text-ink-500">
                      Executable used for OpenAI Codex agent workers and model dispatch.
                    </p>
                  </div>
                  {detectedBinaries.codex && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, codex: detectedBinaries.codex }));
                        probeBinary('codex', detectedBinaries.codex);
                      }}
                      className="flex-shrink-0 whitespace-nowrap text-[10.5px] text-butter-700 flex items-center gap-1 px-2 py-0.5 rounded-full bg-butter-50 hover:bg-butter-100"
                    >
                      <Sparkles className="w-3 h-3 text-butter-600" />
                      <span>Use detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.codex || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, codex: e.target.value })}
                    placeholder="codex or /opt/homebrew/bin/codex"
                    className="flex-1 bg-ink-50 rounded-xl px-3 py-2 text-xs text-ink-800 font-mono ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                  />
                  <button
                    onClick={() => probeBinary('codex', agentBinaries.codex)}
                    disabled={probeStatuses['codex']?.checking}
                    className="px-3 py-1.5 rounded-xl bg-ink-100 hover:bg-ink-100 border border-ink-300 text-xs text-ink-800 transition-colors flex items-center gap-1"
                  >
                    {probeStatuses['codex']?.checking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Verify</span>
                  </button>
                </div>

                {probeStatuses['codex'] && !probeStatuses['codex'].checking && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {probeStatuses['codex'].exists ? (
                      <span className="flex items-center gap-1 text-mint-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['codex'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Binary not found at this path</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* OpenCode */}
              <div className="p-5 rounded-2xl bg-ink-0 shadow-soft space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-ink-800">OpenCode CLI</span>
                    <p className="text-[11px] text-ink-500">
                      Executable path for OpenCode harness. Setting this enables OpenCode workers and models in sessions.
                    </p>
                  </div>
                  {detectedBinaries.opencode && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, opencode: detectedBinaries.opencode }));
                        probeBinary('opencode', detectedBinaries.opencode);
                      }}
                      className="flex-shrink-0 whitespace-nowrap text-[10.5px] text-butter-700 flex items-center gap-1 px-2 py-0.5 rounded-full bg-butter-50 hover:bg-butter-100"
                    >
                      <Sparkles className="w-3 h-3 text-butter-600" />
                      <span>Use detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.opencode || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, opencode: e.target.value })}
                    placeholder="opencode or ~/.opencode/bin/opencode"
                    className="flex-1 bg-ink-50 rounded-xl px-3 py-2 text-xs text-ink-800 font-mono ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                  />
                  <button
                    onClick={() => probeBinary('opencode', agentBinaries.opencode)}
                    disabled={probeStatuses['opencode']?.checking}
                    className="px-3 py-1.5 rounded-xl bg-ink-100 hover:bg-ink-100 border border-ink-300 text-xs text-ink-800 transition-colors flex items-center gap-1"
                  >
                    {probeStatuses['opencode']?.checking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Verify</span>
                  </button>
                </div>

                {probeStatuses['opencode'] && !probeStatuses['opencode'].checking && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {probeStatuses['opencode'].exists ? (
                      <span className="flex items-center gap-1 text-mint-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['opencode'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-butter-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>OpenCode not found at this path. OpenCode workers will remain disabled until configured.</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: APP & WORKSPACE */}
          {activeTab === 'app' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-butter-600" />
                  <span>General Application & Workspace Defaults</span>
                </h2>
                <p className="text-xs text-ink-600 mt-1">
                  Manage Git integration, project directory, port configurations, and cost telemetry.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-ink-0 shadow-soft space-y-4">
                {/* Git Binary Path */}
                <div>
                  <label className="text-xs font-semibold text-ink-800 block mb-1">
                    Git Executable Path
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={app.gitPath}
                      onChange={e => setApp({ ...app, gitPath: e.target.value })}
                      placeholder="git or /usr/bin/git"
                      className="flex-1 bg-ink-50 rounded-xl px-3 py-2 text-xs text-ink-800 font-mono ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                    />
                    <button
                      onClick={() => probeBinary('git', app.gitPath)}
                      disabled={probeStatuses['git']?.checking}
                      className="px-3 py-1.5 rounded-xl bg-ink-100 hover:bg-ink-100 border border-ink-300 text-xs text-ink-800 transition-colors flex items-center gap-1"
                    >
                      {probeStatuses['git']?.checking ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>Verify</span>
                    </button>
                  </div>
                  {probeStatuses['git'] && !probeStatuses['git'].checking && (
                    <div className="mt-1 text-xs">
                      {probeStatuses['git'].exists ? (
                        <span className="text-mint-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified: {probeStatuses['git'].resolvedPath}
                        </span>
                      ) : (
                        <span className="text-rose-600 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Git executable not found at path
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Default Repository Root */}
                <div>
                  <label className="text-xs font-semibold text-ink-800 block mb-1">
                    Default Repository / Workspace Root
                  </label>
                  <div className="relative flex items-center">
                    <FolderGit2 className="w-4 h-4 text-ink-500 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={app.defaultRepoPath}
                      onChange={e => setApp({ ...app, defaultRepoPath: e.target.value })}
                      placeholder="/Users/you/code"
                      className="w-full bg-ink-50 rounded-xl pl-8 pr-3 py-2 text-xs text-ink-800 font-mono ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                    />
                  </div>
                  <span className="text-[10px] text-ink-500 mt-1 block">
                    Pre-populated repository path when creating new sessions and worktrees.
                  </span>
                </div>

                {/* HTTP Port & Telemetry */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-ink-100">
                  <div>
                    <label className="text-xs font-semibold text-ink-800 block mb-1">
                      Server HTTP Port
                    </label>
                    <input
                      type="number"
                      value={app.port}
                      onChange={e => setApp({ ...app, port: Number(e.target.value) })}
                      className="w-full bg-ink-50 rounded-xl px-3 py-2 text-xs text-ink-800 font-mono ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-ink-800 block mb-1">
                      Display Currency
                    </label>
                    <select
                      value={app.currency}
                      onChange={e => setApp({ ...app, currency: e.target.value })}
                      className="w-full bg-ink-0 shadow-soft rounded-xl px-3 py-1.5 text-xs text-ink-800 focus:outline-none focus:border-ink-300"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-ink-800 block mb-1">
                      Budget Alert ($)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={app.budgetAlertThreshold}
                      onChange={e => setApp({ ...app, budgetAlertThreshold: Number(e.target.value) })}
                      className="w-full bg-ink-50 rounded-xl px-3 py-2 text-xs text-ink-800 font-mono ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
