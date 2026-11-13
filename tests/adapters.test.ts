import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/server/index.ts';
import { detectNotLoggedIn, detectUsageLimit } from '../src/server/adapters/shared.ts';
import { issueTurnToken, revokeTurnToken } from '../src/server/mcp-server.ts';

afterAll(() => {
  server.close();
});

describe('usage-limit detection', () => {
  const now = new Date('2026-11-13T10:00:00').getTime();

  it('reads an epoch reset time', () => {
    const hit = detectUsageLimit('Claude AI usage limit reached|1763049600', now)!;
    expect(hit.resetAt).toBe(1763049600 * 1000);
  });

  it('reads a clock time, rolling to tomorrow when it has passed', () => {
    const later = detectUsageLimit("You've hit your usage limit. Try again at 8:30 PM.", now)!;
    expect(new Date(later.resetAt!).getHours()).toBe(20);
    expect(new Date(later.resetAt!).getMinutes()).toBe(30);
    expect(later.resetAt!).toBeGreaterThan(now);

    const earlier = detectUsageLimit('5-hour limit reached ∙ resets 3am', now)!;
    expect(new Date(earlier.resetAt!).getHours()).toBe(3);
    expect(earlier.resetAt! - now).toBeGreaterThan(0);
    expect(earlier.resetAt! - now).toBeLessThan(24 * 3600_000);
  });

  it('reads a duration', () => {
    const hit = detectUsageLimit('Rate limit exceeded. Please try again in 2 hours 15 minutes.', now)!;
    expect(hit.resetAt).toBe(now + 135 * 60_000);
    expect(detectUsageLimit('usage limit reached, resets in 45 minutes', now)!.resetAt).toBe(now + 45 * 60_000);
    expect(detectUsageLimit('usage limit reached while working in src/', now)!.resetAt).toBeUndefined();
  });

  it('reports a limit without a reset time when none is given', () => {
    const hit = detectUsageLimit('Error: quota exceeded for this account', now)!;
    expect(hit.message).toContain('quota exceeded');
    expect(hit.resetAt).toBeUndefined();
  });

  it('does not mistake ordinary failures for limits', () => {
    expect(detectUsageLimit('TypeError: cannot read properties of undefined', now)).toBeUndefined();
    expect(detectUsageLimit('Tests failed: 3 of 10', now)).toBeUndefined();
  });

  it('recognises a logged-out CLI', () => {
    expect(detectNotLoggedIn('Not logged in · Please run /login')).toBe(true);
    expect(detectNotLoggedIn('OAuth token has expired')).toBe(true);
    expect(detectNotLoggedIn('wrote 3 files')).toBe(false);
  });
});

describe('MCP handshake', () => {
  const rpc = (token: string, body: unknown) => request(app).post('/mcp').set('Authorization', `Bearer ${token}`).send(body);

  it('initialises, lists tools, ignores notifications, and stops accepting a revoked token', async () => {
    const token = issueTurnToken({ sessionId: 'none', peerId: 'p' });

    const init = await rpc(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe('2025-03-26');
    expect(init.body.result.capabilities.tools).toBeDefined();

    const note = await rpc(token, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(note.status).toBe(202);

    const list = await rpc(token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const names = list.body.result.tools.map((t: any) => t.name);
    expect(names).toHaveLength(14);
    for (const tool of list.body.result.tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.description.length).toBeGreaterThan(10);
    }

    // A tool error comes back as a tool result the agent can read, not a transport failure.
    const call = await rpc(token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'board_read', arguments: {} } });
    expect(call.status).toBe(200);
    expect(call.body.result.isError).toBe(true);

    const unknown = await rpc(token, { jsonrpc: '2.0', id: 4, method: 'does/not/exist' });
    expect(unknown.body.error.code).toBe(-32601);

    expect((await request(app).get('/mcp')).status).toBe(405);

    revokeTurnToken(token);
    expect((await rpc(token, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).status).toBe(401);
  });
});
