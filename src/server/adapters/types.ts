import { AgentHealthStatus, TokenUsage } from '../../shared/types.ts';
import { HarnessId } from '../../shared/board.ts';
import type { ResolvedServer } from '../catalog.ts';

export interface TurnRequest {
  /** Everything the peer is told for this turn. */
  prompt: string;
  /** Directory the CLI starts in. */
  cwd: string;
  model: string;
  /** The board's MCP endpoint and this turn's bearer token. */
  mcp: { url: string; token: string; name?: 'board' | 'smith' };
  timeoutMs: number;
  /** Extra MCP servers the session enabled, started by the CLI for this turn. */
  extraMcpServers?: ResolvedServer[];
}

export interface TurnResult {
  ok: boolean;
  /** The CLI's final text, for the turn log. */
  text: string;
  error?: string;
  timedOut?: boolean;
  /** Set when the harness reported that the subscription's usage limit is reached. */
  usageLimit?: { message: string; resetAt?: number };
  /** Set when the harness is installed but not logged in. */
  notLoggedIn?: boolean;
  /** Real token usage, when the CLI reports it. */
  usage?: TokenUsage;
  costUsd?: number;
}

export interface AgentAdapter {
  readonly agentId: HarnessId;
  readonly name: string;
  getBinaryPath(): string;
  isInstalled(): boolean;
  /** A cheap check that the CLI runs. It must not spend subscription usage. */
  probeHealth(): Promise<AgentHealthStatus>;
  /** Runs one one-shot turn with the board attached as an MCP server. */
  runTurn(request: TurnRequest): Promise<TurnResult>;
}
