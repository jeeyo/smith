import { Router } from 'express';
import { getSession } from './sessions.router.ts';
import { taskLeaseManager, TaskConflictError } from '../task-lease-manager.ts';

export const tasksRouter = Router();

tasksRouter.get('/sessions/:id/tasks', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const tasks = taskLeaseManager.getTasks(session.id);
  const locks = taskLeaseManager.getActiveLocks(session.id);

  res.json({ count: tasks.length, tasks, locks });
});

tasksRouter.post('/sessions/:id/tasks', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { title, description, fileScope, suggestedAgent, dependencies, delegatedBy } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  const task = taskLeaseManager.createTask(session.id, {
    title,
    description,
    fileScope,
    suggestedAgent,
    dependencies,
    delegatedBy
  });

  res.status(201).json(task);
});

tasksRouter.post('/sessions/:id/tasks/:taskId/claim', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { agentId, fileScope } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required to claim task' });

  try {
    const task = taskLeaseManager.claimTask(session.id, req.params.taskId, agentId, fileScope);
    res.json({ status: 'claimed', task });
  } catch (err: any) {
    if (err instanceof TaskConflictError) {
      return res.status(409).json({
        error: 'TaskConflictError',
        message: err.message,
        conflictingAgent: err.conflictingAgent,
        conflictingFile: err.conflictingFile
      });
    }
    res.status(400).json({ error: err.message });
  }
});

tasksRouter.post('/sessions/:id/tasks/:taskId/release', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  try {
    const task = taskLeaseManager.releaseTask(session.id, req.params.taskId, agentId);
    res.json({ status: 'released', task });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

tasksRouter.post('/sessions/:id/tasks/:taskId/complete', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { agentId, notes } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  try {
    const task = await taskLeaseManager.completeTask(session.id, req.params.taskId, agentId, notes, session.bankId);
    res.json({ status: 'completed', task });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
