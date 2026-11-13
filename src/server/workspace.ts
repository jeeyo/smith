import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.ts';
import { worktreeManager } from './worktree-manager.ts';

const exec = promisify(execFile);

export function localPath(value: string): string {
  if (value === '~') return config.homeDir;
  return path.resolve(value.startsWith('~/') ? path.join(config.homeDir, value.slice(2)) : value);
}

export function listFolders(directory = config.homeDir, showHidden = false) {
  const current = fs.realpathSync(localPath(directory));
  const folders = fs.readdirSync(current, { withFileTypes: true })
    .filter(entry => (showHidden || !entry.name.startsWith('.')) && (entry.isDirectory() || entry.isSymbolicLink()))
    .flatMap(entry => {
      const full = path.join(current, entry.name);
      try { return fs.statSync(full).isDirectory() ? [{ name: entry.name, path: full, isRepository: fs.existsSync(path.join(full, '.git')) }] : []; }
      catch { return []; }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { path: current, parent: path.dirname(current) === current ? null : path.dirname(current), home: config.homeDir, folders };
}

export async function listBranches(repoPath: string) {
  const input = localPath(repoPath);
  await worktreeManager.ensureGitRepo(input);
  const repo = fs.realpathSync(input);
  const git = (args: string[]) => exec(config.gitPath || 'git', args, { cwd: repo, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  const [refs, head] = await Promise.all([
    git(['for-each-ref', '--format=%(refname:short)%00%(symref)', 'refs/heads', 'refs/remotes']),
    git(['branch', '--show-current'])
  ]);
  const branches = refs.stdout.split('\n').filter(Boolean).filter(line => !line.split('\0')[1]).map(line => line.split('\0')[0]);
  const current = head.stdout.trim();
  return { repoPath: repo, current, defaultBranch: branches.includes(current) ? current : branches[0] || '', branches };
}
