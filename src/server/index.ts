import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.ts';
import { openApiSpec } from './openapi.ts';

// Routers
import { systemRouter } from './routes/system.router.ts';
import { sessionsRouter } from './routes/sessions.router.ts';
import { customizationsRouter } from './routes/customizations.router.ts';
import { worktreeRouter } from './routes/worktree.router.ts';
import { costRouter } from './routes/cost.router.ts';
import { goalRouter } from './routes/goal.router.ts';
import { boardRouter } from './routes/board.router.ts';
import { mcpRouter } from './mcp-server.ts';

// Services
import { costEngine } from './cost-engine.ts';
import { ptyManager } from './pty-manager.ts';
import { boardStore } from './board-store.ts';
import { sessionChat } from './session-chat.ts';
import { scheduler } from './scheduler.ts';
import { sessionStore } from './session-store.ts';
import { startTeamAnnouncements } from './team.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'tauri.localhost']);

/**
 * This API can spawn shells and agents, so it must only answer the app's own UI.
 * Requests without an Origin (the desktop shell, curl, tests) are allowed; browser requests
 * are allowed only from a loopback/Tauri origin, which keeps arbitrary websites the user
 * visits from driving the server. If HOST was deliberately set to a non-loopback address,
 * same-host origins are accepted as well.
 */
export function isAllowedOrigin(origin: string | undefined, requestHost?: string): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === 'tauri:' || LOOPBACK_HOSTS.has(url.hostname)) return true;
  const exposedOnNetwork = !LOOPBACK_HOSTS.has(config.host);
  return exposedOnNetwork && !!requestHost && url.host === requestHost;
}

const app = express();
app.use((req, res, next) => {
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
});
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
app.use(express.json({ limit: '2mb' }));

// The board, for agent turns (MCP over HTTP, bearer token per turn)
app.use('/mcp', mcpRouter);

// API Documentation
app.get('/api/v1/openapi.json', (req, res) => res.json(openApiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Mount REST Routers under /api/v1
app.use('/api/v1', systemRouter);
app.use('/api/v1', sessionsRouter);
app.use('/api/v1', customizationsRouter);
app.use('/api/v1', worktreeRouter);
app.use('/api/v1', costRouter);
app.use('/api/v1', goalRouter);
app.use('/api/v1', boardRouter);

// Static frontend serving if built
const distPath = process.env.DIST_PATH && fs.existsSync(process.env.DIST_PATH)
  ? process.env.DIST_PATH
  : fs.existsSync(path.join(process.cwd(), 'dist'))
  ? path.join(process.cwd(), 'dist')
  : path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/mcp')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Fallback status
  app.get('/', (req, res) => {
    res.send(`
      <html>
        <head><title>Smith Server</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem;">
          <h1>Smith</h1>
          <p>The Smith server is running on port ${config.port}.</p>
          <ul>
            <li><a style="color: #38bdf8;" href="/api/docs">Interactive API Documentation (Swagger)</a></li>
            <li><a style="color: #38bdf8;" href="/api/v1/health">System Health Check</a></li>
            <li><a style="color: #38bdf8;" href="/api/v1/system/models">Discovered Models API</a></li>
            <li><a style="color: #38bdf8;" href="/api/v1/sessions">Active Sessions API</a></li>
          </ul>
        </body>
      </html>
    `);
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket client connections
const eventClients: Set<WebSocket> = new Set();
// ptyId -> Set<WebSocket>
const ptyClients: Map<string, Set<WebSocket>> = new Map();

wss.on('connection', (ws, req) => {
  // WebSockets are not covered by CORS, so the origin check has to be explicit here.
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }

  const url = req.url || '';

  if (url.startsWith('/ws/pty/')) {
    const ptyId = url.replace('/ws/pty/', '');
    if (!ptyClients.has(ptyId)) {
      ptyClients.set(ptyId, new Set());
    }
    ptyClients.get(ptyId)!.add(ws);

    ws.on('message', (msg: Buffer) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'input') {
          ptyManager.writePTY(ptyId, parsed.data);
        } else if (parsed.type === 'resize') {
          ptyManager.resizePTY(ptyId, parsed.cols, parsed.rows);
        }
      } catch {
        ptyManager.writePTY(ptyId, msg.toString());
      }
    });

    ws.on('close', () => {
      const clients = ptyClients.get(ptyId);
      clients?.delete(ws);
      if (clients && clients.size === 0) ptyClients.delete(ptyId);
    });
  } else {
    // Default event stream
    eventClients.add(ws);
    ws.on('close', () => eventClients.delete(ws));
  }
});

function broadcastEvent(type: string, payload: any) {
  const msg = JSON.stringify({ type, payload, timestamp: Date.now() });
  for (const client of eventClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Wire Event Broadcasters
costEngine.on('cost:updated', (data) => broadcastEvent('cost:updated', data));
boardStore.on('changed', ({ sessionId, entry }) => {
  broadcastEvent('board:updated', { sessionId, entry, board: boardStore.get(sessionId).data, runningTurns: scheduler.runningTurns(sessionId) });
});
sessionChat.on('message', (data) => broadcastEvent('chat:message', data));
scheduler.on('turn:started', (turn) => broadcastEvent('turn:started', { sessionId: turn.sessionId, turn }));
scheduler.on('turn:ended', (turn) => broadcastEvent('turn:ended', { sessionId: turn.sessionId, turn }));

startTeamAnnouncements();

ptyManager.on('pty:data', ({ ptyId, data }) => {
  const clients = ptyClients.get(ptyId);
  if (clients) {
    const msg = JSON.stringify({ type: 'pty:data', ptyId, data });
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    }
  }
});

ptyManager.on('pty:exit', ({ ptyId }) => {
  const clients = ptyClients.get(ptyId);
  if (!clients) return;
  const msg = JSON.stringify({ type: 'pty:exit', ptyId });
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
});

if (!process.env.VITEST) {
  const shutdown = () => {
    console.log('Shutting down Smith...');
    scheduler.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Express 4 does not catch rejections from async route handlers; without this a single
  // failed request would terminate the backend for every open session.
  process.on('unhandledRejection', (reason) => {
    console.error('[smith] Unhandled promise rejection:', reason);
  });

  server.listen(config.port, config.host, () => {
    console.log(`Smith server listening on http://${config.host}:${config.port}`);
    console.log(`API documentation at http://${config.host}:${config.port}/api/docs`);
    // Goals that were running when the app closed pick up where the board left them.
    scheduler.start();
    for (const session of sessionStore.list()) scheduler.poke(session.id);
  });
}

export { app, server };
