import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { AppLevelConfig } from '../shared/types.ts';

export interface AppConfig {
  port: number;
  host: string;
  gitPath: string;
  hindsightUrl: string;
  hindsightApiKey: string;
  hindsightProvider: string;
  hindsightAutoStartDaemon?: boolean;
  hindsightDefaultBank?: string;
  defaultRepoPath?: string;
  currency?: string;
  budgetAlertThreshold?: number;
  agentBinaries: Record<string, string>;
  detectedBinaries: Record<string, string>;
  storageDir: string;
  homeDir: string;
  saveConfig: (updated: Partial<AppLevelConfig>) => void;
}

const homeDir = os.homedir();
const defaultGitPath = process.platform === 'win32'
  ? 'C:\\Program Files\\Git\\cmd\\git.exe'
  : 'git';

const storageDir = (process.env.VITEST || process.env.NODE_ENV === 'test')
  ? path.join(os.tmpdir(), 'smith-test-storage')
  : path.join(homeDir, '.smith');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

function findBinary(baseDir: string, targetName: string, maxDepth: number = 5): string | null {
  if (!fs.existsSync(baseDir)) return null;
  const search = (dir: string, depth: number): string | null => {
    if (depth > maxDepth) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.sort((a, b) => b.name.localeCompare(a.name));
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (!e.isDirectory() && e.name.toLowerCase() === targetName.toLowerCase()) {
          return full;
        }
        if (e.isDirectory()) {
          const found = search(full, depth + 1);
          if (found) return found;
        }
      }
    } catch {}
    return null;
  };
  return search(baseDir, 0);
}

function detectDefaultBinaries(): Record<string, string> {
  const detected: Record<string, string> = {};
  const localAppData = process.env.LOCALAPPDATA || '';
  const appData = process.env.APPDATA || '';

  // Git
  const gitPaths = [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    path.join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe')
  ];
  for (const gp of gitPaths) {
    if (fs.existsSync(gp)) {
      detected.git = gp;
      break;
    }
  }

  // Claude Code
  const claudeDir = path.join(localAppData, 'Claude-Data');
  if (fs.existsSync(claudeDir)) {
    try {
      const match = findBinary(claudeDir, 'claude.exe', 5);
      if (match) detected.claude = match;
    } catch {}
  }
  const npmClaude = path.join(appData, 'npm', 'claude.cmd');
  if (!detected.claude && fs.existsSync(npmClaude)) {
    detected.claude = npmClaude;
  }

  // Google Antigravity
  const agyPath = path.join(localAppData, 'Programs', 'antigravity', 'resources', 'bin', 'language_server.exe');
  if (fs.existsSync(agyPath)) detected.antigravity = agyPath;
  const agyCmd = path.join(appData, 'Antigravity', 'bin', 'agy-node.cmd');
  if (!detected.antigravity && fs.existsSync(agyCmd)) detected.antigravity = agyCmd;

  // OpenCode
  const npmOpencode = path.join(appData, 'npm', 'opencode.cmd');
  if (fs.existsSync(npmOpencode)) detected.opencode = npmOpencode;

  // OpenAI Codex
  const codexDir = path.join(localAppData, 'OpenAI', 'Codex');
  if (fs.existsSync(codexDir)) {
    try {
      const match = findBinary(codexDir, 'codex.exe', 5);
      if (match) detected.codex = match;
    } catch {}
  }
  const npmCodex = path.join(appData, 'npm', 'codex.cmd');
  if (!detected.codex && fs.existsSync(npmCodex)) {
    detected.codex = npmCodex;
  }

  // Astral uv
  const uvPath = path.join(localAppData, 'Programs', 'uv', 'uv.exe');
  const userUv = path.join(os.homedir(), '.local', 'bin', 'uv.exe');
  const cargoUv = path.join(os.homedir(), '.cargo', 'bin', 'uv.exe');
  if (fs.existsSync(uvPath)) detected.uv = uvPath;
  else if (fs.existsSync(userUv)) detected.uv = userUv;
  else if (fs.existsSync(cargoUv)) detected.uv = cargoUv;

  return detected;
}

const detected = detectDefaultBinaries();
const configFile = path.join(storageDir, 'config.json');

let persistedConfig: any = {};
if (fs.existsSync(configFile)) {
  try {
    persistedConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } catch {}
}

const initialAgentBinaries: Record<string, string> = {
  claude: persistedConfig.agentBinaries?.claude || detected.claude || 'claude',
  antigravity: persistedConfig.agentBinaries?.antigravity || detected.antigravity || 'language_server.exe',
  opencode: persistedConfig.agentBinaries?.opencode || detected.opencode || 'opencode',
  codex: (persistedConfig.agentBinaries?.codex && persistedConfig.agentBinaries.codex !== 'codex')
    ? persistedConfig.agentBinaries.codex
    : (detected.codex || persistedConfig.agentBinaries?.codex || 'codex'),
  uv: persistedConfig.agentBinaries?.uv || detected.uv || 'uv'
};

export const config: AppConfig = {
  port: Number(process.env.PORT) || persistedConfig.app?.port || 4100,
  host: process.env.HOST || '0.0.0.0',
  gitPath: process.env.GIT_PATH || persistedConfig.app?.gitPath || detected.git || defaultGitPath,
  hindsightUrl: process.env.HINDSIGHT_URL || persistedConfig.hindsight?.url || 'http://localhost:8888',
  hindsightApiKey: process.env.OPENAI_API_KEY || persistedConfig.hindsight?.apiKey || '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',
  hindsightProvider: process.env.HINDSIGHT_LLM_PROVIDER || persistedConfig.hindsight?.provider || 'openai',
  hindsightAutoStartDaemon: persistedConfig.hindsight?.autoStartDaemon ?? true,
  hindsightDefaultBank: persistedConfig.hindsight?.defaultBank || 'smith-ade-global',
  defaultRepoPath: persistedConfig.app?.defaultRepoPath || '',
  currency: persistedConfig.app?.currency || 'USD',
  budgetAlertThreshold: persistedConfig.app?.budgetAlertThreshold ?? 20,
  agentBinaries: initialAgentBinaries,
  detectedBinaries: detected,
  storageDir,
  homeDir,
  saveConfig: (updated: Partial<AppLevelConfig>) => {
    if (updated.agentBinaries) {
      config.agentBinaries = { ...config.agentBinaries, ...updated.agentBinaries };
    }
    if (updated.hindsight) {
      if (updated.hindsight.url) config.hindsightUrl = updated.hindsight.url;
      if (updated.hindsight.apiKey !== undefined) config.hindsightApiKey = updated.hindsight.apiKey;
      if (updated.hindsight.provider) config.hindsightProvider = updated.hindsight.provider;
      if (updated.hindsight.autoStartDaemon !== undefined) config.hindsightAutoStartDaemon = updated.hindsight.autoStartDaemon;
      if (updated.hindsight.defaultBank) config.hindsightDefaultBank = updated.hindsight.defaultBank;
    }
    if (updated.app) {
      if (updated.app.gitPath) config.gitPath = updated.app.gitPath;
      if (updated.app.defaultRepoPath !== undefined) config.defaultRepoPath = updated.app.defaultRepoPath;
      if (updated.app.port) config.port = updated.app.port;
      if (updated.app.currency) config.currency = updated.app.currency;
      if (updated.app.budgetAlertThreshold !== undefined) config.budgetAlertThreshold = updated.app.budgetAlertThreshold;
    }

    try {
      const toPersist: AppLevelConfig = {
        agentBinaries: config.agentBinaries,
        hindsight: {
          provider: config.hindsightProvider,
          apiKey: config.hindsightApiKey,
          url: config.hindsightUrl,
          autoStartDaemon: config.hindsightAutoStartDaemon ?? true,
          defaultBank: config.hindsightDefaultBank || 'smith-ade-global'
        },
        app: {
          gitPath: config.gitPath,
          defaultRepoPath: config.defaultRepoPath || '',
          port: config.port,
          theme: 'dark',
          currency: config.currency || 'USD',
          budgetAlertThreshold: config.budgetAlertThreshold ?? 20
        }
      };
      fs.writeFileSync(configFile, JSON.stringify(toPersist, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist config', err);
    }
  }
};
