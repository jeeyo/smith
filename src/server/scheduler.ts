import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Board, WakeReason } from './board.ts';
import { boardStore } from './board-store.ts';
import { boardTools } from './board-tools.ts';
import { worktreeManager } from './worktree-manager.ts';
import { sessionStore } from './session-store.ts';
import { issueTurnToken, onToolCall, revokeTurnToken } from './mcp-server.ts';
import { workerServers } from './mcp-connections.ts';
import { getAgentAdapter, TurnRequest, TurnResult } from './adapters/index.ts';
import { agentHealthEngine } from './agent-health.ts';
import { costEngine } from './cost-engine.ts';
import { resolveFor } from './catalog.ts';
import { config } from './config.ts';
import { Card, Peer, PeerId, TurnRecord } from '../shared/board.ts';
import { Session } from '../shared/types.ts';

/**
 * Wakes idle peers when there is something for them to look at, and runs their turns.
 * It holds no opinion about the plan: which card a peer takes and what it does with it is
 * the peer's decision, made through the board tools (docs/designs/peer-board.md, section 7).
 *
 * Events: 'turn:started' / 'turn:ended' (TurnRecord).
 */

/** How often a removed peer with no known reset time is let back in to try again. */
const REJOIN_RECHECK_MS = 10 * 60_000;
const TICK_INTERVAL_MS = 30_000;
const MAX_TURN_HISTORY = 100;
/** Turns in a row a peer may end without touching the board before its card is taken away. */
const MAX_SILENT_TURNS = 2;
/** Turns in a row a peer may continue a card without changing its files before it goes back. */
const MAX_STALLED_TURNS = 3;

/** Changes when a card's files change; without a git worktree, when the card itself does. */
async function progressMark(card: Card | undefined): Promise<string | undefined> {
  if (!card) return undefined;
  const files = card.worktreePath ? await worktreeManager.fingerprint(card.worktreePath).catch(() => undefined) : undefined;
  return files ?? `card:${card.updatedAt}`;
}

export type TurnRunner = (peer: Peer, request: TurnRequest) => Promise<TurnResult>;

interface RunningTurn {
  record: TurnRecord;
  toolCalls: number;
  abort: AbortController;
}

export class Scheduler extends EventEmitter {
  private running: Map<string, Map<PeerId, RunningTurn>> = new Map();
  private history: Map<string, TurnRecord[]> = new Map();
  private rotation: Map<string, number> = new Map();
  private silentTurns: Map<string, number> = new Map();
  private stalledTurns: Map<string, { peer: PeerId; turns: number }> = new Map();
  private pending: Set<string> = new Set();
  private ticking: Set<string> = new Set();
  private timer?: NodeJS.Timeout;
  private nextTurn = 1;

  /** Replaced in tests to run scripted peers instead of real CLIs. */
  turnRunner: TurnRunner = (peer, request) => getAgentAdapter(peer.harness).runTurn(request);

  /** Where turns reach the board. Set once the HTTP server is listening. */
  mcpUrl = `http://127.0.0.1:${config.port}/mcp/board`;

  private wired = false;

  start() {
    if (!this.wired) {
      this.wired = true;
      boardStore.on('changed', ({ sessionId }) => this.poke(sessionId));
      onToolCall(ctx => {
        const turn = this.running.get(ctx.sessionId)?.get(ctx.peerId);
        if (turn) turn.toolCalls += 1;
      });
    }
    if (!this.timer) {
      this.timer = setInterval(() => {
        for (const session of sessionStore.list()) {
          if (boardStore.has(session.id) && boardStore.get(session.id).data.goal.status === 'running') {
            this.poke(session.id);
          }
        }
      }, TICK_INTERVAL_MS);
      this.timer.unref?.();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Asks for a pass over a session's board. Calls made close together are merged into one. */
  poke(sessionId: string) {
    if (this.pending.has(sessionId)) return;
    this.pending.add(sessionId);
    setImmediate(() => {
      this.pending.delete(sessionId);
      this.tick(sessionId).catch(err => console.error(`[scheduler] tick failed for ${sessionId}:`, err));
    });
  }

  /** Re-examines every running goal, for example after the agent CLIs were re-checked. */
  pokeAll() {
    for (const session of sessionStore.list()) {
      if (boardStore.has(session.id)) this.poke(session.id);
    }
  }

  runningTurns(sessionId: string): TurnRecord[] {
    return Array.from(this.running.get(sessionId)?.values() || []).map(t => t.record);
  }

  recentTurns(sessionId: string): TurnRecord[] {
    return this.history.get(sessionId) || [];
  }

  /** True while any turn of the session is in flight. */
  isBusy(sessionId: string): boolean {
    return (this.running.get(sessionId)?.size || 0) > 0;
  }

  /** Drops a deleted session, stopping its turns so they cannot write to its board again. */
  forget(sessionId: string) {
    for (const turn of this.running.get(sessionId)?.values() || []) turn.abort.abort();
    this.running.delete(sessionId);
    this.history.delete(sessionId);
    this.rotation.delete(sessionId);
    for (const key of this.stalledTurns.keys()) {
      if (key.startsWith(`${sessionId}:`)) this.stalledTurns.delete(key);
    }
  }

  private harnessReady(peer: Peer): boolean {
    const health = agentHealthEngine.get(peer.harness);
    return !health || health.status === 'ready';
  }

  async tick(sessionId: string): Promise<void> {
    if (this.ticking.has(sessionId)) {
      // A pass is already running; make sure another follows it.
      this.pending.delete(sessionId);
      setImmediate(() => this.poke(sessionId));
      return;
    }
    const session = sessionStore.get(sessionId);
    if (!session || !boardStore.has(sessionId)) return;
    const board = boardStore.get(sessionId);
    if (board.data.goal.status !== 'running') return;

    this.ticking.add(sessionId);
    try {
      const running = this.running.get(sessionId) || new Map<PeerId, RunningTurn>();
      this.running.set(sessionId, running);
      const busy = new Set(running.keys());

      board.expireLeases(busy);
      for (const peer of board.peersDueToRejoin(REJOIN_RECHECK_MS)) {
        board.rejoin(peer.id);
      }

      // Wake idle peers in rotating order so one fast peer does not take every card.
      const peers = board.activePeers().filter(p => !busy.has(p.id) && this.harnessReady(p));
      const offset = this.rotation.get(sessionId) || 0;
      this.rotation.set(sessionId, offset + 1);
      const ordered = peers.map((_, i) => peers[(i + offset) % peers.length]);

      // Two peers woken for the same card would race and one would waste its turn, so each
      // is pointed at a different claimable card. It is a hint; the peer may claim another.
      const hinted = new Set<string>(Array.from(running.values()).map(t => t.record.cardId).filter(Boolean) as string[]);
      const stillIdle: PeerId[] = [];

      for (const peer of ordered) {
        if (board.data.goal.status !== 'running') break;
        const reason = board.wakeReason(peer.id);
        if (!reason) {
          stillIdle.push(peer.id);
          continue;
        }
        let cardId: string;
        if (reason.kind === 'claimable') {
          const free = reason.cardIds.find(id => !hinted.has(id));
          if (!free) {
            stillIdle.push(peer.id);
            continue;
          }
          cardId = free;
        } else {
          cardId = reason.cardId;
        }
        hinted.add(cardId);
        this.startTurn(session, board, peer, reason, cardId);
      }

      board.escalateOrphans(stillIdle, hinted);

      if (this.running.get(sessionId)!.size === 0 && board.data.goal.status === 'running') {
        this.settle(board);
      } else if (this.running.get(sessionId)!.size > 0) {
        board.setWaiting(undefined);
      }
    } finally {
      this.ticking.delete(sessionId);
    }
  }

  /** Nothing is running and nothing was started: work out why. */
  private settle(board: Board) {
    if (board.ensureVerifyCard()) return; // The change wakes the scheduler again.

    const open = board.openCards();
    if (open.length === 0) return;

    const active = board.activePeers();
    const removed = Object.values(board.data.peers).filter(p => p.status === 'removed');

    if (active.length === 0) {
      const resets = removed.map(p => p.removed?.rejoinAt).filter((t): t is number => typeof t === 'number');
      const when = resets.length > 0 ? ` The earliest reset is ${new Date(Math.min(...resets)).toLocaleString()}.` : '';
      board.setWaiting(
        removed.length > 0
          ? `Every worker has reached its usage limit, so nobody can work.${when} Work resumes when one rejoins.`
          : 'This session has no workers. Add one to continue.'
      );
      return;
    }

    const notReady = active.filter(p => !this.harnessReady(p));
    if (notReady.length === active.length) {
      const names = Array.from(new Set(notReady.map(p => agentHealthEngine.get(p.harness)?.name || p.harness))).join(', ');
      const details = Array.from(new Set(notReady.map(p => agentHealthEngine.get(p.harness)?.message).filter(Boolean))).join(' ');
      board.setWaiting(`No worker can run: ${names} is not ready. ${details} Check login and the binary path in App Settings, then re-check the agent CLIs.`.replace(/\s+/g, ' '));
      return;
    }

    if (open.some(c => c.state === 'needs_user')) {
      board.setWaiting('The team is waiting for your answer.');
      return;
    }

    // A handed-in card whose merge never ran (the server restarted, say) is merged now.
    if (boardTools.resumeMerges(board.sessionId) > 0) return;
    if (open.some(c => boardTools.isMerging(board.sessionId, c.id))) return;

    // An offer or a merge may still resolve by itself on a later pass.
    const now = Date.now();
    if (open.some(c => (c.offeredTo && c.offeredTo.until > now) || c.state === 'in_review')) {
      if (open.every(c => c.state === 'in_review' || c.state === 'blocked')) {
        board.pause(`The team is stuck: ${open.map(c => `${c.id} is ${c.state}`).join(', ')}. Nothing can move without you.`);
      }
      return;
    }

    board.pause(
      `The team is stuck: no worker can take any of the open cards (${open.map(c => `${c.id} ${c.state}`).join(', ')}). Review the board and resume.`
    );
  }

  private startTurn(session: Session, board: Board, peer: Peer, reason: WakeReason, cardId: string) {
    board.countTurn(peer.id);

    const card = board.data.cards[cardId];
    const record: TurnRecord = {
      id: `t${this.nextTurn++}`,
      sessionId: session.id,
      peer: peer.id,
      harness: peer.harness,
      model: peer.model,
      reason: reason.kind,
      cardId,
      startedAt: Date.now()
    };
    const turn: RunningTurn = { record, toolCalls: 0, abort: new AbortController() };
    this.running.get(session.id)!.set(peer.id, turn);
    this.emit('turn:started', record);

    const token = issueTurnToken({ sessionId: session.id, peerId: peer.id });
    // Only a turn that continues a card it already holds can show whether the card moved.
    const watched = reason.kind === 'continue' ? card : undefined;

    const run = async (): Promise<TurnResult> => {
      const { cwd, scratch } = await this.turnDirectory(session, peer, reason, card);
      const request: TurnRequest = {
        prompt: buildTurnPrompt(session, board, peer, reason, cardId, scratch),
        cwd,
        model: peer.model,
        mcp: { url: this.mcpUrl, token },
        timeoutMs: board.data.limits.turnTimeoutMs,
        signal: turn.abort.signal,
        // Skills and servers are resolved per worker: targets, plugins and ${WORKDIR} differ.
        extraMcpServers: workerServers(session.id, resolveFor(session.customizations, peer.id, cwd).mcpServers)
      };
      return this.turnRunner(peer, request);
    };

    let before: string | undefined;
    Promise.resolve()
      .then(async () => {
        if (watched) before = await progressMark(watched);
        return run();
      })
      .catch((err): TurnResult => ({ ok: false, text: '', error: err?.message || String(err) }))
      .then(async result => {
        const after = watched && before !== undefined ? await progressMark(board.data.cards[cardId]).catch(() => undefined) : undefined;
        this.finishTurn(session, board, peer, turn, result);
        if (watched && before !== undefined && !turn.abort.signal.aborted) this.trackProgress(session, board, peer, cardId, before === after);
      })
      .finally(() => {
        revokeTurnToken(token);
        this.poke(session.id);
      });
  }

  /**
   * Where a turn starts. A peer that holds a card starts in its work directory. Otherwise, when
   * the session is a real worktree, it starts in its own scratch checkout of the session branch,
   * so files it writes before claiming a card cannot reach the session branch.
   */
  private async turnDirectory(session: Session, peer: Peer, reason: WakeReason, card: Card | undefined): Promise<{ cwd: string; scratch: boolean }> {
    if (reason.kind !== 'claimable' && card?.worktreePath && fs.existsSync(card.worktreePath)) {
      return { cwd: card.worktreePath, scratch: false };
    }
    if (await boardTools.isManaged(session)) {
      try {
        return { cwd: await worktreeManager.prepareLobby(session.repoPath, session.worktree.branch, peer.id), scratch: true };
      } catch (err) {
        console.warn(`[scheduler] no scratch checkout for ${peer.id}; starting in the session worktree:`, err);
      }
    }
    return { cwd: session.worktree.path, scratch: false };
  }

  /** Counts a peer's turns on a held card that changed nothing, and takes the card back after a few. */
  private trackProgress(session: Session, board: Board, peer: Peer, cardId: string, unchanged: boolean) {
    const key = `${session.id}:${cardId}`;
    const card = board.data.cards[cardId];
    const previous = this.stalledTurns.get(key);
    if (!card || card.state !== 'claimed' || card.owner !== peer.id || !unchanged) {
      this.stalledTurns.delete(key);
      return;
    }
    const turns = previous?.peer === peer.id ? previous.turns + 1 : 1;
    if (turns >= MAX_STALLED_TURNS) {
      this.stalledTurns.delete(key);
      board.stalled(peer.id, cardId, turns);
    } else {
      this.stalledTurns.set(key, { peer: peer.id, turns });
    }
  }

  private finishTurn(session: Session, board: Board, peer: Peer, turn: RunningTurn, result: TurnResult) {
    if (turn.abort.signal.aborted) return;
    this.running.get(session.id)?.delete(peer.id);
    const record = turn.record;
    record.endedAt = Date.now();
    record.summary = (result.ok ? result.text : result.error || result.text || '').slice(0, 500);
    record.outcome = result.usageLimit ? 'usage_limit' : result.timedOut ? 'timeout' : result.ok ? 'ok' : 'failed';

    if (result.usage) {
      costEngine.recordTurn(session.id, peer.id, peer.model, result.usage, record.cardId);
    }

    const silentKey = `${session.id}:${peer.id}`;

    if (result.usageLimit) {
      // The harness and model leave the team; their cards go back to the board without penalty.
      board.removeForUsageLimit(peer.harness, peer.model, result.usageLimit.message, result.usageLimit.resetAt);
    } else if (result.notLoggedIn) {
      const current = agentHealthEngine.get(peer.harness);
      agentHealthEngine.setStatus(peer.harness, {
        agentId: peer.harness,
        name: current?.name || peer.harness,
        installed: true,
        binaryPath: current?.binaryPath,
        authenticated: false,
        status: 'not_logged_in',
        // Keep the CLI's own words: "not logged in" is inferred from them and may be wrong.
        message: `${current?.name || peer.harness} reported a login problem: ${(result.error || 'no details').slice(0, 300)}`,
        remediation: 'Log in from the in-app terminal, then re-check.',
        lastCheckedAt: Date.now()
      });
    } else if (!result.ok) {
      board.turnFailed(peer.id, result.error || 'The turn failed');
      // A timeout says the turn was slow, not that the CLI is broken for every peer using it.
      if (turn.toolCalls === 0 && !result.timedOut) {
        // A rejected CLI invocation cannot fail a card it never claimed. Without a health
        // gate it is immediately rescheduled until the entire goal budget is exhausted.
        const current = agentHealthEngine.get(peer.harness);
        agentHealthEngine.setStatus(peer.harness, {
          agentId: peer.harness,
          name: current?.name || peer.harness,
          installed: current?.installed ?? true,
          authenticated: current?.authenticated ?? false,
          binaryPath: current?.binaryPath,
          status: 'error',
          message: `${current?.name || peer.harness} failed before reaching the board: ${(result.error || 'no details').slice(0, 300)}`,
          remediation: 'Check the CLI configuration and error, then re-check the agent CLIs.',
          lastCheckedAt: Date.now()
        });
      }
    } else if (turn.toolCalls === 0) {
      // A turn that never touched the board changed nothing the team can see. Repeated, it
      // usually means the board tools are not reaching this harness.
      const silent = (this.silentTurns.get(silentKey) || 0) + 1;
      this.silentTurns.set(silentKey, silent);
      if (silent >= MAX_SILENT_TURNS) {
        this.silentTurns.set(silentKey, 0);
        board.turnFailed(peer.id, `@${peer.id} ended ${silent} turns in a row without using the board tools.`);
      }
    }
    if (turn.toolCalls > 0) this.silentTurns.set(silentKey, 0);

    const list = this.history.get(session.id) || [];
    list.push(record);
    if (list.length > MAX_TURN_HISTORY) list.splice(0, list.length - MAX_TURN_HISTORY);
    this.history.set(session.id, list);
    this.emit('turn:ended', record);
  }
}

// ---------------------------------------------------------------------------------------
// Turn prompt
// ---------------------------------------------------------------------------------------

function threadText(card: Card): string {
  if (card.thread.length === 0) return '  (no notes yet)';
  return card.thread
    .map(n => {
      const proposal = n.proposal ? ` [proposal ${n.id}, ${n.proposal.status}: ${JSON.stringify(n.proposal.patch)}]` : '';
      return `  - @${n.author} (${n.kind})${proposal}: ${n.text}`;
    })
    .join('\n');
}

function cardDetail(board: Board, card: Card): string {
  const deps = card.dependsOn
    .map(id => board.data.cards[id])
    .filter(Boolean)
    .map(d => `  - ${d.id} [${d.state}] ${d.title}${d.result?.summary ? ` — ${d.result.summary}` : ''}`);
  return [
    `Card ${card.id} (${card.kind}, ${card.state}): ${card.title}`,
    card.description ? `Description: ${card.description}` : '',
    `Acceptance:\n${card.acceptance.map(a => `  - ${a}`).join('\n')}`,
    `File scope: ${card.fileScope.join(', ')}`,
    card.worktreePath ? `Work directory: ${card.worktreePath}` : '',
    card.targetId ? `Concerns card: ${card.targetId}` : '',
    deps.length > 0 ? `Depends on:\n${deps.join('\n')}` : '',
    `Thread:\n${threadText(card)}`
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Everything a peer is told for one turn. It carries one line per card and the full thread
 * of only the card in hand, so it grows with the number of cards and not with the discussion.
 */
export function buildTurnPrompt(session: Session, board: Board, peer: Peer, reason: WakeReason, cardId: string, scratch = false): string {
  const card = board.data.cards[cardId];
  const team = Object.values(board.data.peers)
    .map(p => `@${p.id} (${p.harness} · ${p.model}, tier ${p.tier}${p.status === 'removed' ? ', away' : ''})`)
    .join(', ');

  let why: string;
  if (reason.kind === 'proposal') {
    why = `Another peer proposed a change to ${cardId}, which you hold. Read the proposal in the card's thread, answer it with proposal_answer, then carry on with the card.`;
  } else if (reason.kind === 'continue') {
    why = `You hold ${cardId} and it is not finished. An earlier turn of yours started it; the thread and the files in its work directory show how far it got. Finish it and submit, or release or block it with a reason.`;
  } else {
    const others = reason.cardIds.filter(id => id !== cardId);
    why = `There is work you may take. Suggested: ${cardId}${others.length > 0 ? ` (you could also take ${others.join(', ')})` : ''}. Claim one card with card_claim, do it, and submit it.`;
  }

  const skills = resolveFor(session.customizations, peer.id, session.worktree.path).skills.map(s => `- ${s.name}${s.path ? ` (package: ${s.path}/SKILL.md; resolve scripts, references and assets relative to ${s.path})` : ''}: ${s.instructions}`);

  return [
    `You are @${peer.id}, one of the peers working as a team on a shared goal. Nobody is in charge. The team coordinates only through the board, which you reach with the "board" MCP tools (board_read, card_claim, card_submit and the rest; your client may show them with a prefix such as mcp__board__).`,
    '',
    '## Goal',
    board.data.goal.text,
    board.data.goal.specPath ? `\nThe approved spec is at ${board.data.goal.specPath}. Read it. You may not change it.` : '',
    '',
    '## Why you were woken',
    why,
    '',
    `## Board (planVersion ${board.data.planVersion}, review mode: ${board.data.reviewMode})`,
    board.summaryLines().join('\n') || '(no cards)',
    '',
    `Team: ${team}`,
    `Repository: ${session.repoPath}`,
    `Session worktree (the merged result of finished cards): ${session.worktree.path}`,
    ...(scratch
      ? ['You start in a scratch copy of the session branch. It is reset before your next turn and nothing written there is kept: claim a card first and make changes only in the directory card_claim gives you.']
      : []),
    '',
    card ? `## The card in hand\n${cardDetail(board, card)}` : '',
    '',
    '## How the team works',
    '- You start every turn with no memory of earlier turns. What you know is this prompt, the spec, the files and the board. Before your turn ends, write anything the next reader needs as a card note or in your submit summary.',
    '- Claim a card before working on it. Hold one card at a time. Work only in the directory card_claim gives you, and only on files inside the card\'s scope.',
    '- Do not run git commit, merge, branch or checkout. card_submit commits your changes, checks them against the scope, and merges them or sends them for review.',
    '- If the plan is wrong, change it: card_create, card_split, card_edit, card_cancel. These need the planVersion shown above; if the plan has moved, call board_read and decide again. A change to a card another peer holds becomes a proposal for them to answer.',
    '- If your card needs something that is not there yet, create a card for it and call card_block with that card in waitFor.',
    '- If a card is too big, split it. If you cannot do it, release it with the reason, or offer it to a better-suited peer with card_delegate.',
    '- If the spec is wrong or unclear, or only the user can decide, call ask_user with one question. Never work around the spec.',
    '- On a review card: read the diff and the files, judge them against the acceptance criteria and the spec, change nothing, and finish with review_verdict.',
    '- On a verify card: run the commands, report each exit code in your summary, and submit with passed true or false. If it fails, create cards for what is wrong before you submit.',
    '- End your turn once your card is submitted, released, blocked or handed to the user, or when there is nothing useful for you to do.',
    `- A card you keep for ${MAX_STALLED_TURNS} turns in a row without changing any of its files goes back to the board. If you are stuck, release, block or split it, or ask the user.`,
    skills.length > 0 ? `\n## Team conventions\n${skills.join('\n')}` : ''
  ]
    .filter(line => line !== undefined)
    .join('\n');
}

export const scheduler = new Scheduler();
