import React, { useEffect, useMemo, useState } from 'react';
import { X, Sliders, Check, Wrench, Layers, Package, KeyRound } from 'lucide-react';
import { SessionCustomizations, Skill, CustomMCPServer, Plugin, DiscoveredModel, Session } from '../../shared/types.ts';

interface CustomizationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customizations: SessionCustomizations;
  /** The session's workers, for choosing who a skill, server or plugin applies to. */
  workers: Session['agents'];
  allSkills: Skill[];
  allMCPs: CustomMCPServer[];
  allPlugins: Plugin[];
  availableModels?: DiscoveredModel[];
  agentHealth?: Record<string, any>;
  /** Saves the changes; resolves to an error message, or null on success. */
  onApplyChanges: (updated: Partial<SessionCustomizations>) => Promise<string | null>;
}

const Toggle: React.FC<{ on: boolean; onChange: () => void; label: string }> = ({ on, onChange, label }) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onChange}
    className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${on ? 'bg-lav-400' : 'bg-ink-200'}`}
  >
    <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-ink-0 shadow-sm transition-all ${on ? 'left-[16px]' : 'left-[2px]'}`} />
  </button>
);

/** "All workers" or a chosen subset, shown under each item that is on. */
const WorkerTargets: React.FC<{ workerIds: string[]; selected: string[]; onChange: (next: string[]) => void }> = ({ workerIds, selected, onChange }) => {
  if (workerIds.length < 2) return null;
  const all = selected.length === 0;
  const toggle = (id: string) => {
    const base = all ? [] : selected;
    const next = base.includes(id) ? base.filter(w => w !== id) : [...base, id];
    onChange(next.length === workerIds.length ? [] : next);
  };
  return (
    <div className="flex flex-wrap items-center gap-1 mt-2.5">
      <span className="text-[10.5px] text-ink-400 mr-0.5">For</span>
      <button
        onClick={() => onChange([])}
        className={`px-2 py-0.5 rounded-full text-[10.5px] transition-colors ${all ? 'bg-lav-100 text-lav-700' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'}`}
      >
        all workers
      </button>
      {workerIds.map(id => {
        const on = !all && selected.includes(id);
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono transition-colors ${on ? 'bg-lav-100 text-lav-700' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'}`}
          >
            @{id}
          </button>
        );
      })}
    </div>
  );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> = ({ icon, title, hint, children }) => (
  <section>
    <div className="flex items-baseline justify-between mb-2">
      <span className="font-medium text-[12.5px] text-ink-800 flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      {hint && <span className="text-[10.5px] text-ink-400">{hint}</span>}
    </div>
    <div className="space-y-2">{children}</div>
  </section>
);

export const CustomizationsDrawer: React.FC<CustomizationsDrawerProps> = ({
  isOpen,
  onClose,
  customizations,
  workers,
  allSkills,
  allMCPs,
  allPlugins,
  onApplyChanges
}) => {
  const [skills, setSkills] = useState<string[]>([]);
  const [plugins, setPlugins] = useState<string[]>([]);
  const [servers, setServers] = useState<Record<string, { enabled: boolean; values: Record<string, string> }>>({});
  const [targets, setTargets] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start from what the session really has each time the drawer opens.
  useEffect(() => {
    if (!isOpen) return;
    setSkills(customizations.skills || []);
    setPlugins(customizations.plugins || []);
    setServers(
      Object.fromEntries(
        Object.entries(customizations.mcpServers || {}).map(([id, s]) => [id, { enabled: !!s.enabled, values: { ...(s.values || {}) } }])
      )
    );
    setTargets({ ...(customizations.targets || {}) });
    setError(null);
  }, [isOpen, customizations]);

  const workerIds = useMemo(() => Object.keys(workers || {}), [workers]);
  const hasCodex = workerIds.some(id => workers[id]?.config.agentId === 'codex');

  /** Servers a selected plugin switches on, so their inputs are asked for too. */
  const viaPlugin = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const pid of plugins) {
      const plugin = allPlugins.find(p => p.id === pid);
      plugin?.mcpServers.forEach(sid => (map[sid] = [...(map[sid] || []), plugin.name]));
    }
    return map;
  }, [plugins, allPlugins]);

  if (!isOpen) return null;

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const setTarget = (key: string, next: string[]) => setTargets(prev => ({ ...prev, [key]: next }));
  const serverState = (id: string) => servers[id] || { enabled: false, values: {} };

  const handleApply = async () => {
    setSaving(true);
    setError(null);
    const mcpServers = Object.fromEntries(
      allMCPs
        .filter(s => servers[s.id] && (servers[s.id].enabled || Object.keys(servers[s.id].values).length > 0))
        .map(s => [s.id, { ...s, enabled: servers[s.id].enabled, values: servers[s.id].values }])
    );
    const err = await onApplyChanges({ skills, plugins, mcpServers, targets });
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };

  const card = (on: boolean) => `p-3.5 rounded-xl transition-colors ${on ? 'bg-ink-0 shadow-soft' : 'bg-ink-0/60'}`;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-ink-900/15" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 max-w-full flex">
        <div className="w-screen max-w-md bg-ink-50 shadow-float flex flex-col text-ink-900 pt-[env(safe-area-inset-top)]">
          <div className="px-5 py-4 flex items-start justify-between flex-shrink-0">
            <div className="flex items-start gap-2.5">
              <Sliders className="w-4 h-4 text-ink-500 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Skills and tools</h2>
                <p className="text-[11.5px] text-ink-500 mt-0.5">For this session. Changes apply from each worker's next turn.</p>
              </div>
            </div>
            <button onClick={onClose} title="Close" className="p-1.5 rounded-lg text-ink-400 hover:text-ink-800 hover:bg-ink-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-6 text-xs">
            <Section icon={<Layers className="w-3.5 h-3.5 text-ink-400" />} title="Skills" hint="Added to the worker's instructions">
              {allSkills.map(s => {
                const on = skills.includes(s.id);
                return (
                  <div key={s.id} className={card(on)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-ink-800">{s.name}</div>
                        <div className="text-[11px] text-ink-500 mt-0.5">{s.description}</div>
                      </div>
                      <Toggle on={on} onChange={() => setSkills(toggleIn(skills, s.id))} label={s.name} />
                    </div>
                    {on && <WorkerTargets workerIds={workerIds} selected={targets[`skill:${s.id}`] || []} onChange={next => setTarget(`skill:${s.id}`, next)} />}
                  </div>
                );
              })}
            </Section>

            <Section icon={<Wrench className="w-3.5 h-3.5 text-ink-400" />} title="MCP servers" hint="Started by each worker's CLI">
              {allMCPs.map(s => {
                const state = serverState(s.id);
                const plugins = viaPlugin[s.id];
                const on = state.enabled || !!plugins;
                return (
                  <div key={s.id} className={card(on)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-ink-800">{s.name}</div>
                        <div className="text-[11px] text-ink-500 mt-0.5">{s.description}</div>
                        {plugins && !state.enabled && <div className="text-[10.5px] text-lav-600 mt-1">On through {plugins.join(', ')}</div>}
                      </div>
                      <Toggle
                        on={state.enabled}
                        onChange={() => setServers(prev => ({ ...prev, [s.id]: { ...state, enabled: !state.enabled } }))}
                        label={s.name}
                      />
                    </div>
                    {on && (s.inputs || []).length > 0 && (
                      <div className="mt-3 space-y-2">
                        {(s.inputs || []).map(input => (
                          <label key={input.key} className="block">
                            <span className="flex items-center gap-1 text-[10.5px] font-medium text-ink-500 mb-1">
                              {input.secret && <KeyRound className="w-3 h-3" />}
                              {input.label}
                            </span>
                            <input
                              type={input.secret ? 'password' : 'text'}
                              value={state.values[input.key] || ''}
                              placeholder={input.placeholder}
                              autoComplete="off"
                              onChange={e =>
                                setServers(prev => ({ ...prev, [s.id]: { ...state, values: { ...state.values, [input.key]: e.target.value } } }))
                              }
                              className="w-full bg-ink-50 rounded-lg px-2.5 py-1.5 text-[11.5px] font-mono text-ink-800 placeholder-ink-400 ring-1 ring-transparent focus:outline-none focus:ring-lav-300"
                            />
                          </label>
                        ))}
                        {(s.inputs || []).some(i => i.secret) && (
                          <p className="text-[10.5px] text-ink-400">Stored with the session on this machine; shown masked.</p>
                        )}
                      </div>
                    )}
                    {state.enabled && <WorkerTargets workerIds={workerIds} selected={targets[`mcp:${s.id}`] || []} onChange={next => setTarget(`mcp:${s.id}`, next)} />}
                  </div>
                );
              })}
              {hasCodex && <p className="text-[10.5px] text-ink-400">Codex workers get these servers too; that path has not been tried with a real Codex install yet.</p>}
            </Section>

            <Section icon={<Package className="w-3.5 h-3.5 text-ink-400" />} title="Plugins" hint="Bundles of skills and servers">
              {allPlugins.map(p => {
                const on = plugins.includes(p.id);
                const skillNames = p.skills.map(id => allSkills.find(s => s.id === id)?.name || id);
                const serverNames = p.mcpServers.map(id => allMCPs.find(s => s.id === id)?.name || id);
                return (
                  <div key={p.id} className={card(on)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-ink-800">{p.name}</div>
                        <div className="text-[11px] text-ink-500 mt-0.5">{p.description}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {[...skillNames, ...serverNames].map(n => (
                            <span key={n} className="px-1.5 py-0.5 rounded-full bg-ink-50 text-[10px] text-ink-500">
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Toggle on={on} onChange={() => setPlugins(toggleIn(plugins, p.id))} label={p.name} />
                    </div>
                    {on && <WorkerTargets workerIds={workerIds} selected={targets[`plugin:${p.id}`] || []} onChange={next => setTarget(`plugin:${p.id}`, next)} />}
                  </div>
                );
              })}
            </Section>
          </div>

          <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex-shrink-0 space-y-2">
            {error && <div className="text-[11.5px] text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-3.5 py-2 rounded-xl hover:bg-ink-100 text-ink-500 hover:text-ink-800 font-medium text-xs">
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lav-200 hover:bg-lav-300 text-lav-700 font-medium text-xs disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
