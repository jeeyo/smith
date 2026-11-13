import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { CustomMCPServer, Plugin, SessionCustomizations, Skill } from '../shared/types.ts';

/**
 * The catalog of skills, MCP servers and plugins a session can switch on, and the one place
 * that works out what actually applies to a given worker's turn.
 *
 * Built-in entries are defined here. Entries added through the API are saved in
 * ~/.smith/catalog.json so they survive a restart.
 */

const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'code-review',
    name: 'Code Review & Linting',
    description: 'Enforces clean code principles, test coverage, and security checks',
    instructions: 'Always review newly generated code for edge cases, null checks, and error handling.',
    enabled: true
  },
  {
    id: 'database-migrations',
    name: 'Database Migrations',
    description: 'Handles schema migrations, indices, and data safety',
    instructions: 'Generate migration scripts with down/rollback handlers.',
    enabled: true
  },
  {
    id: 'api-design',
    name: 'REST & GraphQL API Design',
    description: 'Standardizes HTTP status codes, error schemas, and pagination',
    instructions: 'Use RFC 7807 Problem Details for all HTTP errors.',
    enabled: true
  }
];

const BUILT_IN_SERVERS: CustomMCPServer[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', '${POSTGRES_URL}'],
    enabled: false,
    description: 'Read schemas and run read-only queries against a Postgres database',
    inputs: [{ key: 'POSTGRES_URL', label: 'Connection string', secret: true, placeholder: 'postgresql://user:pass@localhost:5432/db' }]
  },
  {
    id: 'github',
    name: 'GitHub',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_TOKEN}' },
    enabled: false,
    description: 'Inspect pull requests, issues and commit history',
    inputs: [{ key: 'GITHUB_TOKEN', label: 'Personal access token', secret: true, placeholder: 'github_pat_…' }]
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '${WORKDIR}'],
    enabled: false,
    description: "File access limited to the directory the worker's turn runs in"
  }
];

const BUILT_IN_PLUGINS: Plugin[] = [
  {
    id: 'fullstack-pack',
    name: 'Full-Stack Web Pack',
    description: 'Code review, API design and database migration skills, with Postgres and filesystem access',
    skills: ['code-review', 'api-design', 'database-migrations'],
    mcpServers: ['postgres', 'filesystem'],
    enabled: true
  }
];

const catalogFile = path.join(config.storageDir, 'catalog.json');

function loadAdded(): { skills: Skill[]; mcpServers: CustomMCPServer[] } {
  try {
    const raw = JSON.parse(fs.readFileSync(catalogFile, 'utf-8'));
    return {
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      mcpServers: Array.isArray(raw.mcpServers) ? raw.mcpServers : []
    };
  } catch {
    return { skills: [], mcpServers: [] };
  }
}

const added = loadAdded();

export const globalSkills: Map<string, Skill> = new Map([...BUILT_IN_SKILLS, ...added.skills].map(s => [s.id, s]));
export const globalMCPs: Map<string, CustomMCPServer> = new Map([...BUILT_IN_SERVERS, ...added.mcpServers].map(s => [s.id, s]));
export const globalPlugins: Map<string, Plugin> = new Map(BUILT_IN_PLUGINS.map(p => [p.id, p]));

function saveAdded() {
  const builtInSkills = new Set(BUILT_IN_SKILLS.map(s => s.id));
  const builtInServers = new Set(BUILT_IN_SERVERS.map(s => s.id));
  const data = {
    skills: Array.from(globalSkills.values()).filter(s => !builtInSkills.has(s.id)),
    mcpServers: Array.from(globalMCPs.values()).filter(s => !builtInServers.has(s.id))
  };
  const tmp = `${catalogFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, catalogFile);
}

export const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function addSkill(skill: Skill) {
  globalSkills.set(skill.id, skill);
  saveAdded();
}

export function addServer(server: CustomMCPServer) {
  globalMCPs.set(server.id, server);
  saveAdded();
}

// ---------------------------------------------------------------------------------------
// What applies to one worker
// ---------------------------------------------------------------------------------------

export interface ResolvedServer {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ResolvedCustomizations {
  skills: Skill[];
  mcpServers: ResolvedServer[];
}

function appliesTo(custom: SessionCustomizations, key: string, peerId: string): boolean {
  const list = custom.targets?.[key];
  return !list || list.length === 0 || list.includes(peerId);
}

/** Inputs a server still needs, given the values saved for it. */
export function missingInputs(server: CustomMCPServer, values: Record<string, string> | undefined): string[] {
  return (server.inputs || []).filter(input => !(values?.[input.key] || '').trim()).map(input => input.label);
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\$\{([A-Za-z0-9_]+)\}/g, (whole, key) => (key in vars ? vars[key] : whole));
}

/** The servers a session has on, directly or through a plugin, with their saved values. */
function serversInUse(custom: SessionCustomizations, peerId?: string): Array<{ server: CustomMCPServer; values?: Record<string, string> }> {
  const out = new Map<string, { server: CustomMCPServer; values?: Record<string, string> }>();
  for (const s of Object.values(custom.mcpServers || {})) {
    if (!s.enabled) continue;
    if (peerId && !appliesTo(custom, `mcp:${s.id}`, peerId)) continue;
    const base = globalMCPs.get(s.id);
    // Use the catalog's definition when there is one, so fixes to it reach existing sessions.
    out.set(s.id, { server: base ? { ...base, enabled: true } : s, values: s.values });
  }
  for (const pluginId of custom.plugins || []) {
    const plugin = globalPlugins.get(pluginId);
    if (!plugin || (peerId && !appliesTo(custom, `plugin:${pluginId}`, peerId))) continue;
    for (const id of plugin.mcpServers) {
      const base = globalMCPs.get(id);
      if (base && !out.has(id)) out.set(id, { server: base, values: custom.mcpServers?.[id]?.values });
    }
  }
  return Array.from(out.values());
}

/**
 * What one worker gets on one turn: the session's skills and servers, plus whatever its
 * plugins bring, limited to the ones that target this worker, with ${WORKDIR} and input
 * values filled in. A server still missing an input is left out.
 */
export function resolveFor(custom: SessionCustomizations | undefined, peerId: string, workdir: string): ResolvedCustomizations {
  if (!custom) return { skills: [], mcpServers: [] };

  const skillIds = new Set<string>();
  for (const id of custom.skills || []) {
    if (appliesTo(custom, `skill:${id}`, peerId)) skillIds.add(id);
  }
  for (const pluginId of custom.plugins || []) {
    const plugin = globalPlugins.get(pluginId);
    if (plugin && appliesTo(custom, `plugin:${pluginId}`, peerId)) plugin.skills.forEach(id => skillIds.add(id));
  }
  const skills = Array.from(skillIds)
    .map(id => globalSkills.get(id))
    .filter((s): s is Skill => !!s && s.enabled);

  const mcpServers: ResolvedServer[] = [];
  for (const { server, values } of serversInUse(custom, peerId)) {
    if (missingInputs(server, values).length > 0) continue;
    const vars = { ...(values || {}), WORKDIR: workdir };
    mcpServers.push({
      id: server.id,
      command: server.command,
      args: (server.args || []).map(a => fill(a, vars)),
      env: server.env ? Object.fromEntries(Object.entries(server.env).map(([k, v]) => [k, fill(v, vars)])) : undefined
    });
  }
  return { skills, mcpServers };
}

/** Problems that would stop a session's servers from starting, as messages for the user. */
export function customizationProblems(custom: SessionCustomizations): string[] {
  const problems: string[] = [];
  for (const { server, values } of serversInUse(custom)) {
    const missing = missingInputs(server, values);
    if (missing.length > 0) problems.push(`${server.name} needs: ${missing.join(', ')}.`);
  }
  for (const id of custom.skills || []) if (!globalSkills.has(id)) problems.push(`Unknown skill: ${id}.`);
  for (const id of custom.plugins || []) if (!globalPlugins.has(id)) problems.push(`Unknown plugin: ${id}.`);
  return problems;
}

// ---------------------------------------------------------------------------------------
// Keeping secrets out of API responses
// ---------------------------------------------------------------------------------------

export const SECRET_MASK = '••••••••';

function secretKeys(serverId: string, server?: CustomMCPServer): Set<string> {
  const def = globalMCPs.get(serverId) || server;
  return new Set((def?.inputs || []).filter(i => i.secret).map(i => i.key));
}

/** A copy safe to send to the browser: secret values are replaced with a mask. */
export function maskCustomizations(custom: SessionCustomizations): SessionCustomizations {
  const mcpServers: Record<string, CustomMCPServer> = {};
  for (const [id, s] of Object.entries(custom.mcpServers || {})) {
    const secrets = secretKeys(id, s);
    mcpServers[id] = {
      ...s,
      values: s.values
        ? Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, secrets.has(k) && v ? SECRET_MASK : v]))
        : undefined
    };
  }
  return { ...custom, mcpServers };
}

/** Keeps the stored secret wherever the browser sent back the mask unchanged. */
export function unmaskValues(
  incoming: Record<string, string> | undefined,
  stored: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!incoming) return stored;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    out[k] = v === SECRET_MASK ? stored?.[k] || '' : String(v ?? '');
  }
  return out;
}
