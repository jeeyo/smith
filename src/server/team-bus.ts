import { EventEmitter } from 'node:events';
import { AgentId, TeamMessage, TeamMessageType } from '../shared/types.ts';
import { hindsightService } from './hindsight-service.ts';

export class TeamBus extends EventEmitter {
  // sessionId -> TeamMessage[]
  private sessionMessages: Map<string, TeamMessage[]> = new Map();

  constructor() {
    super();
  }

  getMessages(sessionId: string, since?: number): TeamMessage[] {
    const list = this.sessionMessages.get(sessionId) || [];
    if (!since) return list;
    return list.filter(m => m.timestamp > since);
  }

  async broadcast(
    sessionId: string,
    messageInput: {
      sender: AgentId | 'user' | 'system';
      type: TeamMessageType;
      content: string;
      metadata?: any;
    },
    bankId?: string
  ): Promise<TeamMessage> {
    if (!this.sessionMessages.has(sessionId)) {
      this.sessionMessages.set(sessionId, []);
    }
    const list = this.sessionMessages.get(sessionId)!;

    const message: TeamMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: messageInput.sender,
      type: messageInput.type,
      content: messageInput.content,
      timestamp: Date.now(),
      metadata: messageInput.metadata
    };

    list.push(message);

    // If anti-pattern, automatically retain into Hindsight
    if (message.type === 'anti_pattern' && bankId && message.metadata?.antiPattern) {
      await hindsightService.retainAntiPattern(bankId, {
        error: message.metadata.antiPattern.error,
        context: message.content,
        solution: message.metadata.antiPattern.solution,
        agentId: message.sender
      });
    }

    this.emit('team:message', { sessionId, message });
    return message;
  }
}

export const teamBus = new TeamBus();
