import { AgentId, AgentHealthStatus, TokenUsage } from '../../shared/types.ts';

export interface AdapterExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  tokens?: TokenUsage;
  costUsd?: number;
  isError: boolean;
  errorMessage?: string;
  remediation?: string;
}

export interface AgentAdapter {
  readonly agentId: AgentId;
  readonly name: string;
  getBinaryPath(): string;
  isInstalled(): boolean;
  probeHealth(): Promise<AgentHealthStatus>;
  executePrompt(
    prompt: string,
    cwd: string,
    options?: {
      timeoutMs?: number;
      model?: string;
      taskId?: string;
    }
  ): Promise<AdapterExecutionResult>;
}
