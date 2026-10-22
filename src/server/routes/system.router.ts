import { Router } from 'express';
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
