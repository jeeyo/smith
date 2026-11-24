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

const live: Set<ChildProcess> = new Set();
const KILL_GRACE_MS = 5000;

/**
 * Spawns an agent CLI with its arguments passed as real argv entries.
 *
 * `spawn(bin, args, { shell: true })` joins args with spaces and hands the result to the
 * shell unescaped, so a multi-line prompt is word-split and its later lines run as commands.
 * A shell is only needed on Windows for .cmd/.bat shims, where each argument is quoted.
 *
 * On POSIX the CLI leads its own process group, so killTree can stop everything it started.
 */
export function spawnCli(bin: string, args: string[], options: SpawnOptions = {}): ChildProcess {
  let proc: ChildProcess;
  if (process.platform === 'win32') {
    const resolved = findOnPath(bin) || bin;
    proc = /\.(cmd|bat)$/i.test(resolved)
      ? spawn(quoteForCmd(resolved), args.map(quoteForCmd), { ...options, shell: true })
      : spawn(resolved, args, { ...options, shell: false });
  } else {
    proc = spawn(bin, args, { ...options, shell: false, detached: true });
  }
  live.add(proc);
  proc.on('exit', () => live.delete(proc));
  proc.on('error', () => live.delete(proc));
  return proc;
}

/** Stops a CLI and the shells, servers and test runners it started: SIGTERM, then SIGKILL. */
export function killTree(proc: ChildProcess) {
  const send = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== 'win32' && proc.pid) process.kill(-proc.pid, signal);
      else proc.kill(signal);
    } catch {
      // Already gone
    }
  };
  send('SIGTERM');
  setTimeout(() => send('SIGKILL'), KILL_GRACE_MS).unref();
}

/** Stops every CLI still running, when the server shuts down. */
export function killAllClis() {
  for (const proc of live) killTree(proc);
}

export interface CliResult {
  stdout: string;
  stderr: string;
  /** Exit code; 124 on timeout, 1 when the process could not be spawned. */
  code: number;
  timedOut: boolean;
  aborted?: boolean;
  spawnError?: string;
}

/**
 * Runs a CLI to completion with stdin closed, collecting output. Never rejects.
 */
export function runCli(
  bin: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; signal?: AbortSignal } = {}
): Promise<CliResult> {
  return new Promise<CliResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: CliResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => {
      killTree(proc);
      finish({ stdout, stderr, code: 130, timedOut: false, aborted: true });
    };

    if (options.signal?.aborted) {
      resolve({ stdout, stderr, code: 130, timedOut: false, aborted: true });
      return;
    }

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
      killTree(proc);
      finish({ stdout, stderr, code: 124, timedOut: true });
    }, options.timeoutMs ?? 120000);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => finish({ stdout, stderr, code: code ?? 0, timedOut: false }));
    proc.on('error', (err) => finish({ stdout, stderr: err.message, code: 1, timedOut: false, spawnError: err.message }));
  });
}
