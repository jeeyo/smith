export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Smith API',
    version: '1.0.0',
    description: 'Smith API'
  },
  servers: [
    { url: '/api/v1', description: 'Smith Orchestrator API v1' }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check, Hindsight state, and agent authentication diagnostics',
        responses: { 200: { description: 'Health report' } }
      }
    },
    '/system/agents/status': {
      get: {
        summary: 'Live health, binary path, auth, and rate-limit diagnostics for all local agents',
        responses: { 200: { description: 'Agent health and auth statuses' } }
      }
    },
    '/system/models': {
      get: {
        summary: 'List dynamically discovered models per agent',
        responses: { 200: { description: 'Discovered models' } }
      }
    },
    '/system/models/refresh': {
      post: {
        summary: 'Force live re-probing of local agent CLIs',
        responses: { 200: { description: 'Refreshed models' } }
      }
    },
    '/sessions': {
      get: {
        summary: 'List active sessions with running costs in USD',
        responses: { 200: { description: 'Active sessions' } }
      },
      post: {
        summary: 'Create a new collaborative multi-agent session',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { 201: { description: 'Session created' } }
      }
    },
    '/sessions/{id}': {
      get: {
        summary: 'Get session details, tasks, and file locks',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Session details' } }
      },
      delete: {
        summary: 'Terminate session and cleanup worktrees',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Session deleted' } }
      }
    },
    '/sessions/{id}/cost': {
      get: {
        summary: 'Get real-time hierarchical USD cost breakdown',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'USD cost report' } }
      }
    },
    '/sessions/{id}/agents/{agentId}': {
      patch: {
        summary: 'Hot-reload agent model mid-session',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { model: { type: 'string' } } } } }
        },
        responses: { 200: { description: 'Model hot-reloaded' } }
      }
    },
    '/sessions/{id}/tasks': {
      get: {
        summary: 'Get live task DAG and active file locks (non-racing cooperative protocol)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task DAG' } }
      },
      post: {
        summary: 'Delegate a new subtask into the DAG',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Subtask added' } }
      }
    },
    '/sessions/{id}/tasks/{taskId}/claim': {
      post: {
        summary: 'Atomically claim task and acquire exclusive file-scope locks',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Lease granted' },
          409: { description: 'Conflict: file scope locked by another agent' }
        }
      }
    },
    '/sessions/{id}/messages': {
      get: {
        summary: 'Chronological team chat history',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Team messages' } }
      },
      post: {
        summary: 'Broadcast message, intent, or anti-pattern to team bus',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Message broadcasted' } }
      }
    },
    '/sessions/{id}/customizations': {
      get: {
        summary: 'Get active session plugins, skills, and MCP servers',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Customizations' } }
      },
      put: {
        summary: 'Hot-update session customizations mid-session without agent restart',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Customizations updated' } }
      }
    },
    '/sessions/{id}/memory': {
      get: {
        summary: 'Query Hindsight world facts, experiences, and anti-patterns',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Hindsight memory state' } }
      }
    },
    '/sessions/{id}/chat': {
      get: {
        summary: 'Get chronological unified chat timeline for single-interface goal mode',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Chat message history' } }
      }
    },
    '/sessions/{id}/goal': {
      post: {
        summary: 'Declare macro-goal: triggers non-racing cooperative decomposition and parallel execution',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] } } }
        },
        responses: { 200: { description: 'Goal executed and orchestrated across agents' } }
      }
    },
    '/sessions/{id}/memory/dual-layer': {
      get: {
        summary: 'Get per-session dual-layer memory (.smith/memory/sessions/{sessionId}) including team knowledge and private scratchpads',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Dual-layer memory configuration and synchronized team workspace content' } }
      }
    },
    '/sessions/{id}/memory/compaction-flush': {
      post: {
        summary: 'Execute Compaction Survival Routine: flush durable discoveries into shared team workspace before context truncation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { agentId: { type: 'string' }, durableKnowledge: { type: 'string' } } } } }
        },
        responses: { 200: { description: 'Compaction survival flush status and bytes compacted' } }
      }
    },
    '/sessions/{id}/observer/audits': {
      get: {
        summary: 'Query The Observer Agent independent telemetry audits, milestone certifications, and anti-gaming checks',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Observer audit history' } }
      }
    },
    '/sessions/{id}/broadcast/peer-state': {
      get: {
        summary: 'Query live in-IDE broadcast chat layer state: active proposals, consensus votes, and emergency coordinate alerts',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Broadcast peer negotiation state' } }
      }
    }
  }
};
