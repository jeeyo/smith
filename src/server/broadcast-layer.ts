import { TeamMessage, TeamMessageType, AgentId } from '../shared/types.ts';
import { teamBus } from './team-bus.ts';

export interface PeerProposal {
  id: string;
  proposer: AgentId;
  targetTaskOrScope: string;
  description: string;
  timestamp: number;
  status: 'proposed' | 'accepted' | 'rejected';
  votes: Record<string, 'agree' | 'disagree'>;
}

export interface EmergencyAlert {
  id: string;
  sender: AgentId;
  errorType: 'build_failure' | 'test_crash' | 'rate_limit' | 'lock_contention';
  fileLocation?: string;
  line?: number;
  details: string;
  timestamp: number;
  despawnOrTimeoutMs?: number;
  salvagedBy?: AgentId;
}

export interface ErrorRetraction {
  id: string;
  sender: AgentId;
  invalidAssumption: string;
  correctedFact: string;
  timestamp: number;
}

export class BroadcastLayerService {
  // sessionId -> agentId -> lastSeenTimestamp
  private agentIngestionOffsets: Map<string, Map<string, number>> = new Map();

  // Active proposals per session
  private activeProposals: Map<string, PeerProposal[]> = new Map();

  // Active emergency alerts per session
  private activeEmergencies: Map<string, EmergencyAlert[]> = new Map();

  constructor() {}

  /**
   * Broadcast a peer proposal (e.g. dynamic role negotiation or task handoff)
   */
  async broadcastProposal(
    sessionId: string,
    proposer: AgentId,
    targetTaskOrScope: string,
    description: string
  ): Promise<PeerProposal> {
    const proposal: PeerProposal = {
      id: `prop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      proposer,
      targetTaskOrScope,
      description,
      timestamp: Date.now(),
      status: 'proposed',
      votes: { [proposer]: 'agree' }
    };

    if (!this.activeProposals.has(sessionId)) {
      this.activeProposals.set(sessionId, []);
    }
    this.activeProposals.get(sessionId)!.push(proposal);

    await teamBus.broadcast(sessionId, {
      sender: proposer,
      type: 'proposal',
      content: `PROPOSAL: @${proposer} proposes role/scope [${targetTaskOrScope}]: ${description}`,
      metadata: { proposalId: proposal.id, targetTaskOrScope }
    });

    return proposal;
  }

  /**
   * Vote on an active peer proposal to form consensus
   */
  async voteConsensus(
    sessionId: string,
    voter: AgentId,
    proposalId: string,
    agree: boolean
  ): Promise<PeerProposal | undefined> {
    const list = this.activeProposals.get(sessionId) || [];
    const proposal = list.find(p => p.id === proposalId);
    if (!proposal) return undefined;

    proposal.votes[voter] = agree ? 'agree' : 'disagree';

    const agreeCount = Object.values(proposal.votes).filter(v => v === 'agree').length;
    if (agreeCount >= 2) {
      proposal.status = 'accepted';
    }

    await teamBus.broadcast(sessionId, {
      sender: voter,
      type: 'consensus',
      content: `CONSENSUS: @${voter} ${agree ? 'AGREES with' : 'REJECTS'} proposal ${proposal.targetTaskOrScope}. Status: ${proposal.status.toUpperCase()}`,
      metadata: { proposalId, status: proposal.status, votes: proposal.votes }
    });

    return proposal;
  }

  /**
   * Broadcast an emergency alert with coordinates and urgency
   */
  async broadcastEmergencyAlert(
    sessionId: string,
    alertInput: {
      sender: AgentId;
      errorType: 'build_failure' | 'test_crash' | 'rate_limit' | 'lock_contention';
      fileLocation?: string;
      line?: number;
      details: string;
      despawnOrTimeoutMs?: number;
    }
  ): Promise<EmergencyAlert> {
    const alert: EmergencyAlert = {
      id: `emg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: alertInput.sender,
      errorType: alertInput.errorType,
      fileLocation: alertInput.fileLocation,
      line: alertInput.line,
      details: alertInput.details,
      timestamp: Date.now(),
      despawnOrTimeoutMs: alertInput.despawnOrTimeoutMs || 300000 // 5-minute timeout default
    };

    if (!this.activeEmergencies.has(sessionId)) {
      this.activeEmergencies.set(sessionId, []);
    }
    this.activeEmergencies.get(sessionId)!.push(alert);

    const locationStr = alert.fileLocation ? ` at ${alert.fileLocation}${alert.line ? `:${alert.line}` : ''}` : '';
    await teamBus.broadcast(sessionId, {
      sender: alert.sender,
      type: 'emergency_alert',
      content: `EMERGENCY ALERT: ${alert.errorType.toUpperCase()}${locationStr}: ${alert.details} (Salvage deadline: ${(alert.despawnOrTimeoutMs! / 1000).toFixed(0)}s)`,
      metadata: { alertId: alert.id, errorType: alert.errorType, fileLocation: alert.fileLocation }
    });

    return alert;
  }

  /**
   * Broadcast error retraction to notify teammates of invalid hypotheses or incorrect logs
   */
  async broadcastErrorRetraction(
    sessionId: string,
    sender: AgentId,
    invalidAssumption: string,
    correctedFact: string
  ): Promise<ErrorRetraction> {
    const retraction: ErrorRetraction = {
      id: `retract-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender,
      invalidAssumption,
      correctedFact,
      timestamp: Date.now()
    };

    await teamBus.broadcast(sessionId, {
      sender,
      type: 'error_retraction',
      content: `RETRACTION: @${sender} retracts invalid assumption: "${invalidAssumption}". Corrected: "${correctedFact}"`,
      metadata: { retractionId: retraction.id, invalidAssumption, correctedFact }
    });

    return retraction;
  }

  /**
   * Ingestion Routine:
   * Extracts all broadcast messages sent by teammates and formats them directly
   * into standard context for the target agent's next execution cycle.
   */
  getInjectedContextForAgent(sessionId: string, targetAgent: AgentId, limit: number = 10): string {
    if (!this.agentIngestionOffsets.has(sessionId)) {
      this.agentIngestionOffsets.set(sessionId, new Map());
    }
    const sessionOffsets = this.agentIngestionOffsets.get(sessionId)!;
    const lastOffset = sessionOffsets.get(targetAgent) || 0;

    const allMessages = teamBus.getMessages(sessionId);
    // Find messages after the last offset from teammates (not self)
    const newTeammateMessages = allMessages.filter(
      m => m.timestamp > lastOffset && m.sender !== targetAgent
    );

    // Update offset to latest
    if (allMessages.length > 0) {
      sessionOffsets.set(targetAgent, allMessages[allMessages.length - 1].timestamp);
    }

    if (newTeammateMessages.length === 0) {
      return '';
    }

    const recent = newTeammateMessages.slice(-limit);
    const lines = [
      `=== LIVE TEAM BROADCAST CONTEXT (Peer Ingestion for @${targetAgent}) ===`
    ];

    for (const msg of recent) {
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();
      lines.push(`[${timeStr}] @${msg.sender} (${msg.type}): ${msg.content}`);
    }

    lines.push(`=====================================================================`);
    return lines.join('\n');
  }

  getProposals(sessionId: string): PeerProposal[] {
    return this.activeProposals.get(sessionId) || [];
  }

  getEmergencies(sessionId: string): EmergencyAlert[] {
    return this.activeEmergencies.get(sessionId) || [];
  }
}

export const broadcastLayerService = new BroadcastLayerService();
