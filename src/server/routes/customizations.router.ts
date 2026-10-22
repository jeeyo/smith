import { Router } from 'express';
import { getSession } from './sessions.router.ts';
import { mcpGateway } from '../mcp-gateway.ts';
import { CustomMCPServer, Skill, Plugin, SessionCustomizations } from '../../shared/types.ts';
import { observerAgentService } from '../observer-agent.ts';

export const customizationsRouter = Router();

// Global catalogs
const globalSkills: Map<string, Skill> = new Map([
  ['code-review', {
    id: 'code-review',
    name: 'Code Review & Linting',
    description: 'Enforces clean code principles, test coverage, and security checks',
    instructions: 'Always review newly generated code for edge cases, null checks, and error handling.',
    enabled: true
  }],
  ['database-migrations', {
    id: 'database-migrations',
    name: 'Database Migrations',
    description: 'Handles schema migrations, indices, and data safety',
    instructions: 'Generate migration scripts with down/rollback handlers.',
    enabled: true
  }],
  ['api-design', {
    id: 'api-design',
    name: 'REST & GraphQL API Design',
    description: 'Standardizes HTTP status codes, error schemas, and pagination',
    instructions: 'Use RFC 7807 Problem Details for all HTTP errors.',
    enabled: true
  }]
]);

const globalMCPs: Map<string, CustomMCPServer> = new Map([
  ['postgres', {
    id: 'postgres',
    name: 'PostgreSQL Database MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    enabled: false,
    description: 'Read schemas and run read-only queries against local Postgres'
  }],
  ['github', {
    id: 'github',
    name: 'GitHub Repository MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    enabled: false,
    description: 'Inspect PRs, issues, and commit histories'
  }],
  ['filesystem', {
    id: 'filesystem',
    name: 'Filesystem MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    enabled: true,
    description: 'Safe sandboxed filesystem access'
  }]
]);

const globalPlugins: Map<string, Plugin> = new Map([
  ['fullstack-pack', {
    id: 'fullstack-pack',
    name: 'Full-Stack Web Pack',
    description: 'Combines Code Review, API Design, and Database tools',
    skills: ['code-review', 'api-design', 'database-migrations'],
    mcpServers: ['postgres', 'filesystem'],
    enabled: true
  }]
]);

customizationsRouter.get('/customizations', (req, res) => {
  res.json({
    skills: Array.from(globalSkills.values()),
    mcpServers: Array.from(globalMCPs.values()),
    plugins: Array.from(globalPlugins.values())
  });
});

customizationsRouter.get('/sessions/:id/customizations', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const tools = mcpGateway.getToolsForSession(session.id);
  res.json({
    customizations: session.customizations,
    activeToolsCount: tools.length,
    activeTools: tools
  });
});

// Mid-session Hot-Update Endpoint
customizationsRouter.put('/sessions/:id/customizations', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const updated: Partial<SessionCustomizations> = req.body;

  if (updated.skills) session.customizations.skills = updated.skills;
  if (updated.plugins) session.customizations.plugins = updated.plugins;
  if (updated.mcpServers) {
    session.customizations.mcpServers = {
      ...session.customizations.mcpServers,
      ...updated.mcpServers
    };
  }
  if (updated.observer) {
    session.customizations.observer = {
      ...session.customizations.observer,
      ...updated.observer
    } as any;
    observerAgentService.setSessionConfig(session.id, updated.observer);
  }
  if (updated.orchestrator) {
    session.customizations.orchestrator = {
      ...session.customizations.orchestrator,
      ...updated.orchestrator
    };
  }

  // Update Gateway without restarting agents!
  mcpGateway.setSessionCustomizations(session.id, session.customizations);

  res.json({
    status: 'customizations_hot_reloaded',
    sessionId: session.id,
    customizations: session.customizations,
    activeTools: mcpGateway.getToolsForSession(session.id)
  });
});

customizationsRouter.post('/customizations/mcp', (req, res) => {
  const server: CustomMCPServer = req.body;
  if (!server.id || !server.name || !server.command) {
    return res.status(400).json({ error: 'id, name, and command are required' });
  }
  globalMCPs.set(server.id, server);
  res.status(201).json(server);
});

customizationsRouter.post('/customizations/skills', (req, res) => {
  const skill: Skill = req.body;
  if (!skill.id || !skill.name || !skill.instructions) {
    return res.status(400).json({ error: 'id, name, and instructions are required' });
  }
  globalSkills.set(skill.id, skill);
  res.status(201).json(skill);
});
