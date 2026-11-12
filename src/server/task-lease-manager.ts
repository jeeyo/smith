import { EventEmitter } from 'node:events';
import { AgentId, Task, TaskStatus } from '../shared/types.ts';
import { hindsightService } from './hindsight-service.ts';

export interface FileLock {
  taskId: string;
  agentId: AgentId;
  patterns: string[];
  acquiredAt: number;
}

export class TaskConflictError extends Error {
  constructor(public conflictingAgent: AgentId, public conflictingFile: string, message: string) {
    super(message);
    this.name = 'TaskConflictError';
  }
}

export class TaskLeaseManager extends EventEmitter {
  // sessionId -> taskId -> Task
  private sessionTasks: Map<string, Map<string, Task>> = new Map();
  // sessionId -> FileLock[]
  private sessionLocks: Map<string, FileLock[]> = new Map();

  constructor() {
    super();
  }

  getTasks(sessionId: string): Task[] {
    const taskMap = this.sessionTasks.get(sessionId);
    if (!taskMap) return [];
    return Array.from(taskMap.values());
  }

  getTask(sessionId: string, taskId: string): Task | undefined {
    return this.sessionTasks.get(sessionId)?.get(taskId);
  }

  createTask(sessionId: string, taskInput: {
    title: string;
    description: string;
    fileScope?: string[];
    dependencies?: string[];
    suggestedAgent?: AgentId;
    delegatedBy?: AgentId;
  }): Task {
    if (!this.sessionTasks.has(sessionId)) {
      this.sessionTasks.set(sessionId, new Map());
    }
    const taskMap = this.sessionTasks.get(sessionId)!;
    const taskId = `task-${taskMap.size + 1}-${Math.random().toString(36).substring(2, 6)}`;

    const task: Task = {
      id: taskId,
      title: taskInput.title,
      description: taskInput.description,
      status: (taskInput.dependencies && taskInput.dependencies.length > 0) ? 'blocked' : 'unassigned',
      assignedAgent: taskInput.suggestedAgent,
      fileScope: taskInput.fileScope || ['*'],
      dependencies: taskInput.dependencies || [],
      delegatedBy: taskInput.delegatedBy,
      costUsd: 0,
      createdAt: Date.now()
    };

    taskMap.set(taskId, task);
    this.emit('task:created', { sessionId, task });
    return task;
  }

  claimTask(sessionId: string, taskId: string, agentId: AgentId, requestedFileScope?: string[]): Task {
    const taskMap = this.sessionTasks.get(sessionId);
    if (!taskMap || !taskMap.has(taskId)) {
      throw new Error(`Task ${taskId} not found in session ${sessionId}`);
    }

    const task = taskMap.get(taskId)!;

    if (task.status === 'completed') {
      throw new Error(`Task ${taskId} is already completed`);
    }

    if (task.status === 'in_progress' && task.assignedAgent && task.assignedAgent !== agentId) {
      throw new TaskConflictError(task.assignedAgent, task.fileScope[0] || '', `Task ${taskId} is currently claimed by agent ${task.assignedAgent}`);
    }

    // Check unresolved dependencies
    for (const depId of task.dependencies) {
      const depTask = taskMap.get(depId);
      if (depTask && depTask.status !== 'completed') {
        throw new Error(`Task ${taskId} is blocked by incomplete dependency ${depId} (${depTask.title})`);
      }
    }

    const effectiveFileScope = requestedFileScope && requestedFileScope.length > 0
      ? requestedFileScope
      : task.fileScope;

    // Check file scope locks held by other agents
    const locks = this.sessionLocks.get(sessionId) || [];
    for (const lock of locks) {
      if (lock.agentId !== agentId) {
        for (const reqPattern of effectiveFileScope) {
          for (const lockPattern of lock.patterns) {
            if (this.patternsOverlap(reqPattern, lockPattern)) {
              throw new TaskConflictError(
                lock.agentId,
                reqPattern,
                `Cannot claim task ${taskId}: file scope '${reqPattern}' is currently locked by agent ${lock.agentId} on task ${lock.taskId}`
              );
            }
          }
        }
      }
    }

    // Grant lease
    task.status = 'in_progress';
    task.assignedAgent = agentId;
    task.fileScope = effectiveFileScope;

    // Register active lock
    if (!this.sessionLocks.has(sessionId)) {
      this.sessionLocks.set(sessionId, []);
    }
    this.sessionLocks.get(sessionId)!.push({
      taskId,
      agentId,
      patterns: effectiveFileScope,
      acquiredAt: Date.now()
    });

    this.emit('task:claimed', { sessionId, task, agentId });
    return task;
  }

  releaseTask(sessionId: string, taskId: string, agentId: AgentId): Task {
    const task = this.getTask(sessionId, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = 'unassigned';
    task.assignedAgent = undefined;

    // Remove lock
    const locks = this.sessionLocks.get(sessionId) || [];
    this.sessionLocks.set(sessionId, locks.filter(l => l.taskId !== taskId));

    this.emit('task:released', { sessionId, task, agentId });
    return task;
  }

  async completeTask(sessionId: string, taskId: string, agentId: AgentId, notes?: string, bankId?: string): Promise<Task> {
    const task = this.getTask(sessionId, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = 'completed';
    task.assignedAgent = agentId;
    task.completedAt = Date.now();
    task.notes = notes;

    // Release lock
    const locks = this.sessionLocks.get(sessionId) || [];
    this.sessionLocks.set(sessionId, locks.filter(l => l.taskId !== taskId));

    // Unlock dependent tasks
    const taskMap = this.sessionTasks.get(sessionId)!;
    for (const otherTask of taskMap.values()) {
      if (otherTask.status === 'blocked' && otherTask.dependencies.includes(taskId)) {
        const allDepsDone = otherTask.dependencies.every(d => taskMap.get(d)?.status === 'completed');
        if (allDepsDone) {
          otherTask.status = 'unassigned';
          this.emit('task:unblocked', { sessionId, task: otherTask });
        }
      }
    }

    // Retain progress into Hindsight
    if (bankId) {
      await hindsightService.retain(bankId, `[Task Completed] ${task.title} by ${agentId}. Notes: ${notes || 'none'}`, {
        category: 'decision',
        agentId
      });
    }

    this.emit('task:completed', { sessionId, task, agentId });
    return task;
  }

  getActiveLocks(sessionId: string): FileLock[] {
    return this.sessionLocks.get(sessionId) || [];
  }

  private patternsOverlap(p1: string, p2: string): boolean {
    if (p1 === '*' || p2 === '*') return true;
    if (p1 === p2) return true;
    const clean1 = p1.replace(/\\/g, '/').replace(/\/\*.*$/, '').toLowerCase();
    const clean2 = p2.replace(/\\/g, '/').replace(/\/\*.*$/, '').toLowerCase();
    return clean1.startsWith(clean2) || clean2.startsWith(clean1);
  }
}

export const taskLeaseManager = new TaskLeaseManager();
