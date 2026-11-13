import { Router } from 'express';
import crypto from 'node:crypto';
import { BoardError } from './board.ts';
import { BOARD_TOOLS, boardTools, ToolContext } from './board-tools.ts';

/**
 * The board as an MCP server over HTTP (JSON-RPC 2.0, one JSON response per POST).
 *
 * Each agent turn gets its own bearer token that maps to one peer in one session, so a peer
 * cannot act as another and a token is useless once its turn has ended.
 */

const tokens: Map<string, ToolContext> = new Map();
const listeners: Set<(ctx: ToolContext, tool: string, ok: boolean) => void> = new Set();

export function issueTurnToken(ctx: ToolContext): string {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, ctx);
  return token;
}

export function revokeTurnToken(token: string) {
  tokens.delete(token);
}

/** Notifies the scheduler after each tool call so it can react to board changes. */
export function onToolCall(listener: (ctx: ToolContext, tool: string, ok: boolean) => void) {
  listeners.add(listener);
}

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

async function handleMessage(ctx: ToolContext, msg: any): Promise<any | null> {
  const id = msg?.id;
  const isNotification = id === undefined || id === null;
  const reply = (result: unknown) => (isNotification ? null : { jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => (isNotification ? null : { jsonrpc: '2.0', id, error: { code, message } });

  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return fail(-32600, 'Invalid request');
  }

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'smith-board', version: '1.0.0' },
        instructions: 'The shared board for this team. Read it with board_read before acting, and record what you do on the cards.'
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: BOARD_TOOLS });
    case 'tools/call': {
      const name = String(msg.params?.name || '');
      let ok = true;
      let payload: unknown;
      try {
        payload = await boardTools.call(ctx, name, msg.params?.arguments);
      } catch (err: any) {
        ok = false;
        payload =
          err instanceof BoardError
            ? { error: err.code, message: err.message, detail: err.detail }
            : { error: 'internal', message: err?.message || 'Tool failed' };
        if (!(err instanceof BoardError)) console.error(`[board] ${name} failed:`, err);
      }
      for (const listener of listeners) {
        try {
          listener(ctx, name, ok);
        } catch {}
      }
      return reply({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: !ok });
    }
    case 'resources/list':
      return reply({ resources: [] });
    case 'prompts/list':
      return reply({ prompts: [] });
    default:
      // Notifications (notifications/initialized and the like) need no answer.
      return msg.method.startsWith('notifications/') ? null : fail(-32601, `Method not found: ${msg.method}`);
  }
}

export const mcpRouter = Router();

mcpRouter.post('/', async (req, res) => {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const ctx = tokens.get(token);
  if (!ctx) {
    return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unknown or expired turn token' } });
  }

  const body = req.body;
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map(m => handleMessage(ctx, m)))).filter(Boolean);
    return replies.length > 0 ? res.json(replies) : res.status(202).end();
  }
  const reply = await handleMessage(ctx, body);
  return reply ? res.json(reply) : res.status(202).end();
});

// This server never opens a server-to-client stream.
mcpRouter.get('/', (_req, res) => res.status(405).set('Allow', 'POST').end());
mcpRouter.delete('/', (_req, res) => res.status(405).set('Allow', 'POST').end());
