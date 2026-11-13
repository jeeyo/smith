import { Router } from 'express';
import { getSession, sessionStore } from '../session-store.ts';
import { boardStore } from '../board-store.ts';
import { scheduler } from '../scheduler.ts';
import { answerCard } from '../team.ts';
import { BoardError } from '../board.ts';
import { BOARD_TOOLS } from '../board-tools.ts';
import { CardPatch, ReviewMode } from '../../shared/board.ts';

export const boardRouter = Router();

function fail(res: any, err: any) {
  res.status(err instanceof BoardError ? (err.code === 'not_found' ? 404 : 400) : 500).json({ error: err.message, code: err.code });
}

/** The whole board, its recent change log, and the agent turns running now or recently. */
boardRouter.get('/sessions/:id/board', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const board = boardStore.get(session.id);
  res.json({
    board: board.data,
    log: boardStore.log(session.id, 200),
    runningTurns: scheduler.runningTurns(session.id),
    recentTurns: scheduler.recentTurns(session.id).slice(-30)
  });
});

/** The tools peers have, for reference. */
boardRouter.get('/board/tools', (_req, res) => {
  res.json({ count: BOARD_TOOLS.length, tools: BOARD_TOOLS });
});

boardRouter.post('/sessions/:id/board/cards/:cardId/answer', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const answer = String(req.body?.answer || '').trim();
  if (!answer) return res.status(400).json({ error: 'answer is required' });
  try {
    res.json({ status: 'answered', message: answerCard(session, req.params.cardId, answer) });
  } catch (err) {
    fail(res, err);
  }
});

/** The user may change an open card directly, for example to lower its minimum tier. */
boardRouter.put('/sessions/:id/board/cards/:cardId', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const body = req.body || {};
  const patch: CardPatch = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.description === 'string') patch.description = body.description;
  if (Array.isArray(body.acceptance)) patch.acceptance = body.acceptance.map(String);
  if (Array.isArray(body.fileScope)) patch.fileScope = body.fileScope.map(String);
  if (Array.isArray(body.dependsOn)) patch.dependsOn = body.dependsOn.map(String);
  if (body.minTier === null || [1, 2, 3].includes(body.minTier)) patch.minTier = body.minTier;
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to change' });
  try {
    const board = boardStore.get(session.id);
    board.userEdit(req.params.cardId, patch);
    scheduler.poke(session.id);
    res.json({ status: 'edited', card: board.card(req.params.cardId) });
  } catch (err) {
    fail(res, err);
  }
});

boardRouter.post('/sessions/:id/board/pause', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const board = boardStore.get(session.id);
  board.pause('Paused by you. Turns already running will finish.');
  res.json({ status: board.data.goal.status });
});

boardRouter.post('/sessions/:id/board/resume', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const board = boardStore.get(session.id);
  board.resume();
  scheduler.poke(session.id);
  res.json({ status: board.data.goal.status });
});

/** Review mode and limits. A new review mode applies to cards submitted from now on. */
boardRouter.put('/sessions/:id/board/settings', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const board = boardStore.get(session.id);
  const { reviewMode, limits } = req.body || {};
  if (reviewMode !== undefined) {
    if (!['fast', 'normal', 'thorough'].includes(reviewMode)) return res.status(400).json({ error: 'reviewMode must be fast, normal or thorough' });
    board.setReviewMode(reviewMode as ReviewMode);
    session.reviewMode = reviewMode;
    sessionStore.save(session);
  }
  if (limits && typeof limits === 'object') board.setLimits(limits);
  res.json({ status: 'saved', reviewMode: board.data.reviewMode, limits: board.data.limits });
});
