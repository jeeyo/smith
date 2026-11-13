import { Router } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { callSmithTool, SMITH_TOOLS } from './smith-tools.ts';

/** No auth and no MCP session state; each POST owns its own transport. */
export const smithMcpRouter = Router();
smithMcpRouter.post('/', async (req, res) => {
  const server = new Server({ name: 'smith', version: '0.3.0' }, { capabilities: { tools: {} } });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: SMITH_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const value = await callSmithTool(request.params.name, request.params.arguments, {
        sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined,
        chatId: typeof req.query.chatId === 'string' ? req.query.chatId : undefined
      });
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } catch (err: any) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }
  });
  res.on('close', () => { void server.close().catch(() => {}); });
  try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
  catch { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32603, message: 'MCP request failed' } }); }
});
smithMcpRouter.all('/', (_req, res) => res.set('Allow', 'POST').status(405).end());
