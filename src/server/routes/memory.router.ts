import { Router } from 'express';
import { getSession } from './sessions.router.ts';
import { hindsightService } from '../hindsight-service.ts';
import { sessionMemoryService } from '../session-memory.ts';
import { observerAgentService } from '../observer-agent.ts';
import { broadcastLayerService } from '../broadcast-layer.ts';
import { teamBus } from '../team-bus.ts';

export const memoryRouter = Router();

// Global Hindsight Memory Endpoints
memoryRouter.get('/sessions/:id/memory', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const bank = hindsightService.getBank(session.bankId);
  res.json({
    bankId: session.bankId,
    connected: hindsightService.isConnected,
    facts: bank?.facts || [],
    experiences: bank?.experiences || [],
    antiPatterns: bank?.antiPatterns || [],
    lastReflectedState: bank?.lastReflectedState
  });
});

memoryRouter.post('/sessions/:id/memory/retain', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { text, category, agentId } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  await hindsightService.retain(session.bankId, text, { category, agentId });
  res.status(201).json({ status: 'retained', text });
});

memoryRouter.post('/sessions/:id/memory/recall', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const result = await hindsightService.recall(session.bankId, query);
  res.json(result);
});

memoryRouter.post('/sessions/:id/memory/reflect', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { goal } = req.body;
  const reflection = await hindsightService.reflect(session.bankId, goal || session.macroGoal);
  res.json({ status: 'reflected', reflection });
});

// Per-Session Dual-Layer Memory Endpoints (.smith/memory/sessions/{sessionId})
memoryRouter.get('/sessions/:id/memory/dual-layer', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const info = sessionMemoryService.getSessionMemoryInfo(req.params.id);
  res.json(info);
});

memoryRouter.post('/sessions/:id/memory/compaction-flush', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { agentId = 'antigravity', durableKnowledge } = req.body;
  const result = sessionMemoryService.flushCompactionSurvival(req.params.id, agentId, durableKnowledge);
  res.json(result);
});

// Observer Safety & Independent Telemetry Audits
memoryRouter.get('/sessions/:id/observer/audits', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const audits = observerAgentService.getAuditHistory(req.params.id);
  res.json({ sessionId: req.params.id, count: audits.length, audits });
});

memoryRouter.get('/sessions/:id/observer/config', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const config = observerAgentService.getSessionConfig(req.params.id);
  res.json({ sessionId: req.params.id, config });
});

memoryRouter.put('/sessions/:id/observer/config', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const updated = observerAgentService.setSessionConfig(req.params.id, req.body);
  session.customizations.observer = updated;
  res.json({ status: 'observer_config_updated', config: updated });
});

// Broadcast Chat Layer & Peer Negotiation Telemetry
memoryRouter.get('/sessions/:id/broadcast/peer-state', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const proposals = broadcastLayerService.getProposals(req.params.id);
  const emergencies = broadcastLayerService.getEmergencies(req.params.id);
  const messages = teamBus.getMessages(req.params.id);

  res.json({
    sessionId: req.params.id,
    proposals,
    emergencies,
    messages
  });
});
