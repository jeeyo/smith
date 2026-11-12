import { Router } from 'express';
import { getSession } from './sessions.router.ts';
import { acpHostEngine } from '../acp-host.ts';
import { costEngine } from '../cost-engine.ts';

export const agentsRouter = Router();

agentsRouter.get('/sessions/:id/agents', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const agents = Object.values(session.agents).map(a => {
    const metrics = costEngine.getAgentMetrics(session.id, a.config.agentId);
    return {
      ...a,
      metrics: metrics || a.metrics
    };
  });

  res.json({ count: agents.length, agents });
});

agentsRouter.post('/sessions/:id/agents', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { agentId, model, mode } = req.body;
  if (!agentId || !model) {
    return res.status(400).json({ error: 'agentId and model are required' });
  }

  const agentConfig = {
    agentId,
    model,
    mode: mode || 'acp'
  };

  session.agents[agentId] = {
    config: agentConfig,
    status: 'idle',
    metrics: {
      agentId,
      model,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      cost: { currency: 'USD', inputCostUsd: 0, outputCostUsd: 0, cachedCostUsd: 0, totalCostUsd: 0, formattedTotal: '$0.00' },
      turnCount: 0,
      startTime: Date.now(),
      lastActiveTime: Date.now()
    }
  };

  await acpHostEngine.spawnAgent(session.id, agentId, model, session.worktree.path);

  res.status(201).json(session.agents[agentId]);
});

// Model Hot-Reload Endpoint
agentsRouter.patch('/sessions/:id/agents/:agentId', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const agent = session.agents[req.params.agentId];
  if (!agent) return res.status(404).json({ error: 'Agent not found in session' });

  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model string is required for hot-reload' });

  const oldModel = agent.config.model;
  agent.config.model = model;

  await acpHostEngine.hotReloadModel(session.id, req.params.agentId, model);

  res.json({
    status: 'hot-reloaded',
    agentId: req.params.agentId,
    previousModel: oldModel,
    activeModel: model,
    timestamp: Date.now()
  });
});

agentsRouter.post('/sessions/:id/agents/:agentId/prompt', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { prompt, taskId } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  await acpHostEngine.sendPrompt(session.id, req.params.agentId, prompt, taskId);

  res.json({ status: 'dispatched', agentId: req.params.agentId, prompt, taskId });
});

agentsRouter.post('/sessions/:id/agents/:agentId/permission', (req, res) => {
  const { permissionId, allowed } = req.body;
  if (!permissionId || typeof allowed !== 'boolean') {
    return res.status(400).json({ error: 'permissionId and allowed boolean required' });
  }

  acpHostEngine.respondPermission(req.params.id, req.params.agentId, permissionId, allowed);

  res.json({ status: 'permission_responded', permissionId, allowed });
});

agentsRouter.delete('/sessions/:id/agents/:agentId', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  acpHostEngine.terminateAgent(session.id, req.params.agentId);
  delete session.agents[req.params.agentId];

  res.json({ status: 'agent_terminated', agentId: req.params.agentId });
});
