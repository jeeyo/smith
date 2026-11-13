import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { BoardError, parseSpecTasks } from './board.ts';
import { boardStore } from './board-store.ts';
import { sessionStore } from './session-store.ts';
import { sessionChat } from './session-chat.ts';
import { scheduler } from './scheduler.ts';
import { worktreeManager } from './worktree-manager.ts';
import { isHarness } from './adapters/index.ts';
import { BoardLogEntry, HarnessId, Tier } from '../shared/board.ts';
import { GoalChatMessage, Session } from '../shared/types.ts';

/**
 * The seam between the user and the team: turning what the user types into a goal, a card or
 * an answer, and reporting back in the chat what the board decides.
 */

const specsDir = path.join(config.storageDir, 'specs');

/** Puts the session's configured workers on its board. */
export function syncPeers(session: Session) {
  const board = boardStore.get(session.id);
  board.setPeers(
    Object.entries(session.agents)
      .filter(([, a]) => isHarness(a.config.agentId))
      .map(([id, a]) => ({
        id,
        harness: a.config.agentId as HarnessId,
        model: a.config.model,
        tier: (a.config.tier || 2) as Tier
      }))
  );
  if (board.data.reviewMode !== session.reviewMode) board.setReviewMode(session.reviewMode);
}

/** If the text names a spec file inside the repository, returns its path. */
function specFileFromInput(session: Session, text: string): string | null {
  const candidate = text.trim();
  if (!/\.(md|markdown|txt)$/i.test(candidate) || candidate.includes('\n')) return null;
  for (const root of [session.worktree.path, session.repoPath]) {
    const full = path.resolve(root, candidate);
    const rel = path.relative(root, full);
    if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      return full;
    }
  }
  return null;
}

/**
 * Starts a goal from an approved spec. The spec is either a file in the repository named by
 * the user, or the user's own words saved as the spec. A `smith-tasks` block at its end
 * becomes the first cards; without one the team is asked to break the goal down itself.
 */
export function startGoal(session: Session, input: string): GoalChatMessage {
  const board = boardStore.get(session.id);
  syncPeers(session);

  let specPath = specFileFromInput(session, input);
  let specText: string;
  let goalText: string;

  if (specPath) {
    specText = fs.readFileSync(specPath, 'utf-8');
    const heading = specText.match(/^#\s+(.+)$/m);
    goalText = heading ? heading[1].trim() : path.basename(specPath);
  } else {
    fs.mkdirSync(specsDir, { recursive: true });
    specPath = path.join(specsDir, `${session.id}.md`);
    specText = input.trim();
    goalText = input.trim();
    fs.writeFileSync(specPath, `${specText}\n`, 'utf-8');
  }

  const tasks = parseSpecTasks(specText);
  board.startGoal(goalText, specPath, tasks);

  session.macroGoal = goalText;
  session.specPath = specPath;
  sessionStore.save(session);
  scheduler.poke(session.id);

  const peers = board.activePeers();
  return sessionChat.post(session.id, {
    sender: 'board',
    kind: 'info',
    content: tasks
      ? `Goal started with ${tasks.tasks.length} card(s) from the spec. ${peers.length} worker(s) on the team.`
      : `Goal started. The spec has no task list, so the team will break it into cards first. ${peers.length} worker(s) on the team.`
  });
}

/**
 * Routes what the user typed in the session chat:
 * a first message starts a goal; "resume" resumes a paused one; with one question open it is
 * the answer; otherwise it becomes a new card for the team.
 */
export function handleUserInput(session: Session, input: string): GoalChatMessage {
  const text = input.trim();
  const board = boardStore.get(session.id);
  sessionChat.post(session.id, { sender: 'user', kind: 'goal', content: text });

  if (Object.keys(session.agents).length === 0) {
    return sessionChat.post(session.id, { sender: 'board', kind: 'error', content: 'This session has no workers. Add at least one worker to start a goal.' });
  }

  const status = board.data.goal.status;
  if (status === 'idle' || status === 'completed') {
    return startGoal(session, text);
  }

  if (status === 'paused' && /^(resume|continue|go on|carry on|proceed)[.!]?$/i.test(text)) {
    board.resume();
    scheduler.poke(session.id);
    return sessionChat.post(session.id, { sender: 'board', kind: 'info', content: 'Resumed.' });
  }

  const waiting = board.cards().filter(c => c.state === 'needs_user');
  const named = text.match(/^(c\d+)\s*[:\-]\s*([\s\S]+)$/i);
  const target = named ? waiting.find(c => c.id === named[1].toLowerCase()) : waiting.length === 1 ? waiting[0] : undefined;
  if (target) {
    board.answerUser(target.id, named ? named[2] : text);
    scheduler.poke(session.id);
    return sessionChat.post(session.id, { sender: 'board', kind: 'info', cardId: target.id, content: `Passed your answer to the team on ${target.id}.` });
  }
  if (waiting.length > 1) {
    return sessionChat.post(session.id, {
      sender: 'board',
      kind: 'info',
      content: `${waiting.length} cards are waiting for you (${waiting.map(c => c.id).join(', ')}). Answer each on its card, or start your message with the card id, for example "${waiting[0].id}: …".`
    });
  }

  const card = board.createByUser({
    title: text.length > 70 ? `${text.slice(0, 67)}…` : text,
    description: text,
    acceptance: ["The user's request is carried out"],
    fileScope: ['*']
  });
  if (status === 'paused') board.resume();
  scheduler.poke(session.id);
  return sessionChat.post(session.id, { sender: 'board', kind: 'info', cardId: card.id, content: `Added to the board as ${card.id}. The team will pick it up.` });
}

export function answerCard(session: Session, cardId: string, answer: string): GoalChatMessage {
  const board = boardStore.get(session.id);
  board.answerUser(cardId, answer);
  sessionChat.post(session.id, { sender: 'user', kind: 'answer', cardId, content: answer.trim() });
  scheduler.poke(session.id);
  return sessionChat.post(session.id, { sender: 'board', kind: 'info', cardId, content: `Passed your answer to the team on ${cardId}.` });
}

/** Turns the board changes the user needs to know about into chat messages. */
async function announce(sessionId: string, entry: BoardLogEntry) {
  const session = sessionStore.get(sessionId);
  if (!session) return;
  const board = boardStore.get(sessionId);

  // Any card that has just started waiting for the user is put to them, however it got there
  // (a peer asked, it bounced too often, or nobody on the team may take it).
  const history = sessionChat.history(sessionId);
  for (const card of board.cards()) {
    if (card.state !== 'needs_user') continue;
    const question = [...card.thread].reverse().find(n => n.kind === 'question');
    const content = `**${card.title}** (${card.id}) needs you${question && question.author !== 'board' ? `, asked by @${question.author}` : ''}:\n\n${question?.text || 'How should the team proceed?'}`;
    if (history.some(m => m.kind === 'question' && m.cardId === card.id && m.content === content)) continue;
    sessionChat.post(sessionId, { sender: 'board', kind: 'question', cardId: card.id, content });
  }

  switch (entry.action) {
    case 'goal_paused':
      sessionChat.post(sessionId, { sender: 'board', kind: 'paused', content: `Paused. ${entry.reason || ''}` });
      break;
    case 'goal_waiting':
      sessionChat.post(sessionId, { sender: 'board', kind: 'info', content: entry.reason || 'Waiting.' });
      break;
    case 'peers_removed':
      sessionChat.post(sessionId, {
        sender: 'board',
        kind: 'info',
        content: `${(entry.detail || '').split(', ').map(p => `@${p}`).join(', ')} left the team: ${entry.reason}. Their cards went back to the board; they rejoin by themselves once the limit resets.`
      });
      break;
    case 'peer_rejoined':
      sessionChat.post(sessionId, { sender: 'board', kind: 'info', content: `@${entry.detail} rejoined the team.` });
      break;
    case 'goal_completed': {
      let diffSummary;
      try {
        diffSummary = await worktreeManager.getDiffSummary(session.worktree.path, session.worktree.branch, session.worktree.baseBranch);
      } catch {}
      const done = board.cards().filter(c => c.state === 'done' && c.kind === 'work').length;
      sessionChat.post(sessionId, {
        sender: 'board',
        kind: 'completed',
        cardId: entry.cardId,
        content: `Goal verified and complete: ${done} work card(s) merged into \`${session.worktree.branch}\`.\n\n${entry.detail || ''}`,
        diffSummary
      });
      break;
    }
    case 'verify_failed':
      sessionChat.post(sessionId, { sender: 'board', kind: 'info', cardId: entry.cardId, content: `Verification failed: ${entry.detail || ''}\n\nThe team is working on it.` });
      break;
  }
}

let wired = false;
/** Connects board changes to the chat. Called once at startup. */
export function startTeamAnnouncements() {
  if (wired) return;
  wired = true;
  boardStore.on('changed', ({ sessionId, entry }) => {
    announce(sessionId, entry).catch(err => console.error('[team] announce failed:', err));
  });
}

export { BoardError };
