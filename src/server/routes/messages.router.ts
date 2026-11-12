import { Router } from 'express';
import { getSession } from './sessions.router.ts';
import { teamBus } from '../team-bus.ts';

export const messagesRouter = Router();

messagesRouter.get('/sessions/:id/messages', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const since = req.query.since ? Number(req.query.since) : undefined;
  const messages = teamBus.getMessages(session.id, since);

  res.json({ count: messages.length, messages });
});

messagesRouter.post('/sessions/:id/messages', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { sender, type, content, metadata } = req.body;
  if (!sender || !type || !content) {
    return res.status(400).json({ error: 'sender, type, and content are required' });
  }

  const message = await teamBus.broadcast(session.id, {
    sender,
    type,
    content,
    metadata
  }, session.bankId);

  res.status(201).json(message);
});
