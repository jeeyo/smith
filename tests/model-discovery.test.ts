import { describe, it, expect } from 'vitest';
import { ModelDiscoveryEngine } from '../src/server/model-discovery.ts';

describe('ModelDiscoveryEngine (Dynamic Model Probing)', () => {
  it('discovers models dynamically without hardcoding', async () => {
    const engine = new ModelDiscoveryEngine();
    const models = await engine.refreshModels();

    expect(models.length).toBeGreaterThan(0);

    const claudeModels = engine.getModels('claude');
    expect(claudeModels.length).toBeGreaterThan(0);
    expect(claudeModels.some(m => m.id.includes('claude-3-7'))).toBe(true);

    const codexModels = engine.getModels('codex');
    expect(codexModels.length).toBeGreaterThan(0);

    const antigravityModels = engine.getModels('antigravity');
    expect(antigravityModels.length).toBeGreaterThan(0);
  });

  it('allows registering custom experimental models', () => {
    const engine = new ModelDiscoveryEngine();
    engine.registerCustomModel({
      id: 'custom-expert-v1',
      name: 'Custom Domain Expert',
      agentId: 'claude',
      provider: 'Internal',
      source: 'custom'
    });

    const claudeModels = engine.getModels('claude');
    expect(claudeModels.some(m => m.id === 'custom-expert-v1')).toBe(true);
  });
});
