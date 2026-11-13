// The REST surface, as shown at /api/docs. Management MCP is /mcp; peer-authenticated board MCP is /mcp/board.
export const openApiSpec = {
  "openapi": "3.0.3",
  "info": {
    "title": "Smith API",
    "version": "2.0.0",
    "description": "Smith: a leaderless team of coding agents working on a shared board."
  },
  "servers": [
    {
      "url": "/api/v1",
      "description": "Smith API v1"
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "summary": "Server liveness and agent CLI health",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/info": {
      "get": {
        "summary": "Version, platform and supported harnesses",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/agents/status": {
      "get": {
        "summary": "Health of each agent CLI; ?refresh=true re-probes",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/models": {
      "get": {
        "summary": "Models discovered per harness",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/models/refresh": {
      "post": {
        "summary": "Re-discover models",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/pricing": {
      "get": {
        "summary": "Per-model pricing used for cost estimates",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "put": {
        "summary": "Override pricing for a model",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/config": {
      "get": {
        "summary": "App configuration",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "put": {
        "summary": "Save app configuration",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/config/probe-binary": {
      "post": {
        "summary": "Check that a binary exists on disk or on PATH",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/pty/create": {
      "post": {
        "summary": "Start an in-app terminal",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/system/pty/{ptyId}": {
      "delete": {
        "summary": "Stop an in-app terminal",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "ptyId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/customizations": {
      "get": {
        "summary": "Catalog of skills, MCP servers and plugins",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/board/tools": {
      "get": {
        "summary": "The board tools peers can call",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/sessions": {
      "get": {
        "summary": "List sessions",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "post": {
        "summary": "Create a session with an isolated git worktree and a team of workers",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/sessions/batch-delete": {
      "post": {
        "summary": "Delete several sessions",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/sessions/{id}": {
      "get": {
        "summary": "One session",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      },
      "delete": {
        "summary": "Delete a session, its worktrees and its board",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/agents": {
      "put": {
        "summary": "Replace the session workers",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/chat": {
      "get": {
        "summary": "The session conversation",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/goal": {
      "post": {
        "summary": "Send user input: start a goal, answer the team, resume, or add a card",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/board": {
      "get": {
        "summary": "The board, its change log and agent turns",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/board/settings": {
      "put": {
        "summary": "Set review mode (fast, normal, thorough) and limits",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/board/pause": {
      "post": {
        "summary": "Pause the goal",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/board/resume": {
      "post": {
        "summary": "Resume a paused goal",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/board/cards/{cardId}": {
      "put": {
        "summary": "Change an open card as the user",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "cardId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/board/cards/{cardId}/answer": {
      "post": {
        "summary": "Answer a card that is waiting for the user",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "cardId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/customizations": {
      "get": {
        "summary": "Session skills and extra MCP servers",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      },
      "put": {
        "summary": "Update session skills and extra MCP servers",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/cost": {
      "get": {
        "summary": "Token usage and estimated cost for the session",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree": {
      "get": {
        "summary": "Session worktree status",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree/diff": {
      "get": {
        "summary": "Uncommitted diff of the session worktree",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree/summary": {
      "get": {
        "summary": "Per-file change summary against the base branch",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree/file": {
      "get": {
        "summary": "Serve a file from the session workspace (?path=, &download=1)",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree/artifacts": {
      "get": {
        "summary": "Files the team produced that can be previewed",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree/commit": {
      "post": {
        "summary": "Commit the session worktree",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree/merge": {
      "post": {
        "summary": "Merge the session branch into its base branch",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/sessions/{id}/worktree/discard": {
      "post": {
        "summary": "Discard uncommitted changes in the session worktree",
        "responses": {
          "200": {
            "description": "OK"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    }
  }
};


// Integration endpoints use the same services as Smith's management tools.
const integrationPaths: Record<string, unknown> = {
  '/system/folders': { get: { summary: 'Browse local folders', parameters: [{ name: 'path', in: 'query', schema: { type: 'string' } }, { name: 'hidden', in: 'query', schema: { type: 'boolean' } }], responses: { '200': { description: 'Path, parent, home and child folders' }, '400': { description: 'Invalid or inaccessible directory' } } } },
  '/system/branches': { get: { summary: 'List repository branches without changing the checkout', parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Current, default, local and remote branches' }, '400': { description: 'Not a repository root' } } } },
  '/customizations/mcp': { post: { summary: 'Register a stdio or Streamable HTTP MCP server', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' }, transport: { type: 'string', enum: ['stdio', 'http'] }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, env: { type: 'object', additionalProperties: { type: 'string' } }, url: { type: 'string' }, headers: { type: 'object', additionalProperties: { type: 'string' } }, auth: { type: 'string', enum: ['none', 'oauth'] }, oauth: { type: 'object', properties: { clientId: { type: 'string' }, clientSecret: { type: 'string' }, scope: { type: 'string' } } } } } } } }, responses: { '201': { description: 'Registered server with secrets masked' }, '400': { description: 'Invalid definition' }, '409': { description: 'Duplicate id' } } } },
  '/customizations/skills/install': { post: { summary: 'Import a complete skill package and optionally enable it in a session', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['source'], properties: { source: { type: 'string', description: 'Local directory/SKILL.md, Markdown URL or repository/subfolder URL' }, sessionId: { type: 'string' } } } } } }, responses: { '201': { description: 'Installed skill and local bundle path' }, '400': { description: 'Invalid or inaccessible skill package' } } } },
  '/assistant/messages': { post: { summary: 'Send a natural-language management request to Ask Smith', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' }, chatId: { type: 'string' }, sessionId: { type: 'string' }, harness: { type: 'string', enum: ['claude', 'codex', 'opencode'] }, model: { type: 'string' } } } } } }, responses: { '202': { description: 'Chat with running state; poll the chat endpoint' }, '400': { description: 'Invalid input or a request is already running' } } } },
  '/assistant/chats/{id}': { get: { summary: 'Read assistant conversation, actions, running state and errors', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Chat' }, '404': { description: 'Unknown chat' } } } },
  '/mcp/oauth/callback': { get: { summary: 'Single-use OAuth callback with state verification', parameters: [{ name: 'state', in: 'query', required: true, schema: { type: 'string' } }, { name: 'code', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Authorization completed' }, '400': { description: 'Invalid, expired, replayed or rejected authorization' } } } }
};
for (const action of ['connection', 'connect', 'test', 'disconnect']) {
  const method = action === 'connection' ? 'get' : 'post';
  integrationPaths[`/customizations/mcp/{serverId}/${action}`] = { [method]: {
    summary: `${action} a third-party MCP connection`,
    parameters: [{ name: 'serverId', in: 'path', required: true, schema: { type: 'string' } }, ...(method === 'get' ? [{ name: 'sessionId', in: 'query', schema: { type: 'string' } }] : [])],
    ...(method === 'post' ? { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { sessionId: { type: 'string' } } } } } } } : {}),
    responses: { '200': { description: action === 'connect' ? 'Connected or authorizationUrl to open in browser' : action === 'test' ? 'Connection result and available tools' : 'Connection status without credentials' }, '400': { description: 'Connection failed or authorization required' } }
  } };
}
Object.assign(openApiSpec.paths, integrationPaths);
