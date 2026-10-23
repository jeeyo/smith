import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.ts';
import { Session, SessionCreateInput, ObserverConfig, OrchestratorConfig, Task } from '../../shared/types.ts';
import { worktreeManager } from '../worktree-manager.ts';
import { hindsightService } from '../hindsight-service.ts';
import { taskLeaseManager } from '../task-lease-manager.ts';
import { costEngine } from '../cost-engine.ts';
import { mcpGateway } from '../mcp-gateway.ts';
import { acpHostEngine } from '../acp-host.ts';
import { observerAgentService } from '../observer-agent.ts';

export const sessionsRouter = Router();

const sessionsMap: Map<string, Session> = new Map();
const sessionsStorageDir = path.join(config.storageDir, 'sessions');

if (!fs.existsSync(sessionsStorageDir)) {
  fs.mkdirSync(sessionsStorageDir, { recursive: true });
}

function saveSession(session: Session) {
  fs.writeFileSync(
    path.join(sessionsStorageDir, `${session.id}.json`),
    JSON.stringify(session, null, 2)
  );
}

// Load existing persisted sessions
try {
  const files = fs.readdirSync(sessionsStorageDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(path.join(sessionsStorageDir, file), 'utf-8'));
      sessionsMap.set(data.id, data);
    }
  }
} catch {
  // Empty
}

export function getSession(id: string): Session | undefined {
  return sessionsMap.get(id);
}

sessionsRouter.get('/sessions', (req, res) => {
  const list = Array.from(sessionsMap.values()).map(s => {
    const costSummary = costEngine.getSessionCost(s.id);
    return {
      ...s,
      cost: {
        currency: 'USD' as const,
        inputCostUsd: 0,
        outputCostUsd: 0,
        cachedCostUsd: 0,
        totalCostUsd: costSummary.totalCostUsd,
        formattedTotal: costSummary.formattedTotal
      }
    };
  }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ count: list.length, sessions: list });
});

sessionsRouter.post('/sessions', async (req, res) => {
  const input: SessionCreateInput = req.body;
  if (!input.name || !input.repoPath) {
    return res.status(400).json({ error: 'name and repoPath are required' });
  }

  const macroGoal = input.macroGoal || '';
  const sessionId = `smith-${Date.now()}-${uuidv4().substring(0, 6)}`;
  const branchName = `smith/${input.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
  const bankId = `bank-${sessionId}`;

  // 1. Create isolated Git worktree
  const worktree = await worktreeManager.createWorktree(input.repoPath, branchName, input.baseBranch || 'main');

  // 2. Ensure Hindsight memory bank exists
  await hindsightService.ensureBank(bankId);
  const retainNote = macroGoal
    ? `[Session Created] ${input.name}. Macro Goal: ${macroGoal}`
    : `[Session Created] ${input.name}. Isolated worktree branch: ${branchName}`;
  await hindsightService.retain(bankId, retainNote, {
    category: 'decision'
  });

  // 3. Configure customizations, observer harness & orchestrator agent
  const orchestratorConfig: OrchestratorConfig = input.orchestrator || {
    agentId: 'antigravity',
    model: 'gemini-2.5-pro'
  };
  const observerConfig: ObserverConfig = input.observer || {
    agentId: 'antigravity',
    model: 'gemini-2.5-pro',
    enabled: true
  };
  const customizations = {
    plugins: input.plugins || [],
    skills: input.skills || ['code-review'],
    mcpServers: (input.customMcpServers || []).reduce((acc, s) => {
      acc[s.id] = s;
      return acc;
    }, {} as any),
    observer: observerConfig,
    orchestrator: orchestratorConfig
  };
  mcpGateway.setSessionCustomizations(sessionId, customizations);
  observerAgentService.setSessionConfig(sessionId, observerConfig);

  // 4. Initialize Session agents (supports multiple workers per agent)
  const agentsMap: Record<string, any> = {};
  for (let idx = 0; idx < (input.agents || []).length; idx++) {
    const agentCfg = input.agents[idx];
    const workerKey = agentCfg.workerId || (agentsMap[agentCfg.agentId] ? `${agentCfg.agentId}-${idx + 1}` : agentCfg.agentId);
    agentsMap[workerKey] = {
      config: { ...agentCfg, workerId: workerKey },
      status: 'idle',
      metrics: {
        agentId: agentCfg.agentId,
        model: agentCfg.model,
        usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0 },
        cost: { currency: 'USD', inputCostUsd: 0, outputCostUsd: 0, cachedCostUsd: 0, totalCostUsd: 0, formattedTotal: '$0.00' },
        turnCount: 0,
        startTime: Date.now(),
        lastActiveTime: Date.now()
      }
    };
    // Spawn agent in worktree
    acpHostEngine.spawnAgent(sessionId, agentCfg.agentId, agentCfg.model, worktree.path, workerKey);
  }

  // 5. Seed initial cooperative task in DAG only if macroGoal is provided
  const tasks: Record<string, Task> = {};
  if (macroGoal) {
    const initialTask = taskLeaseManager.createTask(sessionId, {
      title: `Phase 1: Architecture & Planning for ${input.name}`,
      description: `Analyze requirements and implement the primary goal: ${macroGoal}`,
      fileScope: ['*'],
      suggestedAgent: input.agents?.[0]?.agentId
    });
    tasks[initialTask.id] = initialTask;
  }

  const session: Session = {
    id: sessionId,
    name: input.name,
    repoPath: input.repoPath,
    macroGoal,
    bankId,
    worktree,
    agents: agentsMap,
    customizations,
    tasks,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cost: {
      currency: 'USD',
      inputCostUsd: 0,
      outputCostUsd: 0,
      cachedCostUsd: 0,
      totalCostUsd: 0,
      formattedTotal: '$0.00'
    }
  };

  sessionsMap.set(sessionId, session);
  saveSession(session);

  res.status(201).json(session);
});

sessionsRouter.get('/sessions/:id', (req, res) => {
  const session = sessionsMap.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const costSummary = costEngine.getSessionCost(session.id);
  res.json({
    ...session,
    tasks: taskLeaseManager.getTasks(session.id),
    locks: taskLeaseManager.getActiveLocks(session.id),
    cost: {
      currency: 'USD',
      inputCostUsd: 0,
      outputCostUsd: 0,
      cachedCostUsd: 0,
      totalCostUsd: costSummary.totalCostUsd,
      formattedTotal: costSummary.formattedTotal
    }
  });
});

sessionsRouter.delete('/sessions/:id', async (req, res) => {
  const session = sessionsMap.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Terminate agents
  for (const agentId of Object.keys(session.agents)) {
    acpHostEngine.terminateAgent(session.id, agentId);
  }

  // Remove worktree
  await worktreeManager.removeWorktree(session.repoPath, session.worktree.path);

  sessionsMap.delete(req.params.id);
  const filePath = path.join(sessionsStorageDir, `${session.id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  res.json({ status: 'terminated', sessionId: req.params.id });
});

sessionsRouter.post('/sessions/batch-delete', async (req, res) => {
  const { sessionIds } = req.body;
  if (!Array.isArray(sessionIds)) {
    return res.status(400).json({ error: 'sessionIds array required' });
  }

  const deleted: string[] = [];
  for (const id of sessionIds) {
    const session = sessionsMap.get(id);
    if (session) {
      for (const agentId of Object.keys(session.agents)) {
        try {
          acpHostEngine.terminateAgent(session.id, agentId);
        } catch {}
      }

      try {
        await worktreeManager.removeWorktree(session.repoPath, session.worktree.path);
      } catch {}

      sessionsMap.delete(id);
      const filePath = path.join(sessionsStorageDir, `${session.id}.json`);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
      deleted.push(id);
    }
  }

  res.json({ status: 'batch_deleted', count: deleted.length, deleted });
});
