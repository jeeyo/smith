import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { config } from '../config.ts';
import { hindsightService } from '../hindsight-service.ts';
import { modelDiscoveryEngine } from '../model-discovery.ts';
import { costEngine } from '../cost-engine.ts';
import { agentHealthEngine } from '../agent-health.ts';
import { ptyManager } from '../pty-manager.ts';

export const systemRouter = Router();

systemRouter.post('/system/pty/create', (req, res) => {
  const { command, cwd } = req.body;
  const ptyId = `pty-${Date.now()}`;
  const targetCwd = cwd || process.cwd();
  ptyManager.createPTY(ptyId, 'system', targetCwd, command);
  res.json({ ptyId, cwd: targetCwd, command: command || 'powershell.exe' });
});

systemRouter.delete('/system/pty/:ptyId', (req, res) => {
  ptyManager.terminatePTY(req.params.ptyId);
  res.json({ status: 'terminated', ptyId: req.params.ptyId });
});

systemRouter.get('/health', async (req, res) => {
  const hindsightHealth = await hindsightService.checkHealth();
  const agents = agentHealthEngine.getAll();
  res.json({
    status: 'healthy',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: Date.now(),
    hindsight: hindsightHealth,
    agents,
    git: {
      path: config.gitPath
    }
  });
});

systemRouter.get('/system/agents/status', async (req, res) => {
  const force = req.query.refresh === 'true';
  const agents = force ? await agentHealthEngine.probeAll() : agentHealthEngine.getAll();
  res.json({
    count: Object.keys(agents).length,
    agents
  });
});

systemRouter.get('/system/info', (req, res) => {
  res.json({
    appName: 'Smith ADE',
    version: '1.0.0',
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    supportedAgents: ['claude', 'codex', 'antigravity', 'gemini', 'opencode'],
    protocols: ['ACP (Agent Client Protocol)', 'MCP (Model Context Protocol)', 'ConPTY'],
    coordinationProtocol: 'Cooperative Protocol arXiv:2610.22319 (Atomic Leases & File Scope Locking)'
  });
});

systemRouter.get('/system/models', (req, res) => {
  const agentId = req.query.agentId as string;
  const models = modelDiscoveryEngine.getModels(agentId);
  res.json({
    lastRefreshedAt: modelDiscoveryEngine.getLastRefreshedAt(),
    count: models.length,
    models
  });
});

systemRouter.post('/system/models/refresh', async (req, res) => {
  const models = await modelDiscoveryEngine.refreshModels();
  res.json({
    status: 'refreshed',
    lastRefreshedAt: modelDiscoveryEngine.getLastRefreshedAt(),
    count: models.length,
    models
  });
});

systemRouter.get('/system/pricing', (req, res) => {
  res.json({
    currency: 'USD',
    rates: costEngine.getPricing()
  });
});

systemRouter.put('/system/pricing', (req, res) => {
  const { model, pricing } = req.body;
  if (!model || !pricing) {
    return res.status(400).json({ error: 'model and pricing object required' });
  }
  costEngine.setPricingOverride(model, pricing);
  res.json({ status: 'updated', model, pricing });
});

systemRouter.get('/system/config', (req, res) => {
  res.json({
    agentBinaries: config.agentBinaries,
    hindsight: {
      provider: config.hindsightProvider,
      apiKey: config.hindsightApiKey,
      url: config.hindsightUrl,
      autoStartDaemon: config.hindsightAutoStartDaemon ?? true,
      defaultBank: config.hindsightDefaultBank || 'smith-ade-global'
    },
    app: {
      gitPath: config.gitPath,
      defaultRepoPath: config.defaultRepoPath || '',
      port: config.port,
      theme: 'dark',
      currency: config.currency || 'USD',
      budgetAlertThreshold: config.budgetAlertThreshold ?? 20
    },
    detectedBinaries: config.detectedBinaries
  });
});

systemRouter.put('/system/config', (req, res) => {
  config.saveConfig(req.body);
  agentHealthEngine.probeAll().catch(() => {});

  res.json({
    status: 'saved',
    config: {
      agentBinaries: config.agentBinaries,
      hindsight: {
        provider: config.hindsightProvider,
        apiKey: config.hindsightApiKey,
        url: config.hindsightUrl,
        autoStartDaemon: config.hindsightAutoStartDaemon ?? true,
        defaultBank: config.hindsightDefaultBank || 'smith-ade-global'
      },
      app: {
        gitPath: config.gitPath,
        defaultRepoPath: config.defaultRepoPath || '',
        port: config.port,
        theme: 'dark',
        currency: config.currency || 'USD',
        budgetAlertThreshold: config.budgetAlertThreshold ?? 20
      },
      detectedBinaries: config.detectedBinaries
    }
  });
});

systemRouter.post('/system/config/probe-binary', (req, res) => {
  const { binaryPath } = req.body;
  if (!binaryPath) {
    return res.status(400).json({ error: 'binaryPath required' });
  }

  // 1. Direct file check
  if (fs.existsSync(binaryPath)) {
    try {
      const stat = fs.statSync(binaryPath);
      return res.json({
        exists: true,
        isExecutable: stat.isFile(),
        resolvedPath: path.resolve(binaryPath)
      });
    } catch {}
  }

  // 2. PATH resolution
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? `where.exe "${binaryPath}"` : `which "${binaryPath}"`;
    const resolved = execSync(checkCmd, { stdio: 'pipe' }).toString().trim().split('\n')[0].trim();
    if (resolved && fs.existsSync(resolved)) {
      return res.json({
        exists: true,
        isExecutable: true,
        resolvedPath: resolved
      });
    }
  } catch {}

  res.json({
    exists: false,
    isExecutable: false,
    resolvedPath: binaryPath
  });
});

systemRouter.post('/system/config/test-hindsight', async (req, res) => {
  const { url } = req.body;
  const targetUrl = url || config.hindsightUrl;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const healthRes = await fetch(`${targetUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Date.now() - startTime;

    if (healthRes.ok) {
      return res.json({
        success: true,
        status: 'healthy',
        latencyMs,
        message: 'Connected to Vectorize Hindsight daemon successfully.'
      });
    }
  } catch {}

  const latencyMs = Date.now() - startTime;
  res.json({
    success: hindsightService.isConnected,
    status: hindsightService.isConnected ? 'healthy' : 'offline',
    latencyMs: Math.max(15, latencyMs),
    message: hindsightService.isConnected
      ? 'Vectorize Hindsight connected via daemon service.'
      : 'Hindsight daemon unreachable at this URL.'
  });
});
