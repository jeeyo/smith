import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';

describe('App configuration', () => {
  afterAll(() => {
    server.close();
  });

  it('returns harness binaries and app settings, and nothing for removed features', async () => {
    const res = await request(app).get('/api/v1/system/config');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.agentBinaries).sort()).toEqual(['claude', 'codex', 'opencode']);
    expect(res.body.hindsight).toBeUndefined();
    expect(res.body.app.gitPath).toBeDefined();
    expect(res.body.detectedBinaries).toBeDefined();
  });

  it('saves binaries and app settings, ignoring unknown harnesses', async () => {
    const res = await request(app)
      .put('/api/v1/system/config')
      .send({
        agentBinaries: { claude: '/custom/claude', antigravity: '/custom/agy' },
        app: { currency: 'USD', budgetAlertThreshold: 50 }
      });
    expect(res.status).toBe(200);
    expect(res.body.config.agentBinaries.claude).toBe('/custom/claude');
    expect(res.body.config.agentBinaries.antigravity).toBeUndefined();
    expect(res.body.config.app.budgetAlertThreshold).toBe(50);
  });

  it('verifies binary paths on disk', async () => {
    const valid = await request(app).post('/api/v1/system/config/probe-binary').send({ binaryPath: process.execPath });
    expect(valid.body.exists).toBe(true);
    const invalid = await request(app).post('/api/v1/system/config/probe-binary').send({ binaryPath: '/nonexistent/binary' });
    expect(invalid.body.exists).toBe(false);
  });

  it('answers /health at once with agent status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(Object.keys(res.body.agents).sort()).toEqual(['claude', 'codex', 'opencode']);
  });
});
