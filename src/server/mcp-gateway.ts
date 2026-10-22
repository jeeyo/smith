import { EventEmitter } from 'node:events';
import { CustomMCPServer, SessionCustomizations } from '../shared/types.ts';
import { taskLeaseManager } from './task-lease-manager.ts';
import { teamBus } from './team-bus.ts';
import { hindsightService } from './hindsight-service.ts';
import { sessionMemoryService } from './session-memory.ts';
import { broadcastLayerService } from './broadcast-layer.ts';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export class MCPGateway extends EventEmitter {
  // sessionId -> SessionCustomizations
  private sessionConfigs: Map<string, SessionCustomizations> = new Map();

  constructor() {
    super();
  }

  setSessionCustomizations(sessionId: string, customizations: SessionCustomizations) {
    this.sessionConfigs.set(sessionId, customizations);
    this.emit('tools:updated', { sessionId });
  }

  getToolsForSession(sessionId: string): MCPToolDefinition[] {
    const tools: MCPToolDefinition[] = [
      // Cooperative Non-Racing Coordination Tools
      {
        name: 'claim_task',
        description: 'Atomically claim a task from the shared DAG and acquire exclusive lock on fileScope (prevents racing other agents)',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID of the task to claim' },
            fileScope: { type: 'array', items: { type: 'string' }, description: 'Specific files or globs to lock exclusively' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'release_task',
        description: 'Release a claimed task back to the unassigned queue and release file locks',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID of the task to release' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'complete_task',
        description: 'Mark a claimed task as completed, releasing file locks and notifying teammates and Hindsight',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID of the completed task' },
            notes: { type: 'string', description: 'Summary of what was achieved and modified' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'delegate_subtask',
        description: 'Decompose your current work into a new subtask in the shared DAG for other agents to claim',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title of the subtask' },
            description: { type: 'string', description: 'Detailed instructions and expectations' },
            fileScope: { type: 'array', items: { type: 'string' }, description: 'Target file boundaries' },
            suggestedAgent: { type: 'string', description: 'Suggested agent (e.g. claude, codex, gemini)' },
            dependencies: { type: 'array', items: { type: 'string' }, description: 'Parent task IDs' }
          },
          required: ['title', 'description']
        }
      },
      {
        name: 'broadcast_team_message',
        description: 'Broadcast an intent, status update, hazard alert, or handoff request to teammates on the live chat bus',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['intent', 'request', 'hazard', 'anti_pattern', 'info', 'handoff'] },
            content: { type: 'string', description: 'Message content' },
            metadata: { type: 'object', description: 'Optional extra details (e.g. antiPattern error/solution)' }
          },
          required: ['type', 'content']
        }
      },
      {
        name: 'list_tasks',
        description: 'Query the live DAG of all tasks, their assignees, and active file scope locks',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // Peer Negotiation & Broadcast Chat Tools
      {
        name: 'broadcast_proposal',
        description: 'Propose dynamic task allocation or role handoff to teammates on the broadcast chat layer',
        inputSchema: {
          type: 'object',
          properties: {
            targetTaskOrScope: { type: 'string', description: 'Proposed task or file scope' },
            description: { type: 'string', description: 'Rationale or proposal details' }
          },
          required: ['targetTaskOrScope', 'description']
        }
      },
      {
        name: 'vote_consensus',
        description: 'Vote to agree or disagree on an active peer proposal to form team consensus',
        inputSchema: {
          type: 'object',
          properties: {
            proposalId: { type: 'string', description: 'ID of the proposal to vote on' },
            agree: { type: 'boolean', description: 'True to agree, false to reject' }
          },
          required: ['proposalId', 'agree']
        }
      },
      {
        name: 'broadcast_emergency_alert',
        description: 'Broadcast an emergency coordinate alert (build failure, test crash, or rate limit) with timeout for salvage',
        inputSchema: {
          type: 'object',
          properties: {
            errorType: { type: 'string', enum: ['build_failure', 'test_crash', 'rate_limit', 'lock_contention'] },
            fileLocation: { type: 'string', description: 'File path where error occurred' },
            line: { type: 'number', description: 'Line number' },
            details: { type: 'string', description: 'Error trace details' },
            despawnOrTimeoutMs: { type: 'number', description: 'Salvage countdown in milliseconds' }
          },
          required: ['errorType', 'details']
        }
      },
      {
        name: 'broadcast_error_retraction',
        description: 'Retract an invalid assumption, false hypothesis, or erroneous mock to prevent teammates from repeating it',
        inputSchema: {
          type: 'object',
          properties: {
            invalidAssumption: { type: 'string', description: 'The invalid assumption or hypothesis' },
            correctedFact: { type: 'string', description: 'The ground-truth correction' }
          },
          required: ['invalidAssumption', 'correctedFact']
        }
      },
      {
        name: 'get_injected_broadcast_context',
        description: 'Retrieve all unread broadcast chat messages from teammates formatted for prompt injection',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // Per-Session Dual-Layer Memory Tools
      {
        name: 'read_shared_knowledge',
        description: 'Read the shared team workspace (.smith/memory/sessions/{sessionId}/team/knowledge.md) synchronized across all agents',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'append_shared_knowledge',
        description: 'Append architectural discoveries, shared schemas, or decisions to team/knowledge.md',
        inputSchema: {
          type: 'object',
          properties: {
            sectionTitle: { type: 'string', description: 'Title of the section' },
            content: { type: 'string', description: 'Durable knowledge markdown text' }
          },
          required: ['sectionTitle', 'content']
        }
      },
      {
        name: 'read_private_scratchpad',
        description: 'Read your private scratchpad (.smith/memory/sessions/{sessionId}/agents/{agentId}/scratchpad.md)',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'append_private_scratchpad',
        description: 'Append an entry to your private scratchpad for task tracking and notes',
        inputSchema: {
          type: 'object',
          properties: {
            note: { type: 'string', description: 'Scratchpad entry' }
          },
          required: ['note']
        }
      },
      {
        name: 'flush_compaction_survival',
        description: 'Push durable discoveries into shared team/knowledge.md before context window compaction',
        inputSchema: {
          type: 'object',
          properties: {
            durableKnowledge: { type: 'string', description: 'Important facts to preserve in team knowledge' }
          }
        }
      },

      // Hindsight Memory Tools (Global across sessions)
      {
        name: 'retain_fact',
        description: 'Ingest an architectural rule, decision, or finding into the persistent Hindsight memory bank',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The fact or decision to retain' },
            category: { type: 'string', enum: ['architecture', 'decision', 'environment', 'general'] }
          },
          required: ['text']
        }
      },
      {
        name: 'recall_memory',
        description: 'Query relevant facts, decisions, and anti-pattern warnings from the Hindsight memory bank',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Semantic search query or question' }
          },
          required: ['query']
        }
      },
      {
        name: 'reflect_playbook',
        description: 'Request Hindsight to synthesize the overall project state and current goal progress',
        inputSchema: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: 'Overarching objective to reflect on' }
          },
          required: ['goal']
        }
      },
      {
        name: 'retain_anti_pattern',
        description: 'Record an error, failed approach, or bug into Hindsight so peer agents never repeat it (Shared Anti-Pattern)',
        inputSchema: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message or symptom' },
            context: { type: 'string', description: 'What you were doing when the error occurred' },
            solution: { type: 'string', description: 'The fix or how to avoid it' }
          },
          required: ['error', 'solution']
        }
      }
    ];

    // Add active custom MCP server tools if configured
    const customizations = this.sessionConfigs.get(sessionId);
    if (customizations?.mcpServers) {
      for (const [serverId, server] of Object.entries(customizations.mcpServers)) {
        if (server.enabled) {
          tools.push({
            name: `mcp_${serverId}_execute`,
            description: `Tool provided by custom MCP server: ${server.name} (${server.description || 'custom'})`,
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                params: { type: 'object' }
              }
            }
          });
        }
      }
    }

    return tools;
  }

  async executeTool(sessionId: string, agentId: string, toolName: string, args: any, bankId?: string): Promise<any> {
    switch (toolName) {
      case 'claim_task':
        return taskLeaseManager.claimTask(sessionId, args.taskId, agentId, args.fileScope);
      case 'release_task':
        return taskLeaseManager.releaseTask(sessionId, args.taskId, agentId);
      case 'complete_task':
        return await taskLeaseManager.completeTask(sessionId, args.taskId, agentId, args.notes, bankId);
      case 'delegate_subtask':
        return taskLeaseManager.createTask(sessionId, {
          title: args.title,
          description: args.description,
          fileScope: args.fileScope,
          suggestedAgent: args.suggestedAgent,
          dependencies: args.dependencies,
          delegatedBy: agentId
        });
      case 'broadcast_team_message':
        return await teamBus.broadcast(sessionId, {
          sender: agentId,
          type: args.type,
          content: args.content,
          metadata: args.metadata
        }, bankId);
      case 'broadcast_proposal':
        return await broadcastLayerService.broadcastProposal(sessionId, agentId, args.targetTaskOrScope, args.description);
      case 'vote_consensus':
        return await broadcastLayerService.voteConsensus(sessionId, agentId, args.proposalId, args.agree);
      case 'broadcast_emergency_alert':
        return await broadcastLayerService.broadcastEmergencyAlert(sessionId, {
          sender: agentId,
          errorType: args.errorType,
          fileLocation: args.fileLocation,
          line: args.line,
          details: args.details,
          despawnOrTimeoutMs: args.despawnOrTimeoutMs
        });
      case 'broadcast_error_retraction':
        return await broadcastLayerService.broadcastErrorRetraction(sessionId, agentId, args.invalidAssumption, args.correctedFact);
      case 'get_injected_broadcast_context':
        return {
          context: broadcastLayerService.getInjectedContextForAgent(sessionId, agentId)
        };
      case 'read_shared_knowledge':
        return {
          content: sessionMemoryService.readSharedKnowledge(sessionId)
        };
      case 'append_shared_knowledge':
        sessionMemoryService.appendSharedKnowledge(sessionId, args.sectionTitle, args.content, agentId);
        return { status: 'appended', sectionTitle: args.sectionTitle };
      case 'read_private_scratchpad':
        return {
          content: sessionMemoryService.readPrivateScratchpad(sessionId, agentId)
        };
      case 'append_private_scratchpad':
        sessionMemoryService.appendPrivateScratchpad(sessionId, agentId, args.note);
        return { status: 'appended', agentId };
      case 'flush_compaction_survival':
        return sessionMemoryService.flushCompactionSurvival(sessionId, agentId, args.durableKnowledge);
      case 'list_tasks':
        return {
          tasks: taskLeaseManager.getTasks(sessionId),
          locks: taskLeaseManager.getActiveLocks(sessionId)
        };
      case 'retain_fact':
        if (!bankId) throw new Error('Bank ID required for retain');
        await hindsightService.retain(bankId, args.text, { category: args.category, agentId });
        return { status: 'retained', text: args.text };
      case 'recall_memory':
        if (!bankId) throw new Error('Bank ID required for recall');
        return await hindsightService.recall(bankId, args.query);
      case 'reflect_playbook':
        if (!bankId) throw new Error('Bank ID required for reflect');
        return { reflection: await hindsightService.reflect(bankId, args.goal) };
      case 'retain_anti_pattern':
        if (!bankId) throw new Error('Bank ID required for retain_anti_pattern');
        return await hindsightService.retainAntiPattern(bankId, {
          error: args.error,
          context: args.context || 'Agent action',
          solution: args.solution,
          agentId
        });
      default:
        // Mock execution for custom MCP servers
        return {
          result: `Executed custom tool ${toolName} with arguments ${JSON.stringify(args)}`
        };
    }
  }
}

export const mcpGateway = new MCPGateway();
