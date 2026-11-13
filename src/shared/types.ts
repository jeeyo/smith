import type { HarnessId, ReviewMode, Tier } from './board.ts';

/** A harness id ('claude', 'codex', 'opencode') or a peer id such as 'claude-1'. */
export type AgentId = string;

export interface DiscoveredModel {
  id: string;
  name: string;
  agentId: AgentId;
  provider?: string;
  source: 'cli-probe' | 'cache' | 'custom';
  isDefault?: boolean;
  capabilities?: {
    reasoning?: boolean;
    contextWindow?: number;
    speed?: 'fast' | 'balanced' | 'deep';
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  currency: 'USD';
  inputCostUsd: number;
  outputCostUsd: number;
  cachedCostUsd: number;
  totalCostUsd: number;
  formattedTotal: string;
}

export interface AgentMetrics {
  agentId: AgentId;
  model: string;
  usage: TokenUsage;
  cost: CostBreakdown;
  turnCount: number;
  startTime: number;
  lastActiveTime: number;
}

export interface SessionCostSummary {
  sessionId: string;
  currency: 'USD';
  totalCostUsd: number;
  formattedTotal: string;
  totalTokens: number;
  byAgent: Record<string, {
    agentId: AgentId;
    model: string;
    usage: TokenUsage;
    costUsd: number;
    formattedCost: string;
    turnCount: number;
  }>;
  byTask: Array<{
    taskId: string;
    title: string;
    agentId: AgentId;
    costUsd: number;
    formattedCost: string;
  }>;
}

/** A value a server needs before it can start, such as a token or a connection string. */
export interface MCPInput {
  /** Referenced as ${KEY} in the server's args or env. */
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
}

export interface CustomMCPServer {
  /** Letters, digits, "-" and "_" only: it becomes a config key in every CLI. */
  id: string;
  name: string;
  command: string;
  /** May contain ${WORKDIR} (the directory the worker's turn runs in) and ${KEY} for each input. */
  args: string[];
  env?: Record<string, string>;
  /** In the catalog: unused. In a session: whether the server is switched on. */
  enabled: boolean;
  description?: string;
  inputs?: MCPInput[];
  /** Values for the inputs, stored with the session. */
  values?: Record<string, string>;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  path?: string;
  instructions: string;
  enabled: boolean;
}

/** A bundle that switches on a set of skills and servers together. */
export interface Plugin {
  id: string;
  name: string;
  description: string;
  skills: string[];
  mcpServers: string[];
  enabled: boolean;
}

export interface SessionCustomizations {
  plugins: string[];
  skills: string[];
  mcpServers: Record<string, CustomMCPServer>;
  /**
   * Which workers each skill, server or plugin applies to, keyed "skill:<id>", "mcp:<id>" or
   * "plugin:<id>". A missing or empty list means every worker.
   */
  targets?: Record<string, string[]>;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
  isClean: boolean;
  dirtyFiles: string[];
}

export interface SessionAgentConfig {
  /** Peer id on the board, for example "claude-1". */
  workerId?: string;
  /** The harness (agent CLI) this worker runs on. */
  agentId: HarnessId;
  model: string;
  /** How capable the model is, 1 to 3. Cards may require a minimum tier. */
  tier?: Tier;
}

export interface Session {
  id: string;
  name: string;
  repoPath: string;
  macroGoal: string;
  worktree: WorktreeInfo;
  agents: Record<string, { config: SessionAgentConfig }>;
  reviewMode: ReviewMode;
  /** The approved spec the current goal was started from. */
  specPath?: string;
  customizations: SessionCustomizations;
  createdAt: number;
  updatedAt: number;
  cost?: CostBreakdown;
}

export interface SessionCreateInput {
  name: string;
  repoPath: string;
  baseBranch?: string;
  macroGoal?: string;
  agents: SessionAgentConfig[];
  reviewMode?: ReviewMode;
  plugins?: string[];
  skills?: string[];
  customMcpServers?: CustomMCPServer[];
}

export interface AgentHealthStatus {
  agentId: AgentId;
  name: string;
  installed: boolean;
  binaryPath?: string;
  version?: string;
  authenticated: boolean;
  status: 'ready' | 'rate_limited' | 'not_logged_in' | 'not_installed' | 'error';
  message: string;
  remediation?: string;
  resetTime?: string;
  lastCheckedAt: number;
}

export interface WorktreeDiffFile {
  file: string;
  additions: number;
  deletions: number;
  status: 'modified' | 'added' | 'deleted';
  patch?: string;
}

export interface WorktreeDiffSummary {
  branch: string;
  baseBranch: string;
  totalAdditions: number;
  totalDeletions: number;
  changedFilesCount: number;
  files: WorktreeDiffFile[];
  canMergeCleanly: boolean;
  merged?: boolean;
  discarded?: boolean;
}

export type ArtifactType = 'image' | 'mermaid' | 'html' | 'other';

export interface MessageArtifact {
  id: string;
  name: string;
  path?: string;
  type: ArtifactType;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  content?: string;
  description?: string;
}

export interface GoalChatMessage {
  id: string;
  sender: 'user' | 'board' | 'system';
  /** What the message is about, so the UI can render it appropriately. */
  kind?: 'goal' | 'info' | 'question' | 'answer' | 'paused' | 'completed' | 'error';
  content: string;
  timestamp: number;
  cardId?: string;
  diffSummary?: WorktreeDiffSummary;
  artifacts?: MessageArtifact[];
}

export interface AppLevelConfig {
  agentBinaries?: Record<string, string>;
  app?: {
    gitPath: string;
    defaultRepoPath: string;
    port: number;
    theme: 'dark' | 'light' | 'system';
    currency: string;
    budgetAlertThreshold: number;
  };
  detectedBinaries?: Record<string, string>;
}
