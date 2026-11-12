import { Router } from 'express';
import { getSession } from './sessions.router.ts';
import { costEngine } from '../cost-engine.ts';

export const costRouter = Router();

costRouter.get('/sessions/:id/cost', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const summary = costEngine.getSessionCost(session.id);
  res.json(summary);
});

costRouter.get('/sessions/:id/agents/:agentId/cost', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const metrics = costEngine.getAgentMetrics(session.id, req.params.agentId);
  if (!metrics) {
    return res.status(404).json({ error: 'Agent metrics not found in this session' });
  }

  res.json({
    sessionId: session.id,
    agentId: req.params.agentId,
    model: metrics.model,
    usage: metrics.usage,
    cost: metrics.cost,
    turnCount: metrics.turnCount
  });
});
