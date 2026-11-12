import { describe, it, expect, beforeEach } from 'vitest';
import { HindsightService } from '../src/server/hindsight-service.ts';

describe('HindsightService (Shared Memory & Anti-Pattern Retain)', () => {
  let hindsight: HindsightService;

  beforeEach(() => {
    hindsight = new HindsightService();
  });

  it('provisions a bank and retains facts', async () => {
    const bankId = `test-bank-${Date.now()}`;
    await hindsight.retain(bankId, 'Architecture uses Prisma ORM with PostgreSQL', {
      category: 'architecture'
    });

    const bank = hindsight.getBank(bankId);
    expect(bank).toBeDefined();
    expect(bank?.facts.length).toBe(1);
    expect(bank?.facts[0].text).toContain('Prisma ORM');
  });

  it('retains and recalls anti-pattern failure lessons (arXiv:2610.22319)', async () => {
    const bankId = `test-bank-${Date.now()}`;
    await hindsight.retainAntiPattern(bankId, {
      error: 'ReferenceError: require is not defined in ES module scope',
      context: 'Importing node:crypto with require()',
      solution: 'Use import crypto from "node:crypto"',
      agentId: 'claude'
    });

    const recalled = await hindsight.recall(bankId, 'require is not defined');
    expect(recalled.antiPatterns.length).toBeGreaterThan(0);
    expect(recalled.antiPatterns[0].solution).toContain('import crypto');
  });

  it('performs native local semantic vector search and ranks relevant facts', async () => {
    const bankId = `test-bank-${Date.now()}`;
    await hindsight.retain(bankId, 'Ed25519 asymmetric cryptography token signature generation', { category: 'architecture' });
    await hindsight.retain(bankId, 'PostgreSQL database pool configuration with connection timeout', { category: 'environment' });
    await hindsight.retain(bankId, 'JWT bearer token authorization guard for express routes', { category: 'decision' });

    // Test vector cosine similarity
    const v1 = hindsight.vectorize('jwt bearer authentication');
    const v2 = hindsight.vectorize('jwt bearer token authorization');
    const sim = hindsight.cosineSimilarity(v1, v2);
    expect(sim).toBeGreaterThan(0.5);

    // Recall using semantic keywords
    const recalled = await hindsight.recall(bankId, 'bearer tokens and jwt');
    expect(recalled.facts.length).toBeGreaterThanOrEqual(1);
    expect(recalled.facts[0].text).toContain('JWT bearer token');
  });

  it('synthesizes reflected state for an overarching goal', async () => {
    const bankId = `test-bank-${Date.now()}`;
    await hindsight.retain(bankId, 'API requires JWT bearer token in Authorization header');

    const reflection = await hindsight.reflect(bankId, 'Implement Authentication Service');
    expect(reflection).toContain('Hindsight Reflected Synthesis');
    expect(reflection).toContain('JWT bearer token');
  });
});
