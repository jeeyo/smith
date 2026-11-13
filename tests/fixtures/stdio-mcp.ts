import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const server = new Server({ name: 'stdio-fixture', version: '1' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'stdio_echo', inputSchema: { type: 'object' } }] }));
server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: process.env.SMITH_FIXTURE_MESSAGE || 'stdio works' }] }));
await server.connect(new StdioServerTransport());
