import { Router } from 'express';
import { getSession } from '../session-store.ts';
import { sessionChat } from '../session-chat.ts';
import { handleUserInput } from '../team.ts';
import { BoardError } from '../board.ts';

export const goalRouter = Router();

/** The conversation for a session: the user's messages and what the board reported back. */
goalRouter.get('/sessions/:id/chat', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const messages = sessionChat.history(session.id);
  res.json({ sessionId: session.id, count: messages.length, messages });
});

/**
 * Whatever the user types in the session chat. A first message starts a goal; later ones
 * answer the team's question, resume a paused goal, or become a new card.
 */
goalRouter.post('/sessions/:id/goal', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { goal } = req.body || {};
  if (!goal || typeof goal !== 'string' || !goal.trim()) {
    return res.status(400).json({ error: 'goal string is required' });
  }

  try {
    const message = handleUserInput(session, goal);
    res.json({ status: 'success', sessionId: session.id, message });
  } catch (err: any) {
    res.status(err instanceof BoardError ? 400 : 500).json({ error: err.message });
  }
});
