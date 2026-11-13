import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess, SpawnOptions } from 'node:child_process';

/**
 * Resolves a bare command name against PATH without invoking a shell.
 * Returns the absolute path of the first match, or null.
 */
export function findOnPath(command: string): string | null {
  if (!command) return null;
  if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    return fs.existsSync(command) ? path.resolve(command) : null;
  }

  const isWin = process.platform === 'win32';
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = isWin
    ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)]
    : [''];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Not in this directory
      }
    }
  }
  return null;
}

function quoteForCmd(arg: string): string {
  // cmd.exe cannot carry newlines in an argument; collapse them and escape quotes.
  return `"${arg.replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
}

/**
 * Spawns an agent CLI with its arguments passed as real argv entries.
 *
 * `spawn(bin, args, { shell: true })` joins args with spaces and hands the result to the
 * shell unescaped, so a multi-line prompt is word-split and its later lines run as commands.
 * A shell is only needed on Windows for .cmd/.bat shims, where each argument is quoted.
 */
export function spawnCli(bin: string, args: string[], options: SpawnOptions = {}): ChildProcess {
  if (process.platform === 'win32') {
    const resolved = findOnPath(bin) || bin;
    if (/\.(cmd|bat)$/i.test(resolved)) {
      return spawn(quoteForCmd(resolved), args.map(quoteForCmd), { ...options, shell: true });
    }
    return spawn(resolved, args, { ...options, shell: false });
  }
  return spawn(bin, args, { ...options, shell: false });
}

export interface CliResult {
  stdout: string;
  stderr: string;
  /** Exit code; 124 on timeout, 1 when the process could not be spawned. */
  code: number;
  timedOut: boolean;
  spawnError?: string;
}

/**
 * Runs a CLI to completion with stdin closed, collecting output. Never rejects.
 */
export function runCli(
  bin: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {}
): Promise<CliResult> {
  return new Promise<CliResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: CliResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let proc: ChildProcess;
    try {
      proc = spawnCli(bin, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options.env ? { ...process.env, ...options.env } : process.env
      });
    } catch (err: any) {
      resolve({ stdout, stderr: err.message, code: 1, timedOut: false, spawnError: err.message });
      return;
    }

    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
      finish({ stdout, stderr, code: 124, timedOut: true });
    }, options.timeoutMs ?? 120000);

    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => finish({ stdout, stderr, code: code ?? 0, timedOut: false }));
    proc.on('error', (err) => finish({ stdout, stderr: err.message, code: 1, timedOut: false, spawnError: err.message }));
  });
}
