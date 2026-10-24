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
import { agentsRouter } from './routes/agents.router.ts';
import { tasksRouter } from './routes/tasks.router.ts';
import { messagesRouter } from './routes/messages.router.ts';
import { customizationsRouter } from './routes/customizations.router.ts';
import { worktreeRouter } from './routes/worktree.router.ts';
import { costRouter } from './routes/cost.router.ts';
import { memoryRouter } from './routes/memory.router.ts';
import { goalRouter } from './routes/goal.router.ts';
import { goalOrchestrator } from './goal-orchestrator.ts';

// Services
import { costEngine } from './cost-engine.ts';
import { taskLeaseManager } from './task-lease-manager.ts';
import { teamBus } from './team-bus.ts';
import { acpHostEngine } from './acp-host.ts';
import { ptyManager } from './pty-manager.ts';
import { seedSampleData } from './seed.ts';
import { hindsightService } from './hindsight-service.ts';

const app = express();
app.use(cors());
app.use(express.json());

// API Documentation
app.get('/api/v1/openapi.json', (req, res) => res.json(openApiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Mount REST Routers under /api/v1
app.use('/api/v1', systemRouter);
app.use('/api/v1', sessionsRouter);
app.use('/api/v1', agentsRouter);
app.use('/api/v1', tasksRouter);
app.use('/api/v1', messagesRouter);
app.use('/api/v1', customizationsRouter);
app.use('/api/v1', worktreeRouter);
app.use('/api/v1', costRouter);
app.use('/api/v1', memoryRouter);
app.use('/api/v1', goalRouter);

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
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
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
          <p>Smith Orchestrator Server is active on port ${config.port}.</p>
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
      ptyClients.get(ptyId)?.delete(ws);
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
taskLeaseManager.on('task:created', (data) => broadcastEvent('task:created', data));
taskLeaseManager.on('task:claimed', (data) => broadcastEvent('task:claimed', data));
taskLeaseManager.on('task:released', (data) => broadcastEvent('task:released', data));
taskLeaseManager.on('task:completed', (data) => broadcastEvent('task:completed', data));
taskLeaseManager.on('task:unblocked', (data) => broadcastEvent('task:unblocked', data));
teamBus.on('team:message', (data) => broadcastEvent('team:message', data));

goalOrchestrator.on('goal:planning', (data) => broadcastEvent('goal:planning', data));
goalOrchestrator.on('goal:tasks_created', (data) => broadcastEvent('goal:tasks_created', data));
goalOrchestrator.on('goal:task_progress', (data) => broadcastEvent('goal:task_progress', data));
goalOrchestrator.on('goal:task_completed', (data) => broadcastEvent('goal:task_completed', data));
goalOrchestrator.on('goal:completed', (data) => broadcastEvent('goal:completed', data));

acpHostEngine.on('agent:stream', (data) => broadcastEvent('agent:stream', data));
acpHostEngine.on('agent:status', (data) => broadcastEvent('agent:status', data));
acpHostEngine.on('agent:model_updated', (data) => broadcastEvent('agent:model_updated', data));
acpHostEngine.on('permission:request', (data) => broadcastEvent('permission:request', data));

ptyManager.on('pty:data', ({ ptyId, data }) => {
  const clients = ptyClients.get(ptyId);
  if (clients) {
    const msg = JSON.stringify({ type: 'pty:data', ptyId, data });
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    }
  }
});

if (!process.env.VITEST) {
  const shutdown = async () => {
    console.log('Shutting down Smith and Hindsight daemon...');
    await hindsightService.stopDaemon();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(config.port, config.host, async () => {
    console.log(`🚀 Smith Orchestrator Server listening on http://localhost:${config.port}`);
    console.log(`📖 API Documentation available at http://localhost:${config.port}/api/docs`);

    // Immediately warm up and verify Hindsight memory daemon if autoStartDaemon is enabled
    if (config.hindsightAutoStartDaemon) {
      console.log('🔄 Checking and initializing Hindsight memory daemon in background...');
      hindsightService.checkHealth().catch((err) => {
        console.warn('[hindsight] Startup check warning:', err);
      });
    }

    // Seed default session if needed
    try {
      const res = await fetch(`http://localhost:${config.port}/api/v1/sessions`);
      const data = await res.json();
      if (data.sessions && data.sessions.length > 0) {
        const first = data.sessions[0];
        await seedSampleData(first.id, first.bankId);
      }
    } catch {
      // Ignore initial fetch
    }
  });
}

export { app, server };
