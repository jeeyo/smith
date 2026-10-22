import { taskLeaseManager } from './task-lease-manager.ts';
import { teamBus } from './team-bus.ts';
import { costEngine } from './cost-engine.ts';
import { hindsightService } from './hindsight-service.ts';
import { getSession } from './routes/sessions.router.ts';

export async function seedSampleData(sessionId: string, bankId: string) {
  const session = getSession(sessionId);
  if (!session) return;

  // 1. Seed Tasks if needed
  const existingTasks = taskLeaseManager.getTasks(sessionId);
  if (existingTasks.length <= 1) {
    const t1 = taskLeaseManager.createTask(sessionId, {
      title: 'Phase 1: Architecture & Token Specifications',
      description: 'Design Ed25519 refresh rotation model and establish token schemas.',
      fileScope: ['src/auth/types.ts'],
      suggestedAgent: 'claude'
    });
    taskLeaseManager.claimTask(sessionId, t1.id, 'claude');
    await taskLeaseManager.completeTask(sessionId, t1.id, 'claude', 'Completed JWT crypto helpers in src/auth/jwt.ts', bankId);

    const t2 = taskLeaseManager.createTask(sessionId, {
      title: 'Phase 2: Implement Route Guards & Middleware',
      description: 'Scaffolding authentication middleware and route protection.',
      fileScope: ['src/middleware/*'],
      suggestedAgent: 'claude'
    });
    taskLeaseManager.claimTask(sessionId, t2.id, 'claude');

    taskLeaseManager.createTask(sessionId, {
      title: 'Phase 3: Integration Test Suite (Delegated to Codex)',
      description: 'Write integration test coverage for expired tokens and invalid signatures.',
      fileScope: ['tests/auth.test.ts'],
      suggestedAgent: 'codex',
      dependencies: [t2.id],
      delegatedBy: 'claude'
    });

    taskLeaseManager.createTask(sessionId, {
      title: 'Phase 4: Security Audit & OpenAPI Docs',
      description: 'Review token expiration headers, rate limiting, and write API specs.',
      fileScope: ['docs/openapi.yaml']
    });
  }

  // 2. Seed Team Messages
  const existingMsgs = teamBus.getMessages(sessionId);
  if (existingMsgs.length === 0) {
    await teamBus.broadcast(sessionId, {
      sender: 'claude',
      type: 'intent',
      content: 'I am claiming Task #1: Implement JWT token verification in src/auth/jwt.ts. Locked scope: src/auth/*.'
    }, bankId);

    await teamBus.broadcast(sessionId, {
      sender: 'claude',
      type: 'anti_pattern',
      content: 'Discovered execution error: ReferenceError: require is not defined in ES module scope.',
      metadata: {
        antiPattern: {
          error: 'require() failed in ESM scope',
          solution: 'Use import crypto from "node:crypto" instead'
        }
      }
    }, bankId);

    await teamBus.broadcast(sessionId, {
      sender: 'codex',
      type: 'handoff',
      content: 'Acknowledged. Received Anti-Pattern warning. Standing by to claim Task #3 (Integration Tests) as soon as Claude releases lock.'
    }, bankId);
  }

  // 3. Seed USD Cost
  costEngine.recordTurn(sessionId, 'claude', 'claude-opus-5-5', {
    inputTokens: 24_000,
    outputTokens: 4_200,
    cachedTokens: 2_000,
    reasoningTokens: 1_200,
    totalTokens: 30_200
  }, 'task-1');

  costEngine.recordTurn(sessionId, 'codex', 'gpt-6.1-sol', {
    inputTokens: 12_000,
    outputTokens: 2_100,
    cachedTokens: 1_000,
    reasoningTokens: 600,
    totalTokens: 15_100
  }, 'task-2');

  // 4. Seed Hindsight Facts & Anti-patterns
  await hindsightService.retain(bankId, 'Architecture: Authentication uses Ed25519 tokens with 15-minute access and 7-day refresh rotation.', {
    category: 'architecture'
  });
  await hindsightService.retain(bankId, 'Environment: Server runs on Express + TypeScript with ESM modules.', {
    category: 'environment'
  });
  await hindsightService.retainAntiPattern(bankId, {
    error: 'ReferenceError: require is not defined in ES module scope',
    context: 'Importing node:crypto with require()',
    solution: 'Use import crypto from "node:crypto"',
    agentId: 'claude'
  });
  await hindsightService.reflect(bankId, 'Implement JWT Authentication & Refresh Tokens');
}
