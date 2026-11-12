import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SessionMemoryService } from '../src/server/session-memory.ts';

describe('Dual-Layer Persistent Memory Architecture (Per-Session)', () => {
  const testBaseDir = path.join(process.cwd(), '.smith', 'test-memory');
  let memoryService: SessionMemoryService;
  const testSessionId = `test-sess-${Date.now()}`;

  beforeEach(() => {
    memoryService = new SessionMemoryService(testBaseDir);
  });

  afterEach(() => {
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  it('initializes per-session folder structure with shared team workspace and private agent scratchpads', () => {
    const info = memoryService.initSessionMemory(testSessionId, ['antigravity', 'codex', 'claude']);

    expect(info.sessionId).toBe(testSessionId);
    expect(fs.existsSync(info.teamKnowledgeFile)).toBe(true);
    expect(fs.existsSync(info.agentScratchpadFiles['antigravity'])).toBe(true);
    expect(fs.existsSync(info.agentScratchpadFiles['codex'])).toBe(true);
    expect(fs.existsSync(info.agentScratchpadFiles['claude'])).toBe(true);

    const teamKnowledge = memoryService.readSharedKnowledge(testSessionId);
    expect(teamKnowledge).toContain('# Shared Team Knowledge Base');
    expect(teamKnowledge).toContain(testSessionId);

    const privateScratchpad = memoryService.readPrivateScratchpad(testSessionId, 'codex');
    expect(privateScratchpad).toContain('# Private Agent Scratchpad: @codex');
  });

  it('allows agents to append shared discoveries to team/knowledge.md', () => {
    memoryService.initSessionMemory(testSessionId, ['antigravity', 'codex']);

    memoryService.appendSharedKnowledge(
      testSessionId,
      'Ed25519 Token Format Agreement',
      'Payload contains sub, exp (seconds), and aud: smith-gateway.',
      'antigravity'
    );

    const content = memoryService.readSharedKnowledge(testSessionId);
    expect(content).toContain('Ed25519 Token Format Agreement');
    expect(content).toContain('@antigravity');
    expect(content).toContain('smith-gateway');
  });

  it('maintains isolated private scratchpads per agent', () => {
    memoryService.initSessionMemory(testSessionId, ['antigravity', 'claude']);

    memoryService.appendPrivateScratchpad(testSessionId, 'antigravity', 'Investigating Ed25519 sodium native bindings');
    memoryService.appendPrivateScratchpad(testSessionId, 'claude', 'Writing Vitest suite for expired token rejection');

    const antigravityPad = memoryService.readPrivateScratchpad(testSessionId, 'antigravity');
    const claudePad = memoryService.readPrivateScratchpad(testSessionId, 'claude');

    expect(antigravityPad).toContain('sodium native bindings');
    expect(antigravityPad).not.toContain('Vitest suite');

    expect(claudePad).toContain('Vitest suite');
    expect(claudePad).not.toContain('sodium native bindings');
  });

  it('executes Compaction Survival Routine before context window roll-overs', () => {
    memoryService.initSessionMemory(testSessionId, ['antigravity']);

    // Seed private scratchpad with working findings
    memoryService.appendPrivateScratchpad(
      testSessionId,
      'antigravity',
      'CRITICAL DISCOVERY: Redis key prefix must be `blacklist:jti:` with 3600s TTL.'
    );

    // Flush compaction survival
    const result = memoryService.flushCompactionSurvival(testSessionId, 'antigravity');
    expect(result.flushed).toBe(true);
    expect(result.bytesSaved).toBeGreaterThan(0);

    // Verify durable discovery is preserved in shared team workspace
    const teamKnowledge = memoryService.readSharedKnowledge(testSessionId);
    expect(teamKnowledge).toContain('Compaction Survival Snapshot');
    expect(teamKnowledge).toContain('Redis key prefix must be `blacklist:jti:`');

    // Verify private scratchpad was compacted cleanly
    const postScratchpad = memoryService.readPrivateScratchpad(testSessionId, 'antigravity');
    expect(postScratchpad).toContain('Prior durable knowledge successfully flushed');
    expect(postScratchpad).not.toContain('CRITICAL DISCOVERY');
  });
});
