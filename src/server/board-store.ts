import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { config } from './config.ts';
import { Board, emptyBoard } from './board.ts';
import { BoardData, BoardLogEntry } from '../shared/board.ts';

/**
 * Loads, saves and announces boards. One JSON file per session, written atomically, with an
 * append-only change log beside it (docs/designs/peer-board.md, section 4.4).
 *
 * Events: 'changed' ({ sessionId, entry }) after every accepted board change.
 */
class BoardStore extends EventEmitter {
  private boards: Map<string, Board> = new Map();
  private dir = path.join(config.storageDir, 'boards');

  constructor() {
    super();
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(sessionId: string): string {
    return path.join(this.dir, `${sessionId}.json`);
  }

  private logFile(sessionId: string): string {
    return path.join(this.dir, `${sessionId}.log.jsonl`);
  }

  /** Returns the session's board, loading or creating it on first use. */
  get(sessionId: string): Board {
    let board = this.boards.get(sessionId);
    if (board) return board;

    let data: BoardData | null = null;
    try {
      if (fs.existsSync(this.file(sessionId))) {
        data = JSON.parse(fs.readFileSync(this.file(sessionId), 'utf-8'));
      }
    } catch (err) {
      console.warn(`Board for ${sessionId} is unreadable; starting a new one.`, err);
    }

    board = new Board(data && data.cards ? data : emptyBoard(sessionId), {
      onChange: (entry, b) => this.persist(b, entry)
    });
    this.boards.set(sessionId, board);
    return board;
  }

  has(sessionId: string): boolean {
    return this.boards.has(sessionId) || fs.existsSync(this.file(sessionId));
  }

  private persist(board: Board, entry: BoardLogEntry) {
    try {
      const file = this.file(board.sessionId);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(board.data));
      fs.renameSync(tmp, file);
      fs.appendFileSync(this.logFile(board.sessionId), JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error(`Failed to persist board ${board.sessionId}:`, err);
    }
    this.emit('changed', { sessionId: board.sessionId, entry });
  }

  /** The most recent change-log entries, oldest first. */
  log(sessionId: string, limit: number = 200): BoardLogEntry[] {
    try {
      const lines = fs.readFileSync(this.logFile(sessionId), 'utf-8').split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => JSON.parse(l));
    } catch {
      return [];
    }
  }

  delete(sessionId: string) {
    this.boards.delete(sessionId);
    for (const file of [this.file(sessionId), this.logFile(sessionId)]) {
      try {
        fs.rmSync(file, { force: true });
      } catch {}
    }
  }
}

export const boardStore = new BoardStore();
