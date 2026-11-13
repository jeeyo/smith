import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionAgentConfig, SessionCreateInput } from '../../shared/types.ts';
import { ReviewMode, Tier } from '../../shared/board.ts';
import { worktreeManager } from '../worktree-manager.ts';
import { costEngine } from '../cost-engine.ts';
import { sessionStore, getSession } from '../session-store.ts';
import { boardStore } from '../board-store.ts';
import { boardTools } from '../board-tools.ts';
import { sessionChat } from '../session-chat.ts';
import { scheduler } from '../scheduler.ts';
import { startGoal, syncPeers } from '../team.ts';
import { isHarness } from '../adapters/index.ts';
import { SAFE_ID, maskCustomizations, serverDefinition, customizationProblems } from '../catalog.ts';
import { listBranches, localPath } from '../workspace.ts';

export const sessionsRouter = Router();
export { getSession };

const REVIEW_MODES: ReviewMode[] = ['fast', 'normal', 'thorough'];

/** Suggests a tier from a model name; the user can change it. */
export function suggestTier(model: string): Tier {
  const m = (model || '').toLowerCase();
  if (/haiku|mini|nano|lite|flash|small|ollama|local|qwen|deepseek|llama/.test(m)) return 1;
  if (/opus|fable|mythos|ultra|\bo1\b|\bo3\b|pro\b|gpt-5|gpt-6/.test(m)) return 3;
  return 2;
}

/** Builds the worker map, giving each worker a unique peer id such as "claude-1". */
export function buildWorkers(agents: SessionAgentConfig[] | undefined): Session['agents'] {
  const workers: Session['agents'] = {};
  const counts: Record<string, number> = {};
  for (const cfg of agents || []) {
    if (!cfg || !isHarness(cfg.agentId) || typeof cfg.model !== 'string' || !cfg.model.trim()) continue;
    counts[cfg.agentId] = (counts[cfg.agentId] || 0) + 1;
    let id = (cfg.workerId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!id || workers[id]) id = `${cfg.agentId}-${counts[cfg.agentId]}`;
    while (workers[id]) id = `${id}-x`;
    const tier = [1, 2, 3].includes(cfg.tier as number) ? (cfg.tier as Tier) : suggestTier(cfg.model);
    workers[id] = { config: { workerId: id, agentId: cfg.agentId, model: cfg.model, tier } };
  }
  return workers;
}

export function withCost(session: Session) {
  const cost = costEngine.getSessionCost(session.id);
  return {
    ...session,
    customizations: maskCustomizations(session.customizations),
    cost: {
      currency: 'USD' as const,
      inputCostUsd: 0,
      outputCostUsd: 0,
      cachedCostUsd: 0,
      totalCostUsd: cost.totalCostUsd,
      formattedTotal: cost.formattedTotal
    }
  };
}

export async function removeSession(session: Session) {
  try {
    await boardTools.dropAllWorkspaces(session);
  } catch {}
  try {
    await worktreeManager.removeWorktree(session.repoPath, session.worktree.path);
  } catch {}
  scheduler.forget(session.id);
  boardStore.delete(session.id);
  sessionChat.forget(session.id);
  sessionStore.delete(session.id);
}

sessionsRouter.get('/sessions', (_req, res) => {
  const list = sessionStore.list().map(withCost);
  res.json({ count: list.length, sessions: list });
});

export async function createSession(input: SessionCreateInput): Promise<Session> {
  if (typeof input?.name !== 'string' || !input.name.trim() || typeof input.repoPath !== 'string' || !input.repoPath.trim()) {
    throw new Error('name and repoPath are required');
  }
  input = { ...input, name: input.name.trim(), repoPath: localPath(input.repoPath.trim()) };
  const branches = await listBranches(input.repoPath);
  const baseBranch = input.baseBranch || branches.defaultBranch;
  if (!baseBranch) throw new Error('The repository needs at least one committed branch.');

  const sessionId = `smith-${Date.now()}-${uuidv4().substring(0, 6)}`;
  const slug = input.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'session';
  // The id suffix keeps two sessions with the same name on separate branches.
  const branchName = `smith/${slug}-${sessionId.slice(-6)}`;

  const agents = buildWorkers(input.agents);
  const customizations: Session['customizations'] = {
    plugins: input.plugins || [], skills: input.skills || [],
    mcpServers: Object.fromEntries((input.customMcpServers || []).map(s => { const definition = serverDefinition(s); return [definition.id, definition]; }))
  };
  const problems = customizationProblems(customizations);
  if (problems.length) throw new Error(problems.join(' '));
  const worktree = await worktreeManager.createWorktree(input.repoPath, branchName, baseBranch);

  const session: Session = {
    id: sessionId,
    name: input.name,
    repoPath: input.repoPath,
    macroGoal: '',
    worktree,
    agents,
    reviewMode: REVIEW_MODES.includes(input.reviewMode as ReviewMode) ? (input.reviewMode as ReviewMode) : 'normal',
    customizations,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  sessionStore.save(session);
  syncPeers(session);

  if (input.macroGoal && input.macroGoal.trim() && Object.keys(session.agents).length > 0) {
    sessionChat.post(session.id, { sender: 'user', kind: 'goal', content: input.macroGoal.trim() });
    startGoal(session, input.macroGoal);
  }

  return session;
}

sessionsRouter.post('/sessions', async (req, res) => {
  try { res.status(201).json(withCost(await createSession(req.body))); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

sessionsRouter.get('/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(withCost(session));
});

/** Replaces the session's workers. Takes effect on the board at once. */
sessionsRouter.put('/sessions/:id/agents', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const agents = req.body?.agents;
  if (!Array.isArray(agents)) return res.status(400).json({ error: 'agents array required' });

  session.agents = buildWorkers(agents);
  sessionStore.save(session);
  syncPeers(session);
  scheduler.poke(session.id);
  res.json({ status: 'workers_updated', agents: session.agents });
});

sessionsRouter.delete('/sessions/:id', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  await removeSession(session);
  res.json({ status: 'terminated', sessionId: req.params.id });
});

sessionsRouter.post('/sessions/batch-delete', async (req, res) => {
  const { sessionIds } = req.body || {};
  if (!Array.isArray(sessionIds)) {
    return res.status(400).json({ error: 'sessionIds array required' });
  }
  const deleted: string[] = [];
  for (const id of sessionIds) {
    const session = getSession(id);
    if (!session) continue;
    await removeSession(session);
    deleted.push(id);
  }
  res.json({ status: 'batch_deleted', count: deleted.length, deleted });
});
