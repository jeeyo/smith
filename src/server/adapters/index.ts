export * from './types.ts';
export * from './claude.adapter.ts';
export * from './codex.adapter.ts';
export * from './antigravity.adapter.ts';

import { AgentAdapter } from './types.ts';
import { claudeAdapter } from './claude.adapter.ts';
import { codexAdapter } from './codex.adapter.ts';
import { antigravityAdapter } from './antigravity.adapter.ts';
import { AgentId } from '../../shared/types.ts';

const registry = new Map<AgentId, AgentAdapter>([
  ['claude', claudeAdapter],
  ['codex', codexAdapter],
  ['antigravity', antigravityAdapter]
]);

export function getAgentAdapter(agentId: AgentId): AgentAdapter {
  const adapter = registry.get(agentId);
  if (!adapter) {
    // Default to antigravity adapter for unspecified or mock agents
    return antigravityAdapter;
  }
  return adapter;
}
