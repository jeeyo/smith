import path from 'node:path';
import os from 'node:os';

export interface AppConfig {
  port: number;
  host: string;
  gitPath: string;
  hindsightUrl: string;
  hindsightApiKey: string;
  hindsightProvider: string;
  storageDir: string;
  homeDir: string;
}

const homeDir = os.homedir();
const defaultGitPath = process.platform === 'win32'
  ? 'C:\\Program Files\\Git\\cmd\\git.exe'
  : 'git';

export const config: AppConfig = {
  port: Number(process.env.PORT) || 4100,
  host: process.env.HOST || '0.0.0.0',
  gitPath: process.env.GIT_PATH || defaultGitPath,
  hindsightUrl: process.env.HINDSIGHT_URL || 'http://localhost:8888',
  hindsightApiKey: process.env.OPENAI_API_KEY || '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',
  hindsightProvider: process.env.HINDSIGHT_LLM_PROVIDER || 'openai',
  storageDir: path.join(homeDir, '.smith'),
  homeDir
};
