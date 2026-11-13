import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.ts';
import { GoalChatMessage } from '../shared/types.ts';

/**
 * The conversation the user sees for a session: what they asked, and what the board reports
 * back (goal started, questions from the team, pauses, completion). Persisted per session.
 *
 * Events: 'message' ({ sessionId, message }).
 */
class SessionChat extends EventEmitter {
  private histories: Map<string, GoalChatMessage[]> = new Map();
  private dir = path.join(config.storageDir, 'chats');

  constructor() {
    super();
    fs.mkdirSync(this.dir, { recursive: true });
  }

  history(sessionId: string): GoalChatMessage[] {
    let list = this.histories.get(sessionId);
    if (list) return list;
    list = [];
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(this.dir, `${sessionId}.json`), 'utf-8'));
      if (Array.isArray(raw)) {
        // Messages written by an older build carried other fields; keep what still applies.
        list = raw
          .filter(m => m && typeof m.content === 'string')
          .map(m => ({
            id: String(m.id),
            sender: m.sender === 'user' ? 'user' : 'board',
            kind: m.kind,
            content: m.content,
            timestamp: m.timestamp || Date.now(),
            cardId: m.cardId,
            diffSummary: m.diffSummary,
            artifacts: m.artifacts
          }));
      }
    } catch {
      // No history yet
    }
    this.histories.set(sessionId, list);
    return list;
  }

  post(sessionId: string, message: Omit<GoalChatMessage, 'id' | 'timestamp'>): GoalChatMessage {
    const full: GoalChatMessage = {
      id: `msg-${Date.now()}-${uuidv4().substring(0, 6)}`,
      timestamp: Date.now(),
      ...message
    };
    const list = this.history(sessionId);
    list.push(full);
    try {
      fs.writeFileSync(path.join(this.dir, `${sessionId}.json`), JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Failed to persist chat for ${sessionId}:`, err);
    }
    this.emit('message', { sessionId, message: full });
    return full;
  }

  forget(sessionId: string) {
    this.histories.delete(sessionId);
  }
}

export const sessionChat = new SessionChat();
