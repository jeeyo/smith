export type AgentId = 'claude' | 'codex' | 'antigravity' | 'opencode' | 'observer' | string;

export type AgentStatus = 'idle' | 'thinking' | 'running_tool' | 'waiting_permission' | 'completed' | 'error';

export interface DiscoveredModel {
  id: string;
  name: string;
  agentId: AgentId;
  provider?: string;
  source: 'acp-capability' | 'cli-probe' | 'cache' | 'custom';
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

export type TaskStatus = 'unassigned' | 'claimed' | 'in_progress' | 'completed' | 'blocked';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgent?: AgentId;
  fileScope: string[]; // Glob patterns or file paths locked by this task
  dependencies: string[]; // IDs of tasks that must complete first
  delegatedBy?: AgentId;
  costUsd: number;
  createdAt: number;
  completedAt?: number;
  notes?: string;
}

export type TeamMessageType =
  | 'intent'
  | 'request'
  | 'hazard'
  | 'anti_pattern'
  | 'info'
  | 'handoff'
  | 'proposal'
  | 'consensus'
  | 'emergency_alert'
  | 'error_retraction';

export interface TeamMessage {
  id: string;
  sender: AgentId | 'user' | 'system';
  type: TeamMessageType;
  content: string;
  timestamp: number;
  metadata?: {
    taskId?: string;
    fileScope?: string[];
    antiPattern?: {
      error: string;
      solution: string;
    };
  };
}

export interface CustomMCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  path?: string;
  instructions: string;
  enabled: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  skills: string[];
  mcpServers: string[];
  enabled: boolean;
}

export interface ObserverConfig {
  agentId: AgentId;
  model: string;
  enabled: boolean;
  strictSpecGamingCheck?: boolean;
}

export interface OrchestratorConfig {
  agentId: AgentId;
  model: string;
}

export interface SessionCustomizations {
  plugins: string[];
  skills: string[];
  mcpServers: Record<string, CustomMCPServer>;
  observer?: ObserverConfig;
  orchestrator?: OrchestratorConfig;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
  isClean: boolean;
  dirtyFiles: string[];
}

export interface SessionAgentConfig {
  workerId?: string;
  agentId: AgentId;
  model: string;
  mode: 'acp' | 'terminal';
}

export interface Session {
  id: string;
  name: string;
  repoPath: string;
  macroGoal: string;
  bankId: string; // Hindsight bank
  worktree: WorktreeInfo;
  agents: Record<string, {
    config: SessionAgentConfig;
    status: AgentStatus;
    metrics: AgentMetrics;
    ptyId?: string;
    activeTaskId?: string;
  }>;
  customizations: SessionCustomizations;
  tasks: Record<string, Task>;
  createdAt: number;
  updatedAt: number;
  cost: CostBreakdown;
}

export interface SessionCreateInput {
  name: string;
  repoPath: string;
  baseBranch?: string;
  macroGoal?: string;
  agents: SessionAgentConfig[];
  plugins?: string[];
  skills?: string[];
  customMcpServers?: CustomMCPServer[];
  observer?: ObserverConfig;
  orchestrator?: OrchestratorConfig;
}

export interface ACPPermissionRequest {
  id: string;
  agentId: AgentId;
  tool: string;
  parameters: Record<string, any>;
  description: string;
  timestamp: number;
}

export interface HindsightFact {
  id: string;
  text: string;
  category?: 'architecture' | 'decision' | 'environment' | 'general';
  createdAt: number;
}

export interface HindsightExperience {
  id: string;
  agentId: AgentId;
  action: string;
  diffSummary?: string;
  outcome: 'success' | 'failure';
  timestamp: number;
}

export interface HindsightAntiPattern {
  id: string;
  error: string;
  context: string;
  solution: string;
  agentId: AgentId;
  timestamp: number;
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

export interface ObserverAuditRecord {
  id: string;
  timestamp: number;
  sessionId: string;
  phaseOrTaskId?: string;
  targetAgent: AgentId;
  observerAgentId?: AgentId;
  observerModel?: string;
  verdict: 'verified' | 'flagged' | 'hallucination_detected' | 'spec_gaming_detected';
  confidence: number;
  summary: string;
  milestonesVerified: string[];
  findings: string[];
  groundTruthCheck: {
    filesVerified: string[];
    missingFiles: string[];
    testsExecuted: boolean;
    testsPassed: boolean;
    specGamingSigns: string[];
  };
}

export interface DualLayerMemoryInfo {
  sessionId: string;
  basePath: string; // .smith/memory/sessions/{sessionId}
  teamKnowledgeFile: string; // .smith/memory/sessions/{sessionId}/team/knowledge.md
  agentScratchpadFiles: Record<string, string>; // .smith/memory/sessions/{sessionId}/agents/{agentId}/scratchpad.md
  lastCompactionAt?: number;
  teamKnowledgeContent?: string;
  agentScratchpads?: Record<string, string>;
}

export interface InteractiveQuestion {
  id: string;
  askingAgent: AgentId | 'orchestrator';
  askingModel?: string;
  prompt: string;
  context?: string;
  options: string[];
  isMultiSelect?: boolean;
  allowCustom?: boolean;
  answered?: boolean;
  selectedOptions?: string[];
  customAnswer?: string;
  answeredAt?: number;
}

export interface GoalChatMessage {
  id: string;
  sender: 'user' | 'orchestrator' | 'system';
  content: string;
  timestamp: number;
  orchestratorAgentId?: AgentId;
  orchestratorModel?: string;
  questions?: InteractiveQuestion[];
  status?: 'planning' | 'executing' | 'completed' | 'error';
  warnings?: Array<{
    agentId: string;
    type: 'rate_limit' | 'auth_required' | 'delegated' | 'warning';
    title: string;
    message: string;
    remediation?: string;
  }>;
  plan?: {
    goal: string;
    isDelta?: boolean;
    deltaScope?: string[];
    subtasks: Array<{
      id: string;
      title: string;
      agentId: AgentId;
      originalAgentId?: AgentId;
      routedFrom?: AgentId;
      routingReason?: string;
      fileScope: string[];
      status: TaskStatus;
      costUsd?: number;
    }>;
    antiPatternsConsulted?: string[];
    worktreeBranch?: string;
  };
  diffSummary?: WorktreeDiffSummary;
  artifacts?: MessageArtifact[];
  observerAudits?: ObserverAuditRecord[];
  dualLayerMemory?: DualLayerMemoryInfo;
  operations?: Array<{
    timestamp: number;
    agentId: AgentId;
    action: string;
    detail?: string;
  }>;
  cost?: {
    usd: number;
    formatted: string;
    tokens: number;
  };
}


export interface AppLevelConfig {
  agentBinaries?: Record<string, string>;
  hindsight?: {
    provider: string;
    apiKey: string;
    url: string;
    autoStartDaemon: boolean;
    defaultBank: string;
  };
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
