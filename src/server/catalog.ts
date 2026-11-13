import { CustomMCPServer, Skill, Plugin } from '../shared/types.ts';

// Global catalogs
export const globalSkills: Map<string, Skill> = new Map([
  ['code-review', {
    id: 'code-review',
    name: 'Code Review & Linting',
    description: 'Enforces clean code principles, test coverage, and security checks',
    instructions: 'Always review newly generated code for edge cases, null checks, and error handling.',
    enabled: true
  }],
  ['database-migrations', {
    id: 'database-migrations',
    name: 'Database Migrations',
    description: 'Handles schema migrations, indices, and data safety',
    instructions: 'Generate migration scripts with down/rollback handlers.',
    enabled: true
  }],
  ['api-design', {
    id: 'api-design',
    name: 'REST & GraphQL API Design',
    description: 'Standardizes HTTP status codes, error schemas, and pagination',
    instructions: 'Use RFC 7807 Problem Details for all HTTP errors.',
    enabled: true
  }]
]);

export const globalMCPs: Map<string, CustomMCPServer> = new Map([
  ['postgres', {
    id: 'postgres',
    name: 'PostgreSQL Database MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    enabled: false,
    description: 'Read schemas and run read-only queries against local Postgres'
  }],
  ['github', {
    id: 'github',
    name: 'GitHub Repository MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    enabled: false,
    description: 'Inspect PRs, issues, and commit histories'
  }],
  ['filesystem', {
    id: 'filesystem',
    name: 'Filesystem MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    enabled: true,
    description: 'Safe sandboxed filesystem access'
  }]
]);

export const globalPlugins: Map<string, Plugin> = new Map([
  ['fullstack-pack', {
    id: 'fullstack-pack',
    name: 'Full-Stack Web Pack',
    description: 'Combines Code Review, API Design, and Database tools',
    skills: ['code-review', 'api-design', 'database-migrations'],
    mcpServers: ['postgres', 'filesystem'],
    enabled: true
  }]
]);

