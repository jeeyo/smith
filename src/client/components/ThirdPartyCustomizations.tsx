import React, { useEffect, useState } from 'react';
import type { CustomMCPServer } from '../../shared/types.ts';

const field = 'w-full px-2.5 py-2 rounded-lg bg-ink-50 border border-ink-200 text-xs focus:outline-lav-300';
async function post(url: string, body: unknown) {
  const response = await fetch(`/api/v1${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;
}

export const SkillImport: React.FC<{ sessionId: string; onChanged: () => Promise<void> }> = ({ sessionId, onChanged }) => {
  const [source, setSource] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  return <form className="p-3 bg-ink-0 rounded-xl space-y-2" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setMessage('');
    try { const skill = await post('/customizations/skills/install', { source, sessionId }); await onChanged(); setMessage(`Installed ${skill.name} in this session.`); setSource(''); }
    catch (err: any) { setMessage(err.message); } finally { setBusy(false); }
  }}>
    <label className="block font-medium">Install a third-party skill<input aria-label="Skill URL or local path" value={source} onChange={e => setSource(e.target.value)} placeholder="https://github.com/owner/repo/tree/main/skills/name or /path/to/skill" className={`${field} mt-2`} required/></label>
    <p className="text-[11px] text-ink-500">Choose a SKILL.md file, skill folder or repository URL. Scripts, references and assets are included. Installs and enables immediately.</p>
    <button disabled={busy || !source.trim()} className="px-3 py-1.5 bg-lav-100 text-lav-700 rounded-lg disabled:opacity-50">{busy ? 'Installing…' : 'Install skill'}</button>
    {message && <p role="status" className="break-words">{message}</p>}
  </form>;
};

export const MCPImport: React.FC<{ onChanged: () => Promise<void> }> = ({ onChanged }) => {
  const [open, setOpen] = useState(false); const [transport, setTransport] = useState('http'); const [oauth, setOauth] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');
  useEffect(() => { fetch('/api/v1/mcp/oauth/config').then(r => r.json()).then(data => setRedirectUrl(data.redirectUrl || '')).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  return <div className="p-3 bg-ink-0 rounded-xl">
    <button type="button" onClick={() => setOpen(!open)} className="text-lav-700 font-medium">{open ? 'Close server form' : '+ Add third-party MCP server'}</button>
    {open && <form className="mt-3 space-y-2" onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setMessage('');
      try {
        const json = (key: string, fallback: unknown) => data.get(key) ? JSON.parse(String(data.get(key))) : fallback;
        await post('/customizations/mcp', { id: data.get('id'), name: data.get('name'), transport, url: transport === 'http' ? data.get('url') : undefined, command: data.get('command'), args: json('args', []), env: json('env', undefined), headers: json('headers', undefined), auth: oauth ? 'oauth' : 'none', oauth: oauth ? { clientId: data.get('clientId'), clientSecret: data.get('clientSecret'), scope: data.get('scope') } : undefined });
        await onChanged(); setMessage('Added. Switch the server on and Apply to use it in this session.'); setOpen(false);
      } catch (err: any) { setMessage(err.message); } finally { setBusy(false); }
    }}>
      <label className="block">Server id<input aria-label="MCP server id" name="id" pattern="[A-Za-z0-9_-]{1,64}" required className={field}/></label>
      <label className="block">Name<input aria-label="MCP server name" name="name" required className={field}/></label>
      <label className="block">Transport<select aria-label="MCP transport" value={transport} onChange={e => setTransport(e.target.value)} className={field}><option value="http">Streamable HTTP</option><option value="stdio">Local command (stdio)</option></select></label>
      {transport === 'http' ? <>
        <label className="block">MCP endpoint<input aria-label="MCP endpoint" name="url" type="url" required placeholder="https://example.com/mcp" className={field}/></label>
        <label className="block">Headers (JSON, optional)<textarea aria-label="MCP headers" name="headers" placeholder={'{"Authorization":"Bearer …"}'} className={field}/></label>
        <label className="flex gap-2 items-center"><input aria-label="Use OAuth" type="checkbox" checked={oauth} onChange={e => setOauth(e.target.checked)}/> Use OAuth</label>
        {oauth && <><p className="text-ink-500">Smith discovers OAuth settings automatically. If the provider requires a registered client, enter it here. Redirect URI: {redirectUrl || 'Loading redirect URI…'}</p><label className="block">Client ID (optional)<input name="clientId" aria-label="OAuth client ID" className={field}/></label><label className="block">Client secret (optional)<input name="clientSecret" aria-label="OAuth client secret" type="password" autoComplete="off" className={field}/></label><label className="block">Scope (optional)<input name="scope" aria-label="OAuth scope" className={field}/></label></>}
      </> : <>
        <label className="block">Command<input name="command" aria-label="MCP command" required placeholder="npx" className={field}/></label>
        <label className="block">Arguments (JSON array)<input name="args" aria-label="MCP arguments" placeholder={'["-y", "@example/mcp-server"]'} className={field}/></label>
        <label className="block">Environment (JSON, optional)<textarea name="env" aria-label="MCP environment" placeholder={'{"API_KEY":"…"}'} className={field}/></label>
      </>}
      <p className="text-[11px] text-ink-500">Credentials stay on this machine and are masked in API responses.</p>
      <button disabled={busy} className="px-3 py-1.5 bg-lav-100 text-lav-700 rounded-lg disabled:opacity-50">{busy ? 'Adding…' : 'Add server'}</button>
    </form>}
    {message && <p role="status" className="mt-2 break-words">{message}</p>}
  </div>;
};

export const MCPConnection: React.FC<{ server: CustomMCPServer; sessionId: string }> = ({ server, sessionId }) => {
  const [status, setStatus] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [url, setUrl] = useState('');
  useEffect(() => {
    if (server.auth !== 'oauth') return;
    let active = true;
    const load = () => fetch(`/api/v1/customizations/mcp/${encodeURIComponent(server.id)}/connection?sessionId=${encodeURIComponent(sessionId)}`).then(r => r.json()).then(data => { if (active) { setStatus(data.status); setUrl(data.authorizationUrl || ''); } }).catch(() => {});
    load(); const timer = setInterval(load, 2000); return () => { active = false; clearInterval(timer); };
  }, [server.id, server.auth, sessionId]);
  const action = async (name: string) => {
    setBusy(true); setMessage('');
    try {
      const result = await post(`/customizations/mcp/${encodeURIComponent(server.id)}/${name}`, { sessionId });
      if (result.status) setStatus(result.status);
      setUrl(result.authorizationUrl || '');
      if (result.tools) setMessage(`Connected · ${result.tools.length} tools: ${result.tools.map((tool: any) => tool.name).join(', ')}`);
    } catch (err: any) { setMessage(err.message); } finally { setBusy(false); }
  };
  return <div className="mt-2 space-y-2 text-[11px]">
    <div className="text-ink-400 break-all">{server.transport === 'http' ? server.url : server.command}</div>
    <div className="flex gap-2 items-center flex-wrap">
      {server.auth === 'oauth' && <><span>OAuth: {status || 'checking'}</span><button type="button" disabled={busy} onClick={() => action(status === 'connected' ? 'disconnect' : 'connect')} className="text-lav-700 underline">{status === 'connected' ? 'Disconnect' : 'Connect OAuth'}</button></>}
      <button type="button" disabled={busy} onClick={() => action('test')} className="text-lav-700 underline">{busy ? 'Working…' : 'Test connection'}</button>
    </div>
    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block px-3 py-2 bg-lav-100 rounded-lg text-lav-700">Authorize in browser</a>}
    {message && <p role="status" className="break-words">{message}</p>}
  </div>;
};
