import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/** Real OAuth discovery, registration, PKCE, token refresh and protected MCP fixture. */
export async function oauthMcpFixture() {
  const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: false }));
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  let accessToken = '', refreshes = 0, authorizations = 0;
  const codes = new Map<string, { challenge: string; redirect: string }>();
  app.get('/.well-known/oauth-protected-resource', (_req, res) => res.json({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['tools'] }));
  app.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({ issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['tools'] }));
  app.post('/register', (req, res) => res.status(201).json({ ...req.body, client_id: 'smith-fixture', client_id_issued_at: Math.floor(Date.now() / 1000) }));
  app.get('/authorize', (req, res) => {
    if (req.query.approve !== 'yes') {
      const target = new URL(`${base}${req.originalUrl}`); target.searchParams.set('approve', 'yes');
      return res.type('html').send(`<h1>Smith test MCP</h1><p>Allow Smith to use the fixture echo tool?</p><a href="${target.href.replace(/&/g, '&amp;')}">Authorize Smith</a>`);
    }
    if (req.query.code_challenge_method !== 'S256' || !req.query.state || !req.query.code_challenge || !req.query.redirect_uri) return res.status(400).end();
    const code = crypto.randomUUID(); authorizations++;
    codes.set(code, { challenge: String(req.query.code_challenge), redirect: String(req.query.redirect_uri) });
    const redirect = new URL(String(req.query.redirect_uri)); redirect.searchParams.set('code', code); redirect.searchParams.set('state', String(req.query.state));
    res.redirect(redirect.href);
  });
  app.post('/token', (req, res) => {
    if (req.body.grant_type === 'authorization_code') {
      const code = codes.get(req.body.code); codes.delete(req.body.code);
      const challenge = crypto.createHash('sha256').update(String(req.body.code_verifier || '')).digest('base64url');
      if (!code || code.challenge !== challenge || code.redirect !== req.body.redirect_uri || req.body.resource !== `${base}/mcp`) return res.status(400).json({ error: 'invalid_grant' });
    } else if (req.body.grant_type === 'refresh_token' && req.body.refresh_token === 'fixture-refresh') refreshes++;
    else return res.status(400).json({ error: 'invalid_grant' });
    accessToken = crypto.randomUUID();
    res.json({ access_token: accessToken, refresh_token: 'fixture-refresh', token_type: 'Bearer', expires_in: 1, scope: 'tools' });
  });
  app.use('/mcp', (req, res, next) => {
    if (!accessToken || req.get('Authorization') !== `Bearer ${accessToken}`) return res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`).end();
    next();
  });
  app.post('/mcp', async (req, res) => {
    const mcp = new Server({ name: 'fixture', version: '1.0.0' }, { capabilities: { tools: {} } });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'echo', description: 'Echo input from the OAuth fixture.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }));
    mcp.setRequestHandler(CallToolRequestSchema, async request => ({ content: [{ type: 'text', text: String(request.params.arguments?.text) }] }));
    res.on('close', () => { void mcp.close(); }); await mcp.connect(transport); await transport.handleRequest(req, res, req.body);
  });
  app.all('/mcp', (_req, res) => res.status(405).end());
  app.get('/SKILL.md', (_req, res) => res.type('text').send('---\nname: remote-fixture\ndescription: Test a URL skill\n---\nUse the echo tool for examples.'));
  return { base, server, stats: () => ({ refreshes, authorizations }), close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
