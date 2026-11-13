export * from './types.ts';

import { AgentAdapter } from './types.ts';
import { claudeAdapter } from './claude.adapter.ts';
import { codexAdapter } from './codex.adapter.ts';
import { opencodeAdapter } from './opencode.adapter.ts';
import { HarnessId } from '../../shared/board.ts';

export const HARNESSES: HarnessId[] = ['claude', 'codex', 'opencode'];

const registry = new Map<string, AgentAdapter>([
  ['claude', claudeAdapter],
  ['codex', codexAdapter],
  ['opencode', opencodeAdapter]
]);

export function isHarness(id: unknown): id is HarnessId {
  return typeof id === 'string' && registry.has(id);
}

export function getAgentAdapter(harness: string): AgentAdapter {
  const adapter = registry.get(harness);
  if (!adapter) throw new Error(`Unknown harness: ${harness}`);
  return adapter;
}
