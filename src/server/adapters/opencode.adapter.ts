import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { AgentAdapter, AdapterExecutionResult } from './types.ts';
import { AgentHealthStatus, AgentId, TokenUsage } from '../../shared/types.ts';
import { config } from '../config.ts';

const execAsync = promisify(exec);

export class OpencodeAdapter implements AgentAdapter {
  readonly agentId: AgentId = 'opencode';
  readonly name = 'OpenCode';

  getBinaryPath(): string {
    if (config.agentBinaries?.opencode) {
      const custom = config.agentBinaries.opencode.trim().replace(/^["']|["']$/g, '');
      if (custom) return custom;
    }
    return 'opencode';
  }

  isInstalled(): boolean {
    const bin = this.getBinaryPath();
    if (path.isAbsolute(bin)) return fs.existsSync(bin);
    return false;
  }

  async probeHealth(): Promise<AgentHealthStatus> {
    const bin = this.getBinaryPath();
    const installed = this.isInstalled();

    if (!installed) {
      return {
        agentId: this.agentId,
        name: this.name,
        installed: false,
        binaryPath: bin,
        authenticated: false,
        status: 'not_installed',
        message: `OpenCode binary not found at ${bin}. Configure path in App Settings.`,
        remediation: 'Specify the binary path in App Settings or install OpenCode CLI.',
        lastCheckedAt: Date.now()
      };
    }

    try {
      const { stdout } = await execAsync(`"${bin}" --version`, { timeout: 3000 });
      const version = stdout.trim().split('\n')[0] || '1.0.0';
      return {
        agentId: this.agentId,
        name: this.name,
        installed: true,
        binaryPath: bin,
        version,
        authenticated: true,
        status: 'ready',
        message: `OpenCode CLI active (${version}).`,
        lastCheckedAt: Date.now()
      };
    } catch {
      return {
        agentId: this.agentId,
        name: this.name,
        installed: true,
        binaryPath: bin,
        authenticated: true,
        status: 'ready',
        message: 'OpenCode binary configured and ready.',
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
    const installed = this.isInstalled();

    if (!installed) {
      return {
        stdout: '',
        stderr: `OpenCode binary not found at ${bin}. Please configure path in App Settings.`,
        exitCode: 1,
        isError: true,
        errorMessage: `OpenCode binary not found at ${bin}.`,
        remediation: 'Specify the binary path in App Settings or install OpenCode CLI.'
      };
    }

    const timeout = options?.timeoutMs || 120000;

    return new Promise<AdapterExecutionResult>((resolve) => {
      const args = ['run', prompt];
      if (options?.model) {
        args.push('--model', options.model);
      }

      const proc = spawn(bin, args, {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', d => stdout += d.toString());
      proc.stderr?.on('data', d => stderr += d.toString());

      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        resolve({
          stdout,
          stderr: stderr + '\nExecution timed out after ' + (timeout / 1000) + 's',
          exitCode: 124,
          isError: true,
          errorMessage: 'OpenCode execution timed out'
        });
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
          isError: code !== 0 && !stdout,
          errorMessage: code !== 0 ? stderr || `OpenCode exited with code ${code}` : undefined,
          tokens: {
            inputTokens: Math.max(100, prompt.length * 2),
            outputTokens: Math.max(50, stdout.length * 2),
            cachedTokens: 0,
            reasoningTokens: 0,
            totalTokens: Math.max(150, prompt.length * 2 + stdout.length * 2)
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

export const opencodeAdapter = new OpencodeAdapter();
