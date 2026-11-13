import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { smithBaseUrl } from './mcp-connections.ts';

/** The UI and MCP clients use the same REST services and validation. */
export const smithEvents = new EventEmitter();
export interface ToolContext { sessionId?: string; chatId?: string }
export const assistantContexts = new Map<string, ToolContext>();
const text = z.string().trim().min(1);
const session = { sessionId: text.optional().describe('Session id; defaults to the current session when attached by Smith.') };
const worker = z.object({ agentId: z.enum(['claude', 'codex', 'opencode']), model: text, tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), workerId: text.optional() }).strict();
type Tool = { name: string; description: string; schema: z.ZodType; method?: string; route: (args: any, context: ToolContext) => string; body?: (args: any, context: ToolContext) => unknown };
const id = (args: any, context: ToolContext) => {
  const value = args.sessionId || context.sessionId;
  if (!value) throw new Error('Specify a sessionId or select a session first.');
  return encodeURIComponent(value);
};
const sessionRoute = (suffix = '') => (a: any, c: ToolContext) => `/sessions/${id(a, c)}${suffix}`;
const query = (values: Record<string, any>) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(values)) if (v !== undefined) q.set(k, String(v)); return q.size ? `?${q}` : ''; };
const definitions: Tool[] = [
  { name: 'folders_list', description: 'Browse local directories to choose a repository folder. Expands ~. Read only.', schema: z.object({ path: text.optional(), hidden: z.boolean().optional() }).strict(), route: a => `/system/folders${query(a)}` },
  { name: 'branches_list', description: 'List local and remote branches and the current branch for a Git repository.', schema: z.object({ path: text }).strict(), route: a => `/system/branches${query(a)}` },
  { name: 'models_list', description: 'List discovered model ids and their harness. Use exact model ids when creating workers.', schema: z.object({}).strict(), route: () => '/system/models' },
  { name: 'sessions_list', description: 'List Smith sessions and workers.', schema: z.object({}).strict(), route: () => '/sessions' },
  { name: 'session_get', description: 'Get a session, its repository, branch, workers and enabled customizations.', schema: z.object(session).strict(), route: sessionRoute() },
  { name: 'session_create', description: 'Create a session in an existing Git repository, with a new worktree based on baseBranch. Repeat worker entries for multiple workers of the same harness/model. Omit macroGoal to leave the team idle.', schema: z.object({ name: text, repoPath: text, baseBranch: text.optional(), agents: z.array(worker).max(24), reviewMode: z.enum(['fast', 'normal', 'thorough']).optional(), macroGoal: text.optional() }).strict(), method: 'POST', route: () => '/sessions', body: a => a },
  { name: 'session_workers_set', description: 'Replace all workers in a session. Repeat entries to create multiple workers of one model.', schema: z.object({ ...session, agents: z.array(worker).max(24) }).strict(), method: 'PUT', route: sessionRoute('/agents'), body: a => ({ agents: a.agents }) },
  { name: 'session_delete', description: 'Delete a session and remove its worktrees. Use only when the user explicitly requests deletion.', schema: z.object(session).strict(), method: 'DELETE', route: sessionRoute() },
  { name: 'goal_send', description: 'Send a coding goal or follow-up to the team in a session. Starts agent work; only use when asked to run a goal.', schema: z.object({ ...session, goal: text }).strict(), method: 'POST', route: sessionRoute('/goal'), body: a => ({ goal: a.goal }) },
  { name: 'board_read', description: 'Read the session board, cards and recent turns.', schema: z.object(session).strict(), route: sessionRoute('/board') },
  { name: 'goal_pause', description: 'Pause scheduling new agent turns. Running turns finish.', schema: z.object(session).strict(), method: 'POST', route: sessionRoute('/board/pause') },
  { name: 'goal_resume', description: 'Resume a paused goal.', schema: z.object(session).strict(), method: 'POST', route: sessionRoute('/board/resume') },
  { name: 'card_answer', description: 'Answer a question on a blocked board card.', schema: z.object({ ...session, cardId: text, answer: text }).strict(), method: 'POST', route: (a, c) => `${sessionRoute('/board/cards')(a, c)}/${encodeURIComponent(a.cardId)}/answer`, body: a => ({ answer: a.answer }) },
  { name: 'catalog_list', description: 'List installed skills, MCP servers and plugins. Secrets are masked.', schema: z.object({}).strict(), route: () => '/customizations' },
  { name: 'skill_install', description: 'Import a third-party skill from a local directory, SKILL.md path, direct SKILL.md URL, or GitHub/GitLab repository/subfolder URL. Copies scripts/references/assets too. Enables it for the specified/current session; omit sessionId with no current session to install in the catalog only.', schema: z.object({ ...session, source: text }).strict(), method: 'POST', route: () => '/customizations/skills/install', body: (a, c) => ({ source: a.source, sessionId: a.sessionId || c.sessionId }) },
  { name: 'mcp_add', description: 'Register a third-party MCP server: stdio command/args/env or Streamable HTTP url/headers. Set auth=oauth for OAuth discovery with optional oauth clientId/clientSecret/scope. Does not enable or execute it.', schema: z.object({ server: z.object({ id: text, name: text, transport: z.enum(['stdio', 'http']), command: text.optional(), args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional(), url: text.optional(), headers: z.record(z.string(), z.string()).optional(), auth: z.enum(['none', 'oauth']).optional(), oauth: z.object({ clientId: text.optional(), clientSecret: text.optional(), scope: text.optional() }).optional() }).strict() }).strict(), method: 'POST', route: () => '/customizations/mcp', body: a => a.server },
  { name: 'customizations_get', description: 'Get the session skills, MCP servers, plugins and worker targets. Secret values are masked.', schema: z.object(session).strict(), route: sessionRoute('/customizations') },
  { name: 'customizations_set', description: 'Replace selected customization lists/maps in a session. Omitted fields keep their values. MCP map values are {enabled,values}; targets map skill:ID/mcp:ID/plugin:ID to worker ids (empty = all).', schema: z.object({ ...session, skills: z.array(text).optional(), plugins: z.array(text).optional(), mcpServers: z.record(z.string(), z.object({ enabled: z.boolean(), values: z.record(z.string(), z.string()).optional() })).optional(), targets: z.record(z.string(), z.array(text)).optional() }).strict(), method: 'PUT', route: sessionRoute('/customizations'), body: ({ sessionId: _, ...a }) => a },
  ...(['connection', 'connect', 'test', 'disconnect'] as const).map(action => ({ name: `mcp_${action}`, description: ({ connection: 'Get OAuth connection status without revealing credentials.', connect: 'Start OAuth discovery and PKCE. Return the authorizationUrl to the user to authorize in their browser.', test: 'Connect and list available tools from a registered MCP server.', disconnect: 'Forget the stored OAuth credentials for this server.' })[action], schema: z.object({ ...session, serverId: text }).strict(), method: action === 'connection' ? 'GET' : 'POST', route: (a: any, c: ToolContext) => `/customizations/mcp/${encodeURIComponent(a.serverId)}/${action}${action === 'connection' ? query({ sessionId: a.sessionId || c.sessionId }) : ''}`, body: (a: any, c: ToolContext) => ({ sessionId: a.sessionId || c.sessionId }) })),
  { name: 'worktree_diff', description: 'Read the session worktree diff.', schema: z.object(session).strict(), route: sessionRoute('/worktree/diff') },
  { name: 'worktree_commit', description: 'Commit changes in the session worktree when explicitly requested.', schema: z.object({ ...session, message: text }).strict(), method: 'POST', route: sessionRoute('/worktree/commit'), body: a => ({ message: a.message }) },
  { name: 'worktree_merge', description: 'Merge the session branch into its base branch. Changes the local repository; only use on an explicit merge request.', schema: z.object(session).strict(), method: 'POST', route: sessionRoute('/worktree/merge') },
  { name: 'worktree_discard', description: 'Discard the session worktree and branch. Only use on an explicit discard request.', schema: z.object(session).strict(), method: 'POST', route: sessionRoute('/worktree/discard') }
];

export const SMITH_TOOLS = definitions.map(tool => {
  const { $schema: _, ...inputSchema } = z.toJSONSchema(tool.schema, { target: 'draft-7' });
  return { name: tool.name, description: tool.description, inputSchema: inputSchema as { type: 'object'; [key: string]: unknown } };
});

export async function callSmithTool(name: string, input: unknown, context: ToolContext = {}) {
  const tool = definitions.find(item => item.name === name);
  if (!tool) throw new Error(`Unknown Smith tool: ${name}`);
  const args = tool.schema.parse(input || {});
  const current = context.chatId ? assistantContexts.get(context.chatId) || context : context;
  const method = tool.method || 'GET';
  const response = await fetch(`${smithBaseUrl()}/api/v1${tool.route(args, current)}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: ['GET', 'DELETE'].includes(method) ? undefined : JSON.stringify(tool.body?.(args, current) || {}),
    signal: AbortSignal.timeout(name === 'skill_install' ? 90000 : 45000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Smith returned HTTP ${response.status}`);
  const sessionId = name === 'session_create' ? result.id : (args as any).sessionId || current.sessionId;
  if (name === 'session_create' && current.chatId) assistantContexts.set(current.chatId, { ...current, sessionId });
  if (method !== 'GET') smithEvents.emit('changed', { tool: name, chatId: current.chatId, sessionId });
  return result;
}
