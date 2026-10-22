import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';

describe('App-Level Configuration System Tests', () => {
  afterAll(() => {
    server.close();
  });

  it('GET /api/v1/system/config returns agent binaries, hindsight provider, and app settings', async () => {
    const res = await request(app).get('/api/v1/system/config');
    expect(res.status).toBe(200);
    expect(res.body.agentBinaries).toBeDefined();
    expect(res.body.agentBinaries.claude).toBeDefined();
    expect(res.body.agentBinaries.antigravity).toBeDefined();
    expect(res.body.agentBinaries.uv).toBeDefined();
    expect(res.body.hindsight).toBeDefined();
    expect(res.body.hindsight.provider).toBeDefined();
    expect(res.body.hindsight.url).toBeDefined();
    expect(res.body.app).toBeDefined();
    expect(res.body.app.gitPath).toBeDefined();
    expect(res.body.detectedBinaries).toBeDefined();
  });

  it('PUT /api/v1/system/config saves and hot-applies updated agent binaries and hindsight provider + API key', async () => {
    const res = await request(app)
      .put('/api/v1/system/config')
      .send({
        agentBinaries: {
          claude: 'C:\\custom\\claude.cmd',
          antigravity: 'C:\\custom\\language_server.exe',
          opencode: 'C:\\custom\\opencode.exe'
        },
        hindsight: {
          provider: 'anthropic',
          apiKey: 'sk-ant-api-key-test',
          url: 'http://localhost:8888',
          autoStartDaemon: true,
          defaultBank: 'custom-bank'
        },
        app: {
          currency: 'USD',
          budgetAlertThreshold: 50
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('saved');
    expect(res.body.config.agentBinaries.claude).toBe('C:\\custom\\claude.cmd');
    expect(res.body.config.agentBinaries.opencode).toBe('C:\\custom\\opencode.exe');
    expect(res.body.config.hindsight.provider).toBe('anthropic');
    expect(res.body.config.hindsight.apiKey).toBe('sk-ant-api-key-test');
    expect(res.body.config.hindsight.defaultBank).toBe('custom-bank');
    expect(res.body.config.app.budgetAlertThreshold).toBe(50);
  });

  it('POST /api/v1/system/config/probe-binary verifies binary paths on disk', async () => {
    const validRes = await request(app)
      .post('/api/v1/system/config/probe-binary')
      .send({ binaryPath: process.execPath });

    expect(validRes.status).toBe(200);
    expect(validRes.body.exists).toBe(true);
    expect(validRes.body.isExecutable).toBe(true);

    const invalidRes = await request(app)
      .post('/api/v1/system/config/probe-binary')
      .send({ binaryPath: 'C:\\nonexistent\\binary.exe' });

    expect(invalidRes.status).toBe(200);
    expect(invalidRes.body.exists).toBe(false);
  });

  it('POST /api/v1/system/config/test-hindsight checks server health and measures latency', async () => {
    const res = await request(app)
      .post('/api/v1/system/config/test-hindsight')
      .send({ url: 'http://127.0.0.1:8888' });

    expect(res.status).toBe(200);
    expect(res.body.latencyMs).toBeDefined();
    expect(res.body.status).toBeDefined();
  });
});
