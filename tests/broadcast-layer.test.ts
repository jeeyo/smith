import { describe, it, expect, beforeEach } from 'vitest';
import { broadcastLayerService } from '../src/server/broadcast-layer.ts';
import { teamBus } from '../src/server/team-bus.ts';

describe('In-IDE Broadcast Chat Layer & Peer Negotiation', () => {
  const sessionId = `test-bcast-${Date.now()}`;

  it('supports dynamic role proposals and consensus voting between agents', async () => {
    // 1. Agent @codex proposes task allocation
    const proposal = await broadcastLayerService.broadcastProposal(
      sessionId,
      'codex',
      'src/auth/redis.ts',
      'I will implement Redis blacklist token store with 3600s TTL'
    );

    expect(proposal.id).toBeDefined();
    expect(proposal.proposer).toBe('codex');
    expect(proposal.status).toBe('proposed');

    // 2. Agent @antigravity votes consensus
    const updated = await broadcastLayerService.voteConsensus(
      sessionId,
      'antigravity',
      proposal.id,
      true
    );

    expect(updated).toBeDefined();
    expect(updated?.status).toBe('accepted');
    expect(updated?.votes['antigravity']).toBe('agree');

    const busMessages = teamBus.getMessages(sessionId);
    expect(busMessages.some(m => m.type === 'proposal' && m.sender === 'codex')).toBe(true);
    expect(busMessages.some(m => m.type === 'consensus' && m.sender === 'antigravity')).toBe(true);
  });

  it('broadcasts emergency state alerts with coordinates and timeout countdown', async () => {
    const alert = await broadcastLayerService.broadcastEmergencyAlert(sessionId, {
      sender: 'claude',
      errorType: 'test_crash',
      fileLocation: 'tests/auth.test.ts',
      line: 48,
      details: 'Redis connection refused on localhost:6379. Needs in-memory mock fallback.',
      despawnOrTimeoutMs: 180000
    });

    expect(alert.id).toBeDefined();
    expect(alert.sender).toBe('claude');
    expect(alert.errorType).toBe('test_crash');
    expect(alert.fileLocation).toBe('tests/auth.test.ts');
    expect(alert.line).toBe(48);

    const busMessages = teamBus.getMessages(sessionId);
    const alertMsg = busMessages.find(m => m.type === 'emergency_alert');
    expect(alertMsg).toBeDefined();
    expect(alertMsg?.content).toContain('tests/auth.test.ts:48');
    expect(alertMsg?.content).toContain('TEST_CRASH');
  });

  it('broadcasts error retractions to prevent teammates from using invalid assumptions', async () => {
    const retraction = await broadcastLayerService.broadcastErrorRetraction(
      sessionId,
      'codex',
      'Ed25519 tokens require 64-byte hex public keys',
      'Ed25519 requires 32-byte raw bytes base64url encoded'
    );

    expect(retraction.id).toBeDefined();
    expect(retraction.invalidAssumption).toContain('64-byte hex');
    expect(retraction.correctedFact).toContain('32-byte raw bytes');

    const busMessages = teamBus.getMessages(sessionId);
    const retMsg = busMessages.find(m => m.type === 'error_retraction');
    expect(retMsg).toBeDefined();
    expect(retMsg?.content).toContain('retracts invalid assumption');
  });

  it('injects unread broadcast messages directly into peer agent turn context', () => {
    // Ingest for @antigravity (should receive messages sent by @codex and @claude)
    const contextForAntigravity = broadcastLayerService.getInjectedContextForAgent(sessionId, 'antigravity');

    expect(contextForAntigravity).toContain('=== LIVE TEAM BROADCAST CONTEXT');
    expect(contextForAntigravity).toContain('@codex');
    expect(contextForAntigravity).toContain('@claude');

    // Subsequent ingestion without new messages returns empty string (offset tracked)
    const nextContext = broadcastLayerService.getInjectedContextForAgent(sessionId, 'antigravity');
    expect(nextContext).toBe('');
  });
});
