import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, publicConfig } from '../config.ts';
import { modelDiscoveryEngine } from '../model-discovery.ts';
import { costEngine } from '../cost-engine.ts';
import { agentHealthEngine } from '../agent-health.ts';
import { ptyManager } from '../pty-manager.ts';
import { findOnPath } from '../process-utils.ts';
import { HARNESSES } from '../adapters/index.ts';
import { scheduler } from '../scheduler.ts';

export const systemRouter = Router();

const VERSION = process.env.npm_package_version || '0.3.0';

systemRouter.post('/system/pty/create', (req, res) => {
  const { command, cwd } = req.body || {};
  if (command !== undefined && typeof command !== 'string') {
    return res.status(400).json({ error: 'command must be a string' });
  }
  const targetCwd = typeof cwd === 'string' && cwd ? cwd : config.homeDir;
  if (!fs.existsSync(targetCwd) || !fs.statSync(targetCwd).isDirectory()) {
    return res.status(400).json({ error: `cwd does not exist: ${targetCwd}` });
  }
  const ptyId = `pty-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const pty = ptyManager.createPTY(ptyId, 'system', targetCwd, command);
  res.json({ ptyId, cwd: targetCwd, command: pty.shell });
});

systemRouter.delete('/system/pty/:ptyId', (req, res) => {
  ptyManager.terminatePTY(req.params.ptyId);
  res.json({ status: 'terminated', ptyId: req.params.ptyId });
});

systemRouter.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    version: VERSION,
    uptime: process.uptime(),
    timestamp: Date.now(),
    agents: agentHealthEngine.getAll(),
    agentBinaries: config.agentBinaries,
    git: { path: config.gitPath }
  });
});

systemRouter.get('/system/agents/status', async (req, res) => {
  const force = req.query.refresh === 'true';
  const agents = force ? await agentHealthEngine.probeAll() : agentHealthEngine.getAll();
  // A CLI that was logged out may be usable again; let waiting goals pick up.
  if (force) scheduler.pokeAll();
  res.json({ count: Object.keys(agents).length, agents });
});

systemRouter.get('/system/info', (_req, res) => {
  res.json({
    appName: 'Smith',
    version: VERSION,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    supportedAgents: HARNESSES,
    protocols: ['MCP (Model Context Protocol) over HTTP for the shared board']
  });
});

systemRouter.get('/system/models', (req, res) => {
  const agentId = req.query.agentId as string;
  const models = modelDiscoveryEngine.getModels(agentId);
  res.json({ lastRefreshedAt: modelDiscoveryEngine.getLastRefreshedAt(), count: models.length, models });
});

systemRouter.post('/system/models/refresh', async (_req, res) => {
  const models = await modelDiscoveryEngine.refreshModels();
  res.json({ status: 'refreshed', lastRefreshedAt: modelDiscoveryEngine.getLastRefreshedAt(), count: models.length, models });
});

systemRouter.get('/system/pricing', (_req, res) => {
  res.json({ currency: 'USD', rates: costEngine.getPricing() });
});

systemRouter.put('/system/pricing', (req, res) => {
  const { model, pricing } = req.body || {};
  if (!model || !pricing) {
    return res.status(400).json({ error: 'model and pricing object required' });
  }
  costEngine.setPricingOverride(model, pricing);
  res.json({ status: 'updated', model, pricing });
});

systemRouter.get('/system/config', (_req, res) => {
  res.json(publicConfig());
});

systemRouter.put('/system/config', (req, res) => {
  config.saveConfig(req.body || {});
  agentHealthEngine.probeAll().then(() => scheduler.pokeAll()).catch(() => {});
  res.json({ status: 'saved', config: publicConfig() });
});

systemRouter.post('/system/config/probe-binary', (req, res) => {
  const { binaryPath } = req.body || {};
  if (!binaryPath || typeof binaryPath !== 'string') {
    return res.status(400).json({ error: 'binaryPath required' });
  }

  if (fs.existsSync(binaryPath)) {
    try {
      const stat = fs.statSync(binaryPath);
      return res.json({ exists: true, isExecutable: stat.isFile(), resolvedPath: path.resolve(binaryPath) });
    } catch {}
  }

  // PATH resolution without a shell: binaryPath is caller-supplied.
  const resolved = findOnPath(binaryPath);
  if (resolved) {
    return res.json({ exists: true, isExecutable: true, resolvedPath: resolved });
  }
  res.json({ exists: false, isExecutable: false, resolvedPath: binaryPath });
});
