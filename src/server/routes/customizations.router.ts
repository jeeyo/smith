import { Router } from 'express';
import { getSession, sessionStore } from '../session-store.ts';
import {
  SAFE_ID,
  addServer,
  addSkill,
  customizationProblems,
  globalMCPs,
  globalPlugins,
  globalSkills,
  maskCustomizations,
  unmaskValues
} from '../catalog.ts';
import { CustomMCPServer, SessionCustomizations, Skill } from '../../shared/types.ts';

export const customizationsRouter = Router();

customizationsRouter.get('/customizations', (_req, res) => {
  res.json({
    skills: Array.from(globalSkills.values()),
    mcpServers: Array.from(globalMCPs.values()),
    plugins: Array.from(globalPlugins.values())
  });
});

customizationsRouter.get('/sessions/:id/customizations', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ customizations: maskCustomizations(session.customizations) });
});

/**
 * Replaces the session's skills, servers, plugins and worker targets. Changes apply from each
 * worker's next turn. A server that is on but missing an input is refused, with what is
 * missing, so nothing silently fails to start later.
 */
customizationsRouter.put('/sessions/:id/customizations', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const body: Partial<SessionCustomizations> = req.body || {};
  const current = session.customizations;
  const next: SessionCustomizations = {
    skills: Array.isArray(body.skills) ? body.skills.map(String) : current.skills,
    plugins: Array.isArray(body.plugins) ? body.plugins.map(String) : current.plugins,
    mcpServers: current.mcpServers,
    targets: current.targets
  };

  if (body.mcpServers && typeof body.mcpServers === 'object') {
    const servers: Record<string, CustomMCPServer> = {};
    for (const [id, incoming] of Object.entries(body.mcpServers)) {
      if (!SAFE_ID.test(id)) return res.status(400).json({ error: `Invalid server id: ${id}` });
      const base = globalMCPs.get(id) || current.mcpServers[id];
      if (!base) return res.status(400).json({ error: `Unknown MCP server: ${id}` });
      servers[id] = {
        ...base,
        enabled: incoming?.enabled === true,
        values: unmaskValues(incoming?.values, current.mcpServers[id]?.values)
      };
    }
    next.mcpServers = servers;
  }

  if (body.targets && typeof body.targets === 'object') {
    const workers = new Set(Object.keys(session.agents));
    const targets: Record<string, string[]> = {};
    for (const [key, list] of Object.entries(body.targets)) {
      if (!/^(skill|mcp|plugin):/.test(key) || !Array.isArray(list)) continue;
      const valid = list.map(String).filter(w => workers.has(w));
      if (valid.length > 0) targets[key] = valid;
    }
    next.targets = targets;
  }

  const problems = customizationProblems(next);
  if (problems.length > 0) return res.status(400).json({ error: problems.join(' '), problems });

  session.customizations = next;
  sessionStore.save(session);
  res.json({ status: 'customizations_saved', sessionId: session.id, customizations: maskCustomizations(next) });
});

customizationsRouter.post('/customizations/mcp', (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.name || !b.command) {
    return res.status(400).json({ error: 'id, name, and command are required' });
  }
  if (!SAFE_ID.test(String(b.id))) {
    return res.status(400).json({ error: 'id may use letters, digits, "-" and "_" only' });
  }
  const server: CustomMCPServer = {
    id: String(b.id),
    name: String(b.name),
    command: String(b.command),
    args: Array.isArray(b.args) ? b.args.map(String) : [],
    env: b.env && typeof b.env === 'object' ? Object.fromEntries(Object.entries(b.env).map(([k, v]) => [k, String(v)])) : undefined,
    description: b.description ? String(b.description) : undefined,
    inputs: Array.isArray(b.inputs)
      ? b.inputs.filter((i: any) => i && SAFE_ID.test(String(i.key))).map((i: any) => ({ key: String(i.key), label: String(i.label || i.key), secret: !!i.secret, placeholder: i.placeholder ? String(i.placeholder) : undefined }))
      : undefined,
    enabled: false
  };
  addServer(server);
  res.status(201).json(server);
});

customizationsRouter.post('/customizations/skills', (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.name || !b.instructions) {
    return res.status(400).json({ error: 'id, name, and instructions are required' });
  }
  if (!SAFE_ID.test(String(b.id))) {
    return res.status(400).json({ error: 'id may use letters, digits, "-" and "_" only' });
  }
  const skill: Skill = {
    id: String(b.id),
    name: String(b.name),
    description: String(b.description || ''),
    instructions: String(b.instructions),
    enabled: true
  };
  addSkill(skill);
  res.status(201).json(skill);
});
