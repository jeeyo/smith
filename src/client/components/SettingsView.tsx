import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Check,
  RefreshCw,
  Cpu,
  Brain,
  SlidersHorizontal,
  Eye,
  EyeOff,
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
  const [activeTab, setActiveTab] = useState<'agents' | 'hindsight' | 'app'>('agents');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form State
  const [agentBinaries, setAgentBinaries] = useState<Record<string, string>>({
    claude: 'claude',
    antigravity: 'language_server.exe',
    opencode: 'opencode',
    codex: 'codex',
    uv: 'uv'
  });

  const [hindsight, setHindsight] = useState({
    provider: 'openai',
    apiKey: '',
    url: 'http://localhost:8888',
    autoStartDaemon: true,
    defaultBank: 'smith-ade-global'
  });

  const [app, setApp] = useState({
    gitPath: 'git',
    defaultRepoPath: '',
    port: 3001,
    theme: 'dark' as 'dark' | 'light' | 'system',
    currency: 'USD',
    budgetAlertThreshold: 20
  });

  const [detectedBinaries, setDetectedBinaries] = useState<Record<string, string>>({});

  // Binary probe statuses
  const [probeStatuses, setProbeStatuses] = useState<Record<string, { checking: boolean; exists?: boolean; resolvedPath?: string }>>({});

  // Hindsight test state
  const [hindsightTest, setHindsightTest] = useState<{
    testing: boolean;
    tested: boolean;
    success?: boolean;
    status?: string;
    latencyMs?: number;
    message?: string;
  }>({ testing: false, tested: false });

  // Fetch initial config from server
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/system/config');
      const data = await res.json();
      if (data.agentBinaries) setAgentBinaries(data.agentBinaries);
      if (data.hindsight) setHindsight(data.hindsight);
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

  const handleTestHindsight = async () => {
    setHindsightTest({ testing: true, tested: false });
    try {
      const res = await fetch('/api/v1/system/config/test-hindsight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: hindsight.url,
          apiKey: hindsight.apiKey,
          provider: hindsight.provider
        })
      });
      const data = await res.json();
      setHindsightTest({
        testing: false,
        tested: true,
        success: data.success,
        status: data.status,
        latencyMs: data.latencyMs,
        message: data.message
      });
    } catch (err: any) {
      setHindsightTest({
        testing: false,
        tested: true,
        success: false,
        status: 'offline',
        message: err.message
      });
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
          hindsight,
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
    setHindsight(prev => ({
      ...prev,
      url: 'http://localhost:8888',
      provider: 'openai',
      defaultBank: 'smith-ade-global'
    }));
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-14 border-b border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between bg-zinc-950/80 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-zinc-800 transition-colors"
            title="Back to Chat"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
              <span>Application Configuration</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                Global
              </span>
            </h1>
            <p className="text-[11px] text-zinc-500 hidden sm:block">
              Manage agent binary paths, Vectorize Hindsight daemon, and workspace defaults.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2 py-1 rounded bg-emerald-950/40 border border-emerald-900/60 animate-fade-in">
              <Check className="w-3.5 h-3.5" />
              <span>Saved Successfully</span>
            </span>
          )}

          <button
            onClick={handleResetDefaults}
            className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
          >
            Reset Defaults
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Main Settings Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Settings Navigation Tabs */}
        <div className="w-48 sm:w-56 border-r border-zinc-800/80 bg-zinc-950/40 p-3 space-y-1 flex-shrink-0">
          <button
            onClick={() => setActiveTab('agents')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === 'agents'
                ? 'bg-zinc-850 text-zinc-100 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Agent Binaries</span>
          </button>

          <button
            onClick={() => setActiveTab('hindsight')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === 'hindsight'
                ? 'bg-zinc-850 text-zinc-100 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <Brain className="w-4 h-4 text-indigo-400" />
            <span>Vectorize Hindsight</span>
          </button>

          <button
            onClick={() => setActiveTab('app')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === 'app'
                ? 'bg-zinc-850 text-zinc-100 border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <span>App & Workspace</span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl scrollbar-thin scrollbar-thumb-zinc-800">
          {/* TAB 1: AGENT BINARIES */}
          {activeTab === 'agents' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Agent Executable & Harness Paths</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Specify exact paths to your agent CLIs and harnesses. Smith launches these executables for ACP workers and background coordination.
                </p>
              </div>

              {/* Claude Code */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-200">Claude Code CLI</span>
                    <p className="text-[11px] text-zinc-500">
                      Executable used for Anthropic Claude workers and interactive terminal login.
                    </p>
                  </div>
                  {detectedBinaries.claude && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, claude: detectedBinaries.claude }));
                        probeBinary('claude', detectedBinaries.claude);
                      }}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-750"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Use Auto-Detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.claude || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, claude: e.target.value })}
                    placeholder="claude or C:\Users\...\AppData\Roaming\npm\claude.cmd"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    onClick={() => probeBinary('claude', agentBinaries.claude)}
                    disabled={probeStatuses['claude']?.checking}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs text-zinc-200 transition-colors flex items-center gap-1"
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
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['claude'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Binary not found at this path</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* OpenAI Codex */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-200">OpenAI Codex CLI</span>
                    <p className="text-[11px] text-zinc-500">
                      Executable used for OpenAI Codex agent workers and model dispatch.
                    </p>
                  </div>
                  {detectedBinaries.codex && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, codex: detectedBinaries.codex }));
                        probeBinary('codex', detectedBinaries.codex);
                      }}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-750"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Use Auto-Detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.codex || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, codex: e.target.value })}
                    placeholder="codex or C:\Users\...\AppData\Local\OpenAI\Codex\bin\...\codex.exe"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    onClick={() => probeBinary('codex', agentBinaries.codex)}
                    disabled={probeStatuses['codex']?.checking}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs text-zinc-200 transition-colors flex items-center gap-1"
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
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['codex'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Binary not found at this path</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Google Antigravity */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-200">Google Antigravity Language Server / CLI</span>
                    <p className="text-[11px] text-zinc-500">
                      Executable for Google Antigravity daemon or `agy` CLI binary.
                    </p>
                  </div>
                  {detectedBinaries.antigravity && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, antigravity: detectedBinaries.antigravity }));
                        probeBinary('antigravity', detectedBinaries.antigravity);
                      }}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-750"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Use Auto-Detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.antigravity || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, antigravity: e.target.value })}
                    placeholder="language_server.exe or agy-node.cmd"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    onClick={() => probeBinary('antigravity', agentBinaries.antigravity)}
                    disabled={probeStatuses['antigravity']?.checking}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs text-zinc-200 transition-colors flex items-center gap-1"
                  >
                    {probeStatuses['antigravity']?.checking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Verify</span>
                  </button>
                </div>

                {probeStatuses['antigravity'] && !probeStatuses['antigravity'].checking && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {probeStatuses['antigravity'].exists ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['antigravity'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Binary not found at this path</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* OpenCode */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-200">OpenCode CLI</span>
                    <p className="text-[11px] text-zinc-500">
                      Executable path for OpenCode harness. Setting this enables OpenCode workers and models in sessions.
                    </p>
                  </div>
                  {detectedBinaries.opencode && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, opencode: detectedBinaries.opencode }));
                        probeBinary('opencode', detectedBinaries.opencode);
                      }}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-750"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Use Auto-Detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.opencode || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, opencode: e.target.value })}
                    placeholder="opencode or C:\...\opencode.exe"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    onClick={() => probeBinary('opencode', agentBinaries.opencode)}
                    disabled={probeStatuses['opencode']?.checking}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs text-zinc-200 transition-colors flex items-center gap-1"
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
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['opencode'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>OpenCode not found at this path. OpenCode workers will remain disabled until configured.</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Astral UV */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-200">Astral uv / uvx</span>
                    <p className="text-[11px] text-zinc-500">
                      Required for embedded Vectorize Hindsight daemon (`uvx hindsight-embed`) and Python tools.
                    </p>
                  </div>
                  {detectedBinaries.uv && (
                    <button
                      onClick={() => {
                        setAgentBinaries(prev => ({ ...prev, uv: detectedBinaries.uv }));
                        probeBinary('uv', detectedBinaries.uv);
                      }}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-750"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Use Auto-Detected</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={agentBinaries.uv || ''}
                    onChange={e => setAgentBinaries({ ...agentBinaries, uv: e.target.value })}
                    placeholder="uv or C:\Users\...\.local\bin\uv.exe"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    onClick={() => probeBinary('uv', agentBinaries.uv)}
                    disabled={probeStatuses['uv']?.checking}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs text-zinc-200 transition-colors flex items-center gap-1"
                  >
                    {probeStatuses['uv']?.checking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Verify</span>
                  </button>
                </div>

                {probeStatuses['uv'] && !probeStatuses['uv'].checking && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {probeStatuses['uv'].exists ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Executable Verified: {probeStatuses['uv'].resolvedPath}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>uv binary not found at this path</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VECTORIZE HINDSIGHT */}
          {activeTab === 'hindsight' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <span>Vectorize Hindsight Memory Engine</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Configure the official Vectorize Hindsight daemon for episodic memory, facts, mental models, and anti-pattern recovery.
                </p>
              </div>

              {/* Provider & API Key */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block mb-1">
                      Hindsight LLM Provider
                    </label>
                    <select
                      value={hindsight.provider}
                      onChange={e => setHindsight({ ...hindsight, provider: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    >
                      <option value="openai">OpenAI (GPT-4o, GPT-4.1)</option>
                      <option value="anthropic">Anthropic (Claude Sonnet / Opus)</option>
                      <option value="gemini">Google Gemini (2.5 Pro / Flash)</option>
                      <option value="ollama">Ollama (Local LLM)</option>
                      <option value="azure">Azure OpenAI</option>
                      <option value="custom">Custom Provider</option>
                    </select>
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Used by Hindsight for autonomous reflection and fact indexing.
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block mb-1">
                      Default Knowledge Bank
                    </label>
                    <input
                      type="text"
                      value={hindsight.defaultBank}
                      onChange={e => setHindsight({ ...hindsight, defaultBank: e.target.value })}
                      placeholder="smith-ade-global"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Primary memory bank for cross-session facts and project knowledge.
                    </span>
                  </div>
                </div>

                {/* API Key */}
                <div>
                  <label className="text-xs font-semibold text-zinc-200 block mb-1">
                    Provider API Key / Secret Token
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={hindsight.apiKey}
                      onChange={e => setHindsight({ ...hindsight, apiKey: e.target.value })}
                      placeholder="sk-proj-..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 pr-10 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    Passes to embedded Hindsight daemon as `HINDSIGHT_API_LLM_API_KEY`.
                  </span>
                </div>
              </div>

              {/* Endpoint & Daemon options */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-200 block mb-1">
                    Hindsight Server URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={hindsight.url}
                      onChange={e => setHindsight({ ...hindsight, url: e.target.value })}
                      placeholder="http://127.0.0.1:8888"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                    />
                    <button
                      onClick={handleTestHindsight}
                      disabled={hindsightTest.testing}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs text-zinc-200 transition-colors flex items-center gap-1.5"
                    >
                      {hindsightTest.testing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Brain className="w-3.5 h-3.5 text-indigo-400" />
                      )}
                      <span>Test Connection</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    URL of the local embedded daemon or remote Vectorize Hindsight cluster.
                  </span>
                </div>

                {/* Connection Test Banner */}
                {hindsightTest.tested && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                      hindsightTest.success
                        ? 'bg-emerald-950/40 border-emerald-900/60 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-900/60 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {hindsightTest.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span>{hindsightTest.message}</span>
                    </div>
                    {hindsightTest.latencyMs !== undefined && (
                      <span className="text-[11px] font-mono opacity-80">
                        {hindsightTest.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-800/80">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hindsight.autoStartDaemon}
                      onChange={e => setHindsight({ ...hindsight, autoStartDaemon: e.target.checked })}
                      className="rounded bg-zinc-950 border-zinc-800 text-indigo-500 focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-semibold text-zinc-200">
                        Auto-start Embedded Daemon (`uvx hindsight-embed`)
                      </span>
                      <p className="text-[11px] text-zinc-500">
                        Smith will automatically supervise and launch the official Hindsight server on app startup.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: APP & WORKSPACE */}
          {activeTab === 'app' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                  <span>General Application & Workspace Defaults</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Manage Git integration, project directory, port configurations, and cost telemetry.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                {/* Git Binary Path */}
                <div>
                  <label className="text-xs font-semibold text-zinc-200 block mb-1">
                    Git Executable Path
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={app.gitPath}
                      onChange={e => setApp({ ...app, gitPath: e.target.value })}
                      placeholder="C:\Program Files\Git\cmd\git.exe or git"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                    />
                    <button
                      onClick={() => probeBinary('git', app.gitPath)}
                      disabled={probeStatuses['git']?.checking}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs text-zinc-200 transition-colors flex items-center gap-1"
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
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified: {probeStatuses['git'].resolvedPath}
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Git executable not found at path
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Default Repository Root */}
                <div>
                  <label className="text-xs font-semibold text-zinc-200 block mb-1">
                    Default Repository / Workspace Root
                  </label>
                  <div className="relative flex items-center">
                    <FolderGit2 className="w-4 h-4 text-zinc-500 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={app.defaultRepoPath}
                      onChange={e => setApp({ ...app, defaultRepoPath: e.target.value })}
                      placeholder="C:\path\to\your\workspace"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    Pre-populated repository path when creating new sessions and worktrees.
                  </span>
                </div>

                {/* HTTP Port & Telemetry */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-zinc-800/80">
                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block mb-1">
                      Server HTTP Port
                    </label>
                    <input
                      type="number"
                      value={app.port}
                      onChange={e => setApp({ ...app, port: Number(e.target.value) })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block mb-1">
                      Display Currency
                    </label>
                    <select
                      value={app.currency}
                      onChange={e => setApp({ ...app, currency: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block mb-1">
                      Budget Alert ($)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={app.budgetAlertThreshold}
                      onChange={e => setApp({ ...app, budgetAlertThreshold: Number(e.target.value) })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
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
