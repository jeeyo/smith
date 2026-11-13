// The REST surface, as shown at /api/docs. Agents reach the board through MCP at /mcp, not through these routes.
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
