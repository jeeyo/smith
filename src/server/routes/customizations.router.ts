import { Router } from 'express';
import { getSession, sessionStore } from '../session-store.ts';
import { globalMCPs, globalPlugins, globalSkills } from '../catalog.ts';
import { CustomMCPServer, Skill, SessionCustomizations } from '../../shared/types.ts';

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
  res.json({ customizations: session.customizations });
});

/** Skills and extra MCP servers apply from the next agent turn; nothing has to restart. */
customizationsRouter.put('/sessions/:id/customizations', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const updated: Partial<SessionCustomizations> = req.body || {};
  if (Array.isArray(updated.skills)) session.customizations.skills = updated.skills.map(String);
  if (Array.isArray(updated.plugins)) session.customizations.plugins = updated.plugins.map(String);
  if (updated.mcpServers && typeof updated.mcpServers === 'object') {
    session.customizations.mcpServers = { ...session.customizations.mcpServers, ...updated.mcpServers };
  }
  sessionStore.save(session);

  res.json({ status: 'customizations_saved', sessionId: session.id, customizations: session.customizations });
});

customizationsRouter.post('/customizations/mcp', (req, res) => {
  const server: CustomMCPServer = req.body;
  if (!server?.id || !server.name || !server.command) {
    return res.status(400).json({ error: 'id, name, and command are required' });
  }
  globalMCPs.set(server.id, server);
  res.status(201).json(server);
});

customizationsRouter.post('/customizations/skills', (req, res) => {
  const skill: Skill = req.body;
  if (!skill?.id || !skill.name || !skill.instructions) {
    return res.status(400).json({ error: 'id, name, and instructions are required' });
  }
  globalSkills.set(skill.id, skill);
  res.status(201).json(skill);
});
