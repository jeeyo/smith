import { Router } from 'express';
import { goalOrchestrator } from '../goal-orchestrator.ts';
import { getSession } from './sessions.router.ts';
import { worktreeManager } from '../worktree-manager.ts';
import { hindsightService } from '../hindsight-service.ts';
import { costEngine } from '../cost-engine.ts';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionCreateInput } from '../../shared/types.ts';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.ts';

export const goalRouter = Router();

const sessionsStorageDir = path.join(config.storageDir, 'sessions');

// Seed default welcome message if chat history is empty
function ensureInitialChat(sessionId: string, session: Session) {
  const history = goalOrchestrator.getChatHistory(sessionId);
  if (history.length === 0) {
    goalOrchestrator.setChatHistory(sessionId, [
      {
        id: `welcome-${sessionId}`,
        sender: 'orchestrator',
        content: `Welcome to Smith! I am your cooperative multi-agent orchestrator. Declare your goal below—I will automatically consult Vectorize Hindsight, decompose the work into non-racing subtasks, lock file scopes, and execute across Claude, Codex, and Gemini in isolated worktrees.`,
        timestamp: session.createdAt || Date.now(),
        status: 'completed'
      }
    ]);
  }
}

/**
 * GET /api/v1/sessions/:id/chat
 * Returns full conversational timeline for the single chat interface.
 */
goalRouter.get('/sessions/:id/chat', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  ensureInitialChat(session.id, session);
  const messages = goalOrchestrator.getChatHistory(session.id);
  res.json({ sessionId: session.id, count: messages.length, messages });
});

/**
 * POST /api/v1/sessions/:id/goal
 * Handles user input in the session chat (goals, questions, approvals, or agent mentions).
 */
goalRouter.post('/sessions/:id/goal', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { goal, autoStart } = req.body;
  if (!goal || typeof goal !== 'string') {
    return res.status(400).json({ error: 'goal string is required' });
  }

  try {
    const result = await goalOrchestrator.handleSessionInput(session.id, goal, { autoStart });
    res.status(200).json({
      status: 'success',
      sessionId: session.id,
      message: result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sessions/:id/goal/start
 * Explicit endpoint to start execution of a plan awaiting approval.
 */
goalRouter.post('/sessions/:id/goal/start', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const result = await goalOrchestrator.startExecution(session.id);
    res.status(200).json({
      status: 'success',
      sessionId: session.id,
      message: result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sessions/:id/chat/message
 * Handles follow-up conversational messages or queries about the session.
 */
goalRouter.post('/sessions/:id/chat/message', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });

  const history = goalOrchestrator.getChatHistory(session.id);

  const userMsg = {
    id: `msg-${Date.now()}-${uuidv4().substring(0, 6)}`,
    sender: 'user' as const,
    content,
    timestamp: Date.now()
  };
  history.push(userMsg);

  // Compute live contextual response
  const cost = costEngine.getSessionCost(session.id);
  const tasks = session.tasks ? Object.values(session.tasks) : [];
  const activeLocks = Object.keys(session.agents || {}).map(a => `${a}: active`);

  const reply = {
    id: `reply-${Date.now()}-${uuidv4().substring(0, 6)}`,
    sender: 'orchestrator' as const,
    content: `Understood! I've logged this directive. Current session status: ${tasks.length} total tasks tracked, cumulative compute cost is ${cost.formattedTotal} (${cost.totalTokens.toLocaleString()} tokens). Would you like to refine the goal or dispatch another subtask?`,
    timestamp: Date.now(),
    status: 'completed' as const
  };
  history.push(reply);

  goalOrchestrator.setChatHistory(session.id, history);
  res.json({ userMessage: userMsg, reply });
});

/**
 * POST /api/v1/sessions/:id/chat/answer
 * Submits user response to an interactive question asked by the orchestrator or worker agents.
 */
goalRouter.post('/sessions/:id/chat/answer', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { messageId, questionId, selectedOptions = [], customAnswer = '' } = req.body;
  if (!questionId) return res.status(400).json({ error: 'questionId is required' });

  try {
    const result = await goalOrchestrator.answerQuestion(
      session.id,
      messageId,
      questionId,
      selectedOptions,
      customAnswer
    );
    res.json({ success: true, status: 'answered', ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
