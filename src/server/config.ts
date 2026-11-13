import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { AppLevelConfig } from '../shared/types.ts';
import { findOnPath } from './process-utils.ts';

export interface AppConfig {
  port: number;
  host: string;
  gitPath: string;
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

// Tests must never read or write the user's real ~/.smith.
const storageDir = process.env.SMITH_STORAGE_DIR
  || ((process.env.VITEST || process.env.NODE_ENV === 'test')
    ? path.join(os.tmpdir(), `smith-test-storage-${process.pid}`)
    : path.join(homeDir, '.smith'));
fs.mkdirSync(storageDir, { recursive: true });

// A desktop app launched from Finder gets a minimal PATH, so the places agent CLIs are
// usually installed are added before anything is looked up.
const extraPathDirs = [
  path.join(homeDir, '.local', 'bin'),
  path.join(homeDir, '.claude', 'local'),
  path.join(homeDir, '.opencode', 'bin'),
  path.join(homeDir, '.bun', 'bin'),
  path.join(homeDir, '.npm-global', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin'
];
{
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const missing = extraPathDirs.filter(dir => !current.includes(dir) && fs.existsSync(dir));
  if (missing.length > 0) process.env.PATH = [...current, ...missing].join(path.delimiter);
}

function detectDefaultBinaries(): Record<string, string> {
  const detected: Record<string, string> = {};
  for (const name of ['git', 'claude', 'codex', 'opencode']) {
    const found = findOnPath(name);
    if (found) detected[name] = found;
  }
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

const HARNESS_KEYS = ['claude', 'codex', 'opencode'];

function pickBinaries(source: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of HARNESS_KEYS) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return out;
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || persistedConfig.app?.port || 4100,
  host: process.env.HOST || '127.0.0.1',
  gitPath: process.env.GIT_PATH || persistedConfig.app?.gitPath || detected.git || 'git',
  defaultRepoPath: persistedConfig.app?.defaultRepoPath || '',
  currency: persistedConfig.app?.currency || 'USD',
  budgetAlertThreshold: persistedConfig.app?.budgetAlertThreshold ?? 20,
  agentBinaries: {
    claude: detected.claude || 'claude',
    codex: detected.codex || 'codex',
    opencode: detected.opencode || 'opencode',
    ...pickBinaries(persistedConfig.agentBinaries)
  },
  detectedBinaries: detected,
  storageDir,
  homeDir,
  saveConfig: (updated: Partial<AppLevelConfig>) => {
    if (updated.agentBinaries) {
      config.agentBinaries = { ...config.agentBinaries, ...pickBinaries(updated.agentBinaries) };
    }
    if (updated.app) {
      if (updated.app.gitPath) config.gitPath = updated.app.gitPath;
      if (updated.app.defaultRepoPath !== undefined) config.defaultRepoPath = updated.app.defaultRepoPath;
      if (updated.app.port) config.port = updated.app.port;
      if (updated.app.currency) config.currency = updated.app.currency;
      if (updated.app.budgetAlertThreshold !== undefined) config.budgetAlertThreshold = updated.app.budgetAlertThreshold;
    }

    try {
      fs.writeFileSync(configFile, JSON.stringify(publicConfig(), null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist config', err);
    }
  }
};

/** The configuration as stored on disk and returned by the API. */
export function publicConfig(): AppLevelConfig {
  return {
    agentBinaries: config.agentBinaries,
    app: {
      gitPath: config.gitPath,
      defaultRepoPath: config.defaultRepoPath || '',
      port: config.port,
      theme: 'dark',
      currency: config.currency || 'USD',
      budgetAlertThreshold: config.budgetAlertThreshold ?? 20
    },
    detectedBinaries: config.detectedBinaries
  };
}
