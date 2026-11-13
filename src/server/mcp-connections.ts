import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { Readable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthTokens, OAuthClientInformationMixed, OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { config } from './config.ts';
import { globalMCPs, resolveFor, serversInUse, type ResolvedServer } from './catalog.ts';
import { getSession } from './session-store.ts';
import type { CustomMCPServer } from '../shared/types.ts';

interface Connection {
  serverId: string;
  url: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  expiresAt?: number;
  verifier?: string;
  state?: string;
  stateExpiresAt?: number;
  authorizationUrl?: string;
  discovery?: OAuthDiscoveryState;
}

const storeFile = path.join(config.storageDir, 'mcp-oauth.json');
const connections: Record<string, Connection> = (() => {
  try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { return {}; }
})();
function persist() {
  const tmp = `${storeFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(connections, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, storeFile);
}

let listeningPort: number | undefined;
export function setSmithListeningPort(port: number) { listeningPort = port; }
export function smithBaseUrl() { return `http://127.0.0.1:${listeningPort || config.port}`; }

function definition(id: string, sessionId?: string): CustomMCPServer {
  const server = globalMCPs.get(id) || (sessionId ? getSession(sessionId)?.customizations.mcpServers[id] : undefined);
  if (!server) throw new Error('MCP server not found.');
  return server;
}
function keyFor(server: CustomMCPServer) { return crypto.createHash('sha256').update(`${server.id}\0${server.url}`).digest('hex'); }

class Provider implements OAuthClientProvider {
  authorizationUrl?: string;
  readonly record: Connection;
  constructor(readonly server: CustomMCPServer) {
    const key = keyFor(server);
    this.record = connections[key] ||= { serverId: server.id, url: server.url! };
  }
  get redirectUrl() { return `${smithBaseUrl()}/api/v1/mcp/oauth/callback`; }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: 'Smith', redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: this.server.oauth?.clientSecret ? 'client_secret_post' : 'none', ...(this.server.oauth?.scope ? { scope: this.server.oauth.scope } : {}) };
  }
  clientInformation() {
    return this.record.client || (this.server.oauth?.clientId ? { client_id: this.server.oauth.clientId, client_secret: this.server.oauth.clientSecret } : undefined);
  }
  saveClientInformation(client: OAuthClientInformationMixed) { this.record.client = client; persist(); }
  tokens() { return this.record.tokens; }
  saveTokens(tokens: OAuthTokens) {
    this.record.tokens = tokens;
    this.record.expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined;
    this.record.authorizationUrl = undefined;
    persist();
  }
  state() {
    this.record.state = crypto.randomBytes(32).toString('hex');
    this.record.stateExpiresAt = Date.now() + 10 * 60_000;
    persist(); return this.record.state;
  }
  redirectToAuthorization(url: URL) { this.authorizationUrl = url.href; this.record.authorizationUrl = url.href; persist(); }
  saveCodeVerifier(verifier: string) { this.record.verifier = verifier; persist(); }
  codeVerifier() { if (!this.record.verifier) throw new Error('Authorization expired. Connect again.'); return this.record.verifier; }
  saveDiscoveryState(state: OAuthDiscoveryState) { this.record.discovery = state; persist(); }
  discoveryState() { return this.record.discovery; }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'client') this.record.client = undefined;
    if (scope === 'all' || scope === 'tokens') { this.record.tokens = undefined; this.record.expiresAt = undefined; }
    if (scope === 'all' || scope === 'verifier') this.record.verifier = undefined;
    if (scope === 'all' || scope === 'discovery') this.record.discovery = undefined;
    persist();
  }
}

export function connectionStatus(id: string, sessionId?: string) {
  const server = definition(id, sessionId);
  if (server.auth !== 'oauth') return { status: 'not_required' as const };
  const record = connections[keyFor(server)];
  return {
    status: record?.tokens ? 'connected' as const : 'disconnected' as const,
    expiresAt: record?.expiresAt,
    authorizationUrl: record?.stateExpiresAt && record.stateExpiresAt > Date.now() ? record.authorizationUrl : undefined
  };
}

function resolved(id: string, sessionId?: string): ResolvedServer {
  const server = definition(id, sessionId);
  const session = sessionId ? getSession(sessionId) : undefined;
  if (session) {
    const custom = { ...session.customizations, plugins: [], mcpServers: { [id]: { ...server, enabled: true, values: session.customizations.mcpServers[id]?.values } } };
    const item = resolveFor(custom, '', session.worktree.path).mcpServers[0];
    if (!item) throw new Error('Complete the server inputs before connecting.');
    return item;
  }
  return { ...server, args: server.args || [] };
}

/** Starts discovery + PKCE through the SDK. The returned URL is opened by the user. */
export async function startOAuth(id: string, sessionId?: string) {
  const server = definition(id, sessionId);
  if (server.transport !== 'http' || server.auth !== 'oauth') throw new Error('Choose an HTTP server with OAuth enabled.');
  const provider = new Provider(server);
  const client = new Client({ name: 'smith', version: '0.3.0' });
  const transport = new StreamableHTTPClientTransport(new URL(server.url!), { authProvider: provider, requestInit: { headers: resolved(id, sessionId).headers, signal: AbortSignal.timeout(30000) } });
  try {
    await client.connect(transport, { timeout: 30000 });
    return { ...connectionStatus(id, sessionId), status: 'connected', authorizationUrl: undefined };
  } catch (err) {
    if (provider.authorizationUrl) return { status: 'authorization_required', authorizationUrl: provider.authorizationUrl };
    throw err;
  } finally { await client.close().catch(() => {}); }
}

const refreshing = new Map<string, Promise<void>>();
async function authorization(server: CustomMCPServer, force = false): Promise<string | undefined> {
  if (server.auth !== 'oauth') return undefined;
  const provider = new Provider(server);
  if (!provider.record.tokens) throw new Error('Authorization required. Connect this server in Skills and tools.');
  if (force || (provider.record.expiresAt && provider.record.expiresAt < Date.now() + 10000)) {
    const key = keyFor(server);
    let pending = refreshing.get(key);
    if (!pending) {
      pending = auth(provider, { serverUrl: server.url!, scope: server.oauth?.scope, fetchFn: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30000) }) })
        .then(result => { if (result !== 'AUTHORIZED') throw new Error('Authorization expired. Connect this server again.'); })
        .finally(() => refreshing.delete(key));
      refreshing.set(key, pending);
    }
    await pending;
  }
  return provider.record.tokens?.access_token;
}

/** A local credential broker means every harness gets refresh support without token argv. */
export function workerServers(sessionId: string, servers: ResolvedServer[]): ResolvedServer[] {
  return [
    { id: 'smith', transport: 'http', url: `${smithBaseUrl()}/mcp?sessionId=${encodeURIComponent(sessionId)}`, command: '', args: [] },
    ...servers.filter(server => !['board', 'smith'].includes(server.id)).map(server => server.transport === 'http'
      ? { id: server.id, command: '', args: [], transport: 'http' as const, url: `${smithBaseUrl()}/api/v1/sessions/${encodeURIComponent(sessionId)}/mcp/${encodeURIComponent(server.id)}/proxy` }
      : server)
  ];
}

export async function testConnection(id: string, sessionId?: string) {
  const server = definition(id, sessionId);
  const item = resolved(id, sessionId);
  const token = await authorization(server);
  const client = new Client({ name: 'smith-connection-check', version: '0.3.0' });
  const transport = server.transport === 'http'
    ? new StreamableHTTPClientTransport(new URL(server.url!), { requestInit: { headers: { ...item.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } } })
    : new StdioClientTransport({ command: item.command, args: item.args, env: { ...process.env, ...item.env } as Record<string, string>, stderr: 'pipe' });
  if (transport instanceof StdioClientTransport) transport.stderr?.on('data', () => {});
  try {
    await client.connect(transport, { timeout: 20000 });
    const result = await client.listTools({}, { timeout: 20000 });
    return { status: 'connected', tools: result.tools.map(tool => ({ name: tool.name, description: tool.description })) };
  } finally { await client.close().catch(() => {}); }
}

export const connectionsRouter = Router();
connectionsRouter.get('/mcp/oauth/config', (_req, res) => res.json({ redirectUrl: `${smithBaseUrl()}/api/v1/mcp/oauth/callback` }));
connectionsRouter.get('/customizations/mcp/:serverId/connection', (req, res) => {
  try { res.json(connectionStatus(req.params.serverId, typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
connectionsRouter.post('/customizations/mcp/:serverId/connect', async (req, res) => {
  try { res.json(await startOAuth(req.params.serverId, req.body?.sessionId)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
connectionsRouter.post('/customizations/mcp/:serverId/test', async (req, res) => {
  try { res.json(await testConnection(req.params.serverId, req.body?.sessionId)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
connectionsRouter.post('/customizations/mcp/:serverId/disconnect', (req, res) => {
  try { const server = definition(req.params.serverId, req.body?.sessionId); delete connections[keyFor(server)]; persist(); res.json({ status: 'disconnected' }); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
connectionsRouter.get('/mcp/oauth/callback', async (req, res) => {
  const state = String(req.query.state || '');
  const record = Object.values(connections).find(item => item.state === state && state && (item.stateExpiresAt || 0) > Date.now());
  if (!record) return res.status(400).send('Invalid or expired authorization state. Connect again in Smith.');
  record.state = undefined; record.stateExpiresAt = undefined; persist();
  if (req.query.error || typeof req.query.code !== 'string') return res.status(400).send('Authorization was not completed. Return to Smith to connect again.');
  try {
    const server = globalMCPs.get(record.serverId) || Array.from((await import('./session-store.ts')).sessionStore.list()).flatMap(session => Object.values(session.customizations.mcpServers)).find(server => server.id === record.serverId && server.url === record.url);
    if (!server || server.url !== record.url) throw new Error('Server configuration changed.');
    const provider = new Provider(server);
    const result = await auth(provider, { serverUrl: server.url!, authorizationCode: req.query.code, fetchFn: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30000) }) });
    if (result !== 'AUTHORIZED') throw new Error('Authorization did not complete.');
    record.verifier = undefined; record.authorizationUrl = undefined; persist();
    res.type('html').send('<!doctype html><html><meta charset="utf-8"><title>Smith connection complete</title><body><h1>Connected to Smith</h1><p>You can close this window and return to Skills and tools.</p></body></html>');
  } catch { res.status(400).send('Authorization could not be completed. Return to Smith and connect again.'); }
});

connectionsRouter.all('/sessions/:sessionId/mcp/:serverId/proxy', async (req, res) => {
  let upstream: Response | undefined;
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  try {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    const server = definition(req.params.serverId, session.id);
    if (server.transport !== 'http' || !serversInUse(session.customizations).some(item => item.server.id === server.id)) return res.status(400).json({ error: 'Enable the HTTP MCP server in this session first.' });
    const item = resolved(server.id, session.id);
    const send = async (force: boolean) => {
      const token = await authorization(server, force);
      const headers = new Headers(item.headers);
      for (const name of ['accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id']) {
        const value = req.get(name); if (value) headers.set(name, value);
      }
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const timer = setTimeout(() => abort.abort(), 30000);
      try { return await fetch(item.url!, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body), signal: abort.signal, redirect: 'error' }); }
      finally { clearTimeout(timer); }
    };
    upstream = await send(false);
    if (upstream.status === 401 && server.auth === 'oauth') { await upstream.body?.cancel(); upstream = await send(true); }
    res.status(upstream.status);
    for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version', 'cache-control', 'allow', 'retry-after']) {
      const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
    }
    if (upstream.body) Readable.fromWeb(upstream.body as any).on('error', () => res.end()).pipe(res);
    else res.end();
  } catch (err: any) { if (!res.headersSent) res.status(400).json({ error: err.message }); else res.end(); }
});
