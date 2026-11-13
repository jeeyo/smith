import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { Session } from '../shared/types.ts';

/**
 * Sessions and their on-disk copies (~/.smith/sessions/<id>.json). Kept apart from the HTTP
 * routes so the board, the scheduler and the routers can all read sessions without importing
 * each other.
 */
class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private dir = path.join(config.storageDir, 'sessions');

  constructor() {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      // One unreadable file must not hide every other session.
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf-8'));
        if (data?.id && data.worktree) this.sessions.set(data.id, this.upgrade(data));
      } catch (err) {
        console.warn(`Skipping unreadable session file ${file}:`, err);
      }
    }
  }

  /** Brings a session written by an older build up to the current shape. */
  private upgrade(data: any): Session {
    const agents: Session['agents'] = {};
    for (const [key, value] of Object.entries<any>(data.agents || {})) {
      const harness = value?.config?.agentId;
      if (!['claude', 'codex', 'opencode'].includes(harness)) continue;
      agents[key] = {
        config: { workerId: key, agentId: harness, model: value.config.model, tier: value.config.tier || 2 }
      };
    }
    return {
      id: data.id,
      name: data.name,
      repoPath: data.repoPath,
      macroGoal: data.macroGoal || '',
      worktree: data.worktree,
      agents,
      reviewMode: data.reviewMode || 'normal',
      specPath: data.specPath,
      customizations: {
        plugins: data.customizations?.plugins || [],
        skills: data.customizations?.skills || [],
        mcpServers: data.customizations?.mcpServers || {}
      },
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now()
    };
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  save(session: Session) {
    session.updatedAt = Date.now();
    this.sessions.set(session.id, session);
    const file = path.join(this.dir, `${session.id}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
    fs.renameSync(tmp, file);
  }

  delete(id: string) {
    this.sessions.delete(id);
    for (const file of [
      path.join(this.dir, `${id}.json`),
      path.join(config.storageDir, 'chats', `${id}.json`),
      path.join(config.storageDir, 'specs', `${id}.md`)
    ]) {
      try {
        fs.rmSync(file, { force: true });
      } catch {}
    }
  }
}

export const sessionStore = new SessionStore();

export function getSession(id: string): Session | undefined {
  return sessionStore.get(id);
}
