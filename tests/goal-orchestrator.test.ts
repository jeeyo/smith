import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';
import { goalOrchestrator } from '../src/server/goal-orchestrator.ts';
import { taskLeaseManager } from '../src/server/task-lease-manager.ts';
import { costEngine } from '../src/server/cost-engine.ts';

describe('Goal Orchestrator & Single Chat Interface Tests', () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .send({
        name: 'Goal Orchestration Test Session',
        repoPath: path.join(os.tmpdir(), 'smith-test-repo'),
        macroGoal: 'Test Goal Orchestration',
        agents: [
          { agentId: 'claude', model: 'claude-3-7-sonnet', mode: 'acp' },
          { agentId: 'codex', model: 'gpt-6.1-sol', mode: 'acp' },
          { agentId: 'antigravity', model: 'gemini-2.5-pro', mode: 'acp' }
        ]
      });

    sessionId = res.body.id;
  });

  afterAll(() => {
    server.close();
  });

  it('GET /api/v1/sessions/:id/chat returns initialized chat timeline', async () => {
    const res = await request(app).get(`/api/v1/sessions/${sessionId}/chat`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(sessionId);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThan(0);
    expect(res.body.messages[0].sender).toBe('orchestrator');
  });

  it('POST /api/v1/sessions/:id/goal decomposes macro-goal and executes cooperative phases with health-aware routing', async () => {
    const goalText = 'Build an authentication service with Ed25519 tokens, route guards, and integration tests';

    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/goal`)
      .send({ goal: goalText });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toBeDefined();

    const msg = res.body.message;
    expect(msg.sender).toBe('orchestrator');
    expect(msg.status).toBe('completed');
    expect(msg.plan).toBeDefined();
    expect(msg.plan.subtasks.length).toBe(3);

    // Verify subtasks have disjoint non-overlapping file scopes (Zero Racing)
    const scopes = msg.plan.subtasks.map((st: any) => st.fileScope);
    expect(scopes[0]).toContain('src/auth/types.ts');
    expect(scopes[1]).toContain('src/auth/service.ts');
    expect(scopes[2]).toContain('tests/auth.test.ts');

    // Verify all subtasks reached completed state
    for (const subtask of msg.plan.subtasks) {
      expect(subtask.status).toBe('completed');
    }

    // Verify health-aware rerouting: codex or claude tasks auto-routed to ready fallback agent
    const reroutedTask = msg.plan.subtasks.find((st: any) => st.routedFrom !== undefined);
    if (reroutedTask) {
      expect(['antigravity', 'claude']).toContain(reroutedTask.agentId);
      expect(reroutedTask.routingReason).toBeDefined();
    }

    // Verify diffSummary was generated and attached
    expect(msg.diffSummary).toBeDefined();
    expect(msg.diffSummary.totalAdditions).toBeGreaterThan(0);
    expect(msg.diffSummary.files.length).toBeGreaterThan(0);

    // Verify USD compute cost was tracked
    expect(msg.cost).toBeDefined();
    expect(msg.cost.usd).toBeGreaterThan(0);
    expect(msg.cost.tokens).toBeGreaterThan(0);

    // Verify artifacts attached without injecting synthetic demo files into user workspace
    expect(msg.artifacts).toBeDefined();
    expect(Array.isArray(msg.artifacts)).toBe(true);

    // Verify Observer safety audits attached
    expect(msg.observerAudits).toBeDefined();
    expect(msg.observerAudits.length).toBeGreaterThan(0);
    expect(msg.observerAudits[0].verdict).toBeDefined();

    // Verify per-session dual layer memory attached
    expect(msg.dualLayerMemory).toBeDefined();
    expect(msg.dualLayerMemory.sessionId).toBe(sessionId);
    expect(msg.dualLayerMemory.teamKnowledgeFile).toContain('knowledge.md');

    // Verify operations history recorded locks and tool calls
    expect(msg.operations.length).toBeGreaterThan(0);
    const lockOps = msg.operations.filter((op: any) => op.action.includes('locks') || op.action.includes('lease'));
    expect(lockOps.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/sessions/:id/goal generates targeted conversational delta for follow-up prompts', async () => {
    const followUpText = 'Add a unit test verifying expired token rejection and clock skew';

    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/goal`)
      .send({ goal: followUpText });

    expect(res.status).toBe(200);
    const msg = res.body.message;
    expect(msg.status).toBe('completed');

    // Conversational delta planning: should generate single targeted delta task instead of 3 macro phases!
    expect(msg.plan.isDelta).toBe(true);
    expect(msg.plan.subtasks.length).toBe(1);
    expect(msg.plan.subtasks[0].title).toContain('Delta: Test Suite');
    expect(msg.plan.subtasks[0].fileScope).toContain('tests/*');
    expect(msg.content).toContain('Conversational delta successfully applied');
  });

  it('POST /api/v1/sessions/:id/worktree/merge and discard work cleanly', async () => {
    // Test merge endpoint
    const mergeRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/worktree/merge`)
      .send({});

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.success).toBe(true);
    expect(mergeRes.body.branch).toBeDefined();

    // Test discard endpoint
    const discardRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/worktree/discard`)
      .send({});

    expect(discardRes.status).toBe(200);
    expect(discardRes.body.success).toBe(true);
  });

  it('GET /api/v1/sessions/:id/chat includes both user goal and completed plan', async () => {
    const res = await request(app).get(`/api/v1/sessions/${sessionId}/chat`);
    expect(res.status).toBe(200);
    const messages = res.body.messages;

    const userMsgs = messages.filter((m: any) => m.sender === 'user');
    expect(userMsgs.length).toBeGreaterThanOrEqual(1);

    const completedOrchestratorMsgs = messages.filter((m: any) => m.sender === 'orchestrator' && m.status === 'completed' && m.plan);
    expect(completedOrchestratorMsgs.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/v1/sessions/:id/chat/message handles follow-up inquiries cleanly', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/chat/message`)
      .send({ content: 'What was the total compute cost?' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBeDefined();
    expect(res.body.reply.content).toContain('cumulative compute cost');
  });

  it('Orchestrator generates interactive questions and answers are processed via POST /chat/answer', async () => {
    // 1. Fetch chat history to find a message with questions
    const chatRes = await request(app).get(`/api/v1/sessions/${sessionId}/chat`);
    expect(chatRes.status).toBe(200);

    const msgWithQuestions = chatRes.body.messages.find(
      (m: any) => m.questions && m.questions.length > 0
    );
    expect(msgWithQuestions).toBeDefined();
    expect(msgWithQuestions.orchestratorAgentId).toBeDefined();

    const question = msgWithQuestions.questions[0];
    expect(question.answered).toBe(false);

    // 2. Submit an answer to the question
    const answerRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/chat/answer`)
      .send({
        messageId: msgWithQuestions.id,
        questionId: question.id,
        selectedOptions: [question.options[0]],
        customAnswer: 'Ed25519 with 24h rotation'
      });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.success).toBe(true);
    expect(answerRes.body.question.answered).toBe(true);
    expect(answerRes.body.question.customAnswer).toBe('Ed25519 with 24h rotation');
    expect(answerRes.body.replyMessage).toBeDefined();
    expect(answerRes.body.replyMessage.content).toContain('Ed25519 with 24h rotation');

    // 3. Verify chat history updated
    const updatedChatRes = await request(app).get(`/api/v1/sessions/${sessionId}/chat`);
    const updatedMsg = updatedChatRes.body.messages.find((m: any) => m.id === msgWithQuestions.id);
    const updatedQ = updatedMsg.questions.find((q: any) => q.id === question.id);
    expect(updatedQ.answered).toBe(true);
  });

  it('Session can configure custom orchestrator agent and model', async () => {
    const customSessionRes = await request(app)
      .post('/api/v1/sessions')
      .send({
        name: 'Claude Orchestrator Test Session',
        repoPath: process.cwd(),
        macroGoal: 'Test Claude Orchestrator',
        orchestrator: {
          agentId: 'claude',
          model: 'claude-3-7-sonnet'
        },
        agents: [
          { agentId: 'claude', model: 'claude-3-7-sonnet', mode: 'acp' },
          { agentId: 'antigravity', model: 'gemini-2.5-pro', mode: 'acp' }
        ]
      });

    expect(customSessionRes.status).toBe(201);
    const created = customSessionRes.body;
    expect(created.customizations.orchestrator.agentId).toBe('claude');
    expect(created.customizations.orchestrator.model).toBe('claude-3-7-sonnet');
  });

  it('collectWorktreeArtifacts scans legitimate agent artifacts from worktree without injecting synthetic files', async () => {
    const sessionRes = await request(app).get(`/api/v1/sessions/${sessionId}`);
    const session = sessionRes.body;
    expect(session).toBeDefined();

    const artifactsDir = path.join(session.worktree.path, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    // Agent writes legitimate artifacts
    fs.writeFileSync(path.join(artifactsDir, 'workflow.mmd'), 'graph TD\nA-->B', 'utf-8');
    fs.writeFileSync(path.join(artifactsDir, 'preview.html'), '<h1>Hello</h1>', 'utf-8');

    const artifacts = goalOrchestrator.collectWorktreeArtifacts(session);
    expect(artifacts.length).toBe(2);

    const mermaid = artifacts.find(a => a.name === 'workflow.mmd');
    expect(mermaid).toBeDefined();
    expect(mermaid?.type).toBe('mermaid');
    expect(mermaid?.content).toBe('graph TD\nA-->B');

    const html = artifacts.find(a => a.name === 'preview.html');
    expect(html).toBeDefined();
    expect(html?.type).toBe('html');
    expect(html?.content).toBe('<h1>Hello</h1>');

    // Clean up
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  });

  it('chat histories are persisted to disk and reloaded after restart', () => {
    const testSessionId = `test-persist-${Date.now()}`;
    const testMessages = [
      {
        id: 'msg-1',
        sender: 'user' as const,
        content: 'Persistent chat message test',
        timestamp: Date.now()
      },
      {
        id: 'msg-2',
        sender: 'orchestrator' as const,
        content: 'Persistent chat response test',
        timestamp: Date.now() + 10,
        status: 'completed' as const
      }
    ];

    goalOrchestrator.setChatHistory(testSessionId, testMessages);

    // Verify written to disk and can be read by fresh orchestrator
    const freshOrchestrator = new (goalOrchestrator.constructor as any)();
    const reloaded = freshOrchestrator.getChatHistory(testSessionId);
    expect(reloaded.length).toBe(2);
    expect(reloaded[0].content).toBe('Persistent chat message test');
    expect(reloaded[1].content).toBe('Persistent chat response test');

    // Clean up
    freshOrchestrator.deleteChatHistory(testSessionId);
    expect(freshOrchestrator.getChatHistory(testSessionId).length).toBe(0);
  });

  it('Elephant protocol gated execution stays in awaiting_approval until user triggers start', async () => {
    const gatedGoal = 'Build a notification event listener service';
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/goal`)
      .send({ goal: gatedGoal, autoStart: false });

    expect(res.status).toBe(200);
    const msg = res.body.message;
    expect(msg.status).toBe('awaiting_approval');
    expect(msg.acpMode).toBe('plan');
    expect(msg.questions).toBeDefined();
    expect(msg.questions.length).toBeGreaterThan(1); // Multi-question elicitation

    // Now send "start"
    const startRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/goal`)
      .send({ goal: 'start' });

    expect(startRes.status).toBe(200);
    const completedMsg = startRes.body.message;
    expect(completedMsg.status).toBe('completed');
    expect(completedMsg.acpMode).toBe('exec');
  });

  it('strictly restricts worker assignment to configured session agents only', async () => {
    // Create a session with strictly antigravity workers
    const strictRes = await request(app)
      .post('/api/v1/sessions')
      .send({
        name: 'Strict Workers Test',
        repoPath: path.join(os.tmpdir(), 'smith-test-repo'),
        macroGoal: 'Android notifications listener',
        agents: [
          { agentId: 'antigravity', workerId: 'worker-1-antigravity', model: 'gemini-2.5-pro', mode: 'acp' },
          { agentId: 'antigravity', workerId: 'worker-2-antigravity', model: 'gemini-2.5-pro', mode: 'acp' }
        ]
      });

    const strictSessionId = strictRes.body.id;
    const planRes = await request(app)
      .post(`/api/v1/sessions/${strictSessionId}/goal`)
      .send({ goal: 'Build a native android app that listens to phone notifications', autoStart: false });

    const msg = planRes.body.message;
    expect(msg.plan).toBeDefined();
    const assignedAgents = msg.plan.subtasks.map((st: any) => st.agentId);

    // Verify Claude and Codex are NEVER assigned
    expect(assignedAgents).not.toContain('claude');
    expect(assignedAgents).not.toContain('codex');
    for (const a of assignedAgents) {
      expect(['worker-1-antigravity', 'worker-2-antigravity', 'antigravity']).toContain(a);
    }
  });

  it('direct tagging of @observer routes to observer with direct answer', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/goal`)
      .send({ goal: '@observer what did you verify?' });

    expect(res.status).toBe(200);
    const msg = res.body.message;
    expect(msg.sender).toBe('agent');
    expect(msg.agentId).toBe('observer');
    expect(msg.content).toContain('Observer');
    expect(msg.plan).toBeUndefined(); // Did not create a fake code delta!
  });

  it('direct tagging of worker routes to that worker for explanation without code delta', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/goal`)
      .send({ goal: '@codex explain what you did' });

    expect(res.status).toBe(200);
    const msg = res.body.message;
    expect(msg.sender).toBe('agent');
    expect(msg.agentId).toBe('codex');
    expect(msg.content).toContain('codex');
    expect(msg.plan).toBeUndefined(); // Did not create a fake code delta!
  });

  it('conversational questions answer directly without creating subtasks or locking files', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/goal`)
      .send({ goal: "don't we have unit test or build check?" });

    expect(res.status).toBe(200);
    const msg = res.body.message;
    expect(msg.sender).toBe('orchestrator');
    expect(msg.content.length).toBeGreaterThan(10);
    expect(msg.plan).toBeUndefined(); // No subtasks!
  });
});
