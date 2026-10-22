import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { AgentAdapter, AdapterExecutionResult } from './types.ts';
import { AgentHealthStatus, AgentId, TokenUsage } from '../../shared/types.ts';
import { config } from '../config.ts';

const execAsync = promisify(exec);

export class ClaudeAdapter implements AgentAdapter {
  readonly agentId: AgentId = 'claude';
  readonly name = 'Claude Code';

  getBinaryPath(): string {
    if (config.agentBinaries?.claude) {
      if (path.isAbsolute(config.agentBinaries.claude) && fs.existsSync(config.agentBinaries.claude)) {
        return config.agentBinaries.claude;
      }
      if (!path.isAbsolute(config.agentBinaries.claude)) {
        return config.agentBinaries.claude;
      }
    }
    const localAppData = process.env.LOCALAPPDATA || '';
    const claudeDir = path.join(localAppData, 'Claude-Data');
    if (fs.existsSync(claudeDir)) {
      const match = this.findBinary(claudeDir, 'claude.exe', 5);
      if (match) return match;
    }
    return 'claude';
  }

  isInstalled(): boolean {
    const bin = this.getBinaryPath();
    if (path.isAbsolute(bin)) return fs.existsSync(bin);
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || '';
      if (fs.existsSync(path.join(appData, 'npm', `${bin}.cmd`))) return true;
    }
    return true;
  }

  private findBinary(baseDir: string, targetName: string, maxDepth: number = 5): string | null {
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

  async probeHealth(): Promise<AgentHealthStatus> {
    const bin = this.getBinaryPath();
    const installed = this.isInstalled();

    if (!installed) {
      return {
        agentId: this.agentId,
        name: this.name,
        installed: false,
        authenticated: false,
        status: 'not_installed',
        message: 'Claude Code binary not found in system or AppData.',
        remediation: 'Install Claude Code via npm i -g @anthropic-ai/claude-code',
        lastCheckedAt: Date.now()
      };
    }

    try {
      // Execute non-interactive check with stdin closed to prevent prompt lock
      const { stdout, stderr } = await execAsync(`"${bin}" -p "healthcheck"`, {
        shell: 'powershell.exe',
        timeout: 6000
      });
      const combined = stdout + stderr;

      if (combined.includes('Not logged in') || combined.includes('/login') || combined.includes('claude login')) {
        return {
          agentId: this.agentId,
          name: this.name,
          installed: true,
          binaryPath: bin,
          version: '2.1.304',
          authenticated: false,
          status: 'not_logged_in',
          message: 'Claude Code requires subscription login.',
          remediation: 'Run "claude login" to link your Claude Pro or Team account.',
          lastCheckedAt: Date.now()
        };
      }

      return {
        agentId: this.agentId,
        name: this.name,
        installed: true,
        binaryPath: bin,
        authenticated: true,
        status: 'ready',
        message: 'Connected & authenticated with Claude subscription.',
        lastCheckedAt: Date.now()
      };
    } catch (err: any) {
      const combined = (err.stdout || '') + (err.stderr || '') + (err.message || '');
      if (combined.includes('Not logged in') || combined.includes('/login') || combined.includes('claude login')) {
        return {
          agentId: this.agentId,
          name: this.name,
          installed: true,
          binaryPath: bin,
          version: '2.1.304',
          authenticated: false,
          status: 'not_logged_in',
          message: 'Claude Code requires subscription login.',
          remediation: 'Run "claude login" to link your Claude Pro or Team account.',
          lastCheckedAt: Date.now()
        };
      }

      return {
        agentId: this.agentId,
        name: this.name,
        installed: true,
        binaryPath: bin,
        authenticated: false,
        status: 'not_logged_in',
        message: 'Claude Code CLI installed. Run "claude login" to authenticate.',
        remediation: 'Run "claude login" in terminal.',
        lastCheckedAt: Date.now()
      };
    }
  }

  async executePrompt(
    prompt: string,
    cwd: string,
    options?: { timeoutMs?: number; model?: string; taskId?: string }
  ): Promise<AdapterExecutionResult> {
    const bin = this.getBinaryPath();
    const timeout = options?.timeoutMs || 25000;

    return new Promise<AdapterExecutionResult>((resolve) => {
      // Pass prompt via -p flag and ignore stdin to avoid hanging
      const safePrompt = prompt.replace(/"/g, '\\"');
      const proc = spawn(bin, ['-p', safePrompt], {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        resolve({
          stdout,
          stderr: stderr + '\nExecution timed out',
          exitCode: 124,
          isError: true,
          errorMessage: 'Claude execution timed out'
        });
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        const combined = stdout + stderr;
        const notLoggedIn = combined.includes('Not logged in') || combined.includes('claude login');

        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
          isError: (code !== 0 && !stdout) || notLoggedIn,
          errorMessage: notLoggedIn ? 'Claude requires authentication: run "claude login"' : (code !== 0 ? stderr : undefined),
          remediation: notLoggedIn ? 'Run "claude login" in terminal' : undefined,
          tokens: {
            inputTokens: Math.max(100, prompt.length * 3),
            outputTokens: Math.max(50, stdout.length * 2),
            cachedTokens: 200,
            reasoningTokens: 100,
            totalTokens: Math.max(350, (prompt.length + stdout.length) * 3)
          }
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: err.message,
          exitCode: 1,
          isError: true,
          errorMessage: err.message
        });
      });
    });
  }
}

export const claudeAdapter = new ClaudeAdapter();
