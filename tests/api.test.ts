import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const testRepoPath = path.join(os.tmpdir(), 'smith-test-repo');
if (!fs.existsSync(testRepoPath)) fs.mkdirSync(testRepoPath, { recursive: true });
fs.writeFileSync(path.join(testRepoPath, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' }));
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';

describe('Smith HTTP REST API Integration Tests', () => {
  let createdSessionId: string;
  let sampleTaskId: string;

  afterAll(() => {
    server.close();
  });

  it('GET /api/v1/health returns healthy system status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.git).toBeDefined();
  });

  it('GET /api/v1/system/models returns dynamically discovered models', async () => {
    const res = await request(app).get('/api/v1/system/models');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('GET /api/v1/system/agents/status returns real agent health, auth, and error diagnostics', async () => {
    const res = await request(app).get('/api/v1/system/agents/status');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(res.body.agents).toBeDefined();
    expect(res.body.agents['codex']).toBeDefined();
    expect(res.body.agents['claude']).toBeDefined();
    expect(res.body.agents['antigravity']).toBeDefined();
    expect(res.body.agents['antigravity'].status).toBe('ready');
  });

  it('GET /api/v1/system/pricing returns USD pricing tables', async () => {
    const res = await request(app).get('/api/v1/system/pricing');
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('USD');
    expect(res.body.rates['claude-3-7-sonnet']).toBeDefined();
  });

  it('POST /api/v1/sessions creates a session with worktree and Hindsight bank', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .send({
        name: 'API Test Session',
        repoPath: testRepoPath,
        macroGoal: 'Implement integration test suite for Smith ADE',
        agents: [
          { agentId: 'claude', model: 'claude-3-7-sonnet', mode: 'acp' },
          { agentId: 'codex', model: 'gpt-6.1-sol', mode: 'acp' }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.bankId).toBeDefined();
    expect(res.body.worktree).toBeDefined();
    expect(res.body.agents['claude']).toBeDefined();

    createdSessionId = res.body.id;
  });

  it('POST /api/v1/sessions allows creating a chat session without macroGoal', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .send({
        name: 'Empty Chat Session',
        repoPath: testRepoPath,
        agents: [
          { agentId: 'antigravity', model: 'gemini-2.5-pro', mode: 'acp' }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.macroGoal).toBe('');
    expect(Object.keys(res.body.tasks).length).toBe(0);
  });

  it('PATCH /api/v1/sessions/:id/agents/:agentId hot-reloads model mid-session', async () => {
    const res = await request(app)
      .patch(`/api/v1/sessions/${createdSessionId}/agents/claude`)
      .send({ model: 'claude-3-5-haiku' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('hot-reloaded');
    expect(res.body.previousModel).toBe('claude-3-7-sonnet');
    expect(res.body.activeModel).toBe('claude-3-5-haiku');
  });

  it('GET /api/v1/sessions/:id/cost returns USD cost summary', async () => {
    const res = await request(app).get(`/api/v1/sessions/${createdSessionId}/cost`);
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('USD');
    expect(res.body.totalCostUsd).toBeDefined();
    expect(res.body.formattedTotal).toBeDefined();
  });

  it('POST /api/v1/sessions/:id/tasks delegates a cooperative subtask', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/tasks`)
      .send({
        title: 'Build Authentication Middleware',
        description: 'Verify JWT tokens in request header',
        fileScope: ['src/middleware/*'],
        suggestedAgent: 'claude'
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toContain('Authentication Middleware');
    sampleTaskId = res.body.id;
  });

  it('POST /api/v1/sessions/:id/tasks/:taskId/claim acquires atomic lease and prevents conflict', async () => {
    // Claude claims task
    const res1 = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/tasks/${sampleTaskId}/claim`)
      .send({ agentId: 'claude' });

    expect(res1.status).toBe(200);
    expect(res1.body.task.status).toBe('in_progress');

    // Create another task with overlapping file scope
    const task2Res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/tasks`)
      .send({
        title: 'Audit Middleware',
        description: 'Audit file',
        fileScope: ['src/middleware/auth.ts']
      });

    // Codex attempts to claim task 2 (should return 409 Conflict)
    const res2 = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/tasks/${task2Res.body.id}/claim`)
      .send({ agentId: 'codex' });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('TaskConflictError');
    expect(res2.body.conflictingAgent).toBe('claude');
  });

  it('POST /api/v1/sessions/:id/messages broadcasts intent to team bus', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/messages`)
      .send({
        sender: 'claude',
        type: 'intent',
        content: 'I am beginning implementation of JWT token verification.'
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('intent');
    expect(res.body.sender).toBe('claude');
  });

  it('PUT /api/v1/sessions/:id/customizations hot-updates skills and MCP servers', async () => {
    const res = await request(app)
      .put(`/api/v1/sessions/${createdSessionId}/customizations`)
      .send({
        skills: ['code-review', 'database-migrations']
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('customizations_hot_reloaded');
    expect(res.body.customizations.skills).toContain('database-migrations');
  });

  it('GET /api/v1/sessions/:id/worktree/file serves artifacts and prevents path traversal', async () => {
    // 1. Path traversal security test
    const evilRes = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}/worktree/file?path=../../../../Windows/System32/drivers/etc/hosts`);
    expect(evilRes.status).toBe(403);
    expect(evilRes.body.error).toContain('Access denied');

    // 2. Fetch existing file in repo (e.g. package.json)
    const fileRes = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}/worktree/file?path=package.json`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toContain('application/json');

    // 3. Download flag sets attachment header
    const dlRes = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}/worktree/file?path=package.json&download=1`);
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers['content-disposition']).toContain('attachment');
  });

  it('GET /api/v1/sessions/:id/worktree/artifacts returns categorized artifacts list', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}/worktree/artifacts`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(createdSessionId);
    expect(Array.isArray(res.body.artifacts)).toBe(true);
  });

  it('GET /api/v1/sessions/:id/memory/dual-layer returns per-session paths and synchronized knowledge', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}/memory/dual-layer`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(createdSessionId);
    expect(res.body.basePath).toContain(createdSessionId);
    expect(res.body.teamKnowledgeFile).toContain('knowledge.md');
    expect(res.body.agentScratchpadFiles['antigravity']).toBeDefined();
    expect(res.body.teamKnowledgeContent).toContain('Shared Team Knowledge Base');
  });

  it('POST /api/v1/sessions/:id/memory/compaction-flush flushes durable knowledge before compaction', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${createdSessionId}/memory/compaction-flush`)
      .send({ agentId: 'antigravity', durableKnowledge: 'Durable session discovery: Ed25519 token signatures verified.' });
    expect(res.status).toBe(200);
    expect(res.body.flushed).toBe(true);
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/v1/sessions/:id/observer/audits and broadcast/peer-state return live telemetry', async () => {
    const obsRes = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}/observer/audits`);
    expect(obsRes.status).toBe(200);
    expect(obsRes.body.sessionId).toBe(createdSessionId);
    expect(Array.isArray(obsRes.body.audits)).toBe(true);

    const bcastRes = await request(app)
      .get(`/api/v1/sessions/${createdSessionId}/broadcast/peer-state`);
    expect(bcastRes.status).toBe(200);
    expect(bcastRes.body.sessionId).toBe(createdSessionId);
    expect(Array.isArray(bcastRes.body.proposals)).toBe(true);
    expect(Array.isArray(bcastRes.body.emergencies)).toBe(true);
  });

  it('POST /api/v1/sessions allows multiple workers with the same agent and different models', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .send({
        name: 'Multi Worker Same Agent Session',
        repoPath: testRepoPath,
        agents: [
          { workerId: 'worker-1-claude', agentId: 'claude', model: 'claude-3-7-sonnet', mode: 'acp' },
          { workerId: 'worker-2-claude', agentId: 'claude', model: 'claude-3-5-haiku', mode: 'acp' },
          { workerId: 'worker-3-antigravity', agentId: 'antigravity', model: 'gemini-2.5-pro', mode: 'acp' }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.agents['worker-1-claude']).toBeDefined();
    expect(res.body.agents['worker-1-claude'].config.model).toBe('claude-3-7-sonnet');
    expect(res.body.agents['worker-2-claude']).toBeDefined();
    expect(res.body.agents['worker-2-claude'].config.model).toBe('claude-3-5-haiku');
    expect(res.body.agents['worker-3-antigravity']).toBeDefined();
  });

  it('GET /api/v1/system/models excludes unsupported local models (deepseek/qwen)', async () => {
    const res = await request(app).get('/api/v1/system/models');
    expect(res.status).toBe(200);
    const models = res.body.models;
    const localModels = models.filter((m: any) => /deepseek|qwen|ollama/i.test(m.id) || /deepseek|qwen|ollama/i.test(m.name));
    expect(localModels.length).toBe(0);
  });
});
