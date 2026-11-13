import fs from 'node:fs';
import path from 'node:path';
import { AgentHealthStatus } from '../../shared/types.ts';
import { HarnessId } from '../../shared/board.ts';
import { config } from '../config.ts';
import { findOnPath, runCli } from '../process-utils.ts';

export function configuredBinary(harness: HarnessId): string {
  const custom = (config.agentBinaries?.[harness] || '').trim().replace(/^["']|["']$/g, '');
  return custom || harness;
}

export function binaryInstalled(bin: string): boolean {
  return path.isAbsolute(bin) ? fs.existsSync(bin) : findOnPath(bin) !== null;
}

/** Health from `--version` alone: proves the CLI runs without spending any usage. */
export async function versionProbe(harness: HarnessId, name: string, bin: string, installHint: string): Promise<AgentHealthStatus> {
  if (!binaryInstalled(bin)) {
    return {
      agentId: harness,
      name,
      installed: false,
      binaryPath: bin,
      authenticated: false,
      status: 'not_installed',
      message: `${name} was not found (${bin}).`,
      remediation: installHint,
      lastCheckedAt: Date.now()
    };
  }
  const res = await runCli(bin, ['--version'], { timeoutMs: 8000 });
  if (res.code !== 0) {
    return {
      agentId: harness,
      name,
      installed: true,
      binaryPath: bin,
      authenticated: false,
      status: 'error',
      message: `${name} did not start: ${(res.stderr || res.stdout || `exit ${res.code}`).trim().slice(0, 200)}`,
      remediation: 'Check the binary path in App Settings.',
      lastCheckedAt: Date.now()
    };
  }
  const version = (res.stdout.trim().split('\n')[0] || '').replace(/^[^\d]*/, '').split(/\s/)[0];
  return {
    agentId: harness,
    name,
    installed: true,
    binaryPath: bin,
    version: version || undefined,
    // Login is only known for certain once a turn runs; a logged-out turn updates this.
    authenticated: true,
    status: 'ready',
    message: `${name} is installed${version ? ` (${version})` : ''}.`,
    lastCheckedAt: Date.now()
  };
}

const LIMIT_PATTERNS = [/usage limit/i, /rate limit/i, /limit reached/i, /hit your (usage )?limit/i, /quota exceeded/i, /out of (usage|credits)/i];
const LOGIN_PATTERNS = [/not logged in/i, /please run .*login/i, /failed to authenticate/i, /oauth (token|session).*(expired|invalid)/i, /invalid api key/i, /unauthorized/i];

/**
 * Recognises a usage-limit message in CLI output and, when it can, when the limit resets.
 * This is text matching: it breaks if a CLI rewords its message, in which case the turn is
 * reported as an ordinary failure.
 */
export function detectUsageLimit(output: string, now: number = Date.now()): { message: string; resetAt?: number } | undefined {
  if (!LIMIT_PATTERNS.some(p => p.test(output))) return undefined;
  const line = output.split('\n').find(l => LIMIT_PATTERNS.some(p => p.test(l))) || output;
  const message = line.trim().slice(0, 300);

  // "…|1763049600": an epoch in seconds.
  const epoch = output.match(/\|(\d{10})\b/);
  if (epoch) return { message, resetAt: Number(epoch[1]) * 1000 };

  // "resets at 3pm", "try again at 8:30 PM", "resets 3:00am"
  const clock = output.match(/(?:reset[s]?|try again)(?: at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (clock) {
    let hour = Number(clock[1]) % 12;
    if (clock[3].toLowerCase() === 'pm') hour += 12;
    const at = new Date(now);
    at.setHours(hour, Number(clock[2] || 0), 0, 0);
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);
    return { message, resetAt: at.getTime() };
  }

  // "try again in 2 hours 15 minutes", "resets in 45 minutes"
  const span = output.match(/\b(?:in|after)\s+(?:(\d+)\s*h(?:ours?|rs?)?\b\s*(?:and\s+)?(?:(\d+)\s*m(?:in(?:ute)?s?)?\b)?|(\d+)\s*m(?:in(?:ute)?s?)?\b)/i);
  if (span) {
    const hours = Number(span[1] || 0);
    const minutes = Number(span[2] || span[3] || 0);
    return { message, resetAt: now + (hours * 60 + minutes) * 60_000 };
  }
  return { message };
}

export function detectNotLoggedIn(output: string): boolean {
  return LOGIN_PATTERNS.some(p => p.test(output));
}
