import React, { useEffect, useState } from 'react';
import { ArrowUp, Folder, Home, X } from 'lucide-react';

interface Folders {
  path: string; parent: string | null; home: string;
  folders: Array<{ name: string; path: string; isRepository: boolean }>;
}

export function FolderPicker({ initialPath, onSelect, onClose }: { initialPath?: string; onSelect: (path: string) => void; onClose: () => void }) {
  const [directory, setDirectory] = useState(initialPath || '');
  const [data, setData] = useState<Folders | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/v1/system/folders?${new URLSearchParams({ ...(directory ? { path: directory } : {}), hidden: String(hidden) })}`, { signal: abort.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(setData).catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [directory, hidden]);
  return (
    <div className="fixed inset-0 z-[60] bg-ink-900/25 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="folder-picker-title" className="bg-ink-0 rounded-2xl shadow-float w-full max-w-lg max-h-[80dvh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-ink-100">
          <h2 id="folder-picker-title" className="text-sm font-semibold">Choose repository folder</h2>
          <button aria-label="Close folder selector" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 flex items-center gap-2 border-b border-ink-100 text-xs">
          <button title="Home folder" onClick={() => setDirectory(data?.home || '')} className="p-2 rounded-lg hover:bg-ink-50"><Home className="w-4 h-4" /></button>
          <button title="Parent folder" disabled={!data?.parent || loading} onClick={() => setDirectory(data!.parent!)} className="p-2 rounded-lg hover:bg-ink-50 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
          <span className="font-mono break-all min-w-0">{data?.path || directory || 'Home'}</span>
        </div>
        <div className="overflow-y-auto min-h-[180px] p-2">
          {error && <p role="alert" className="text-xs text-rose-700 p-3">{error}</p>}
          {loading ? <p className="text-xs text-ink-500 p-3">Loading folders…</p> : !error && data?.folders.map(folder => (
            <button key={folder.path} onClick={() => setDirectory(folder.path)} className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-left text-xs hover:bg-lav-50">
              <Folder className="w-4 h-4 text-lav-600 shrink-0" /><span className="break-all">{folder.name}</span>
              {folder.isRepository && <span className="ml-auto text-[10px] text-ink-400 shrink-0">Git repository</span>}
            </button>
          ))}
          {!loading && !error && data?.folders.length === 0 && <p className="p-3 text-xs text-ink-400">No subfolders.</p>}
        </div>
        <div className="p-4 border-t border-ink-100 flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-ink-500"><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> Hidden folders</label>
          <button disabled={!data || loading || !!error} onClick={() => onSelect(data!.path)} className="px-3 py-2 rounded-xl bg-lav-200 text-lav-700 disabled:opacity-40">Use this folder</button>
        </div>
      </div>
    </div>
  );
}
