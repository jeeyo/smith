import { describe, it, expect, beforeEach } from 'vitest';
import { TaskLeaseManager, TaskConflictError } from '../src/server/task-lease-manager.ts';

describe('TaskLeaseManager (arXiv:2610.22319 Non-Racing Delegation)', () => {
  let leaseManager: TaskLeaseManager;

  beforeEach(() => {
    leaseManager = new TaskLeaseManager();
  });

  it('allows an agent to claim a task with file scope', () => {
    const task = leaseManager.createTask('sess-test', {
      title: 'Scaffold Auth Routes',
      description: 'Implement JWT routes in src/routes/auth.ts',
      fileScope: ['src/routes/auth.ts']
    });

    const claimed = leaseManager.claimTask('sess-test', task.id, 'claude');

    expect(claimed.status).toBe('in_progress');
    expect(claimed.assignedAgent).toBe('claude');
    expect(leaseManager.getActiveLocks('sess-test').length).toBe(1);
  });

  it('rejects another agent attempting to claim overlapping file scope (Zero Racing)', () => {
    const task1 = leaseManager.createTask('sess-test', {
      title: 'Auth Refactor',
      description: 'Refactoring auth',
      fileScope: ['src/auth/*']
    });

    const task2 = leaseManager.createTask('sess-test', {
      title: 'Audit Auth',
      description: 'Audit auth files',
      fileScope: ['src/auth/jwt.ts']
    });

    // Agent A claims task1
    leaseManager.claimTask('sess-test', task1.id, 'claude');

    // Agent B attempts to claim task2 which touches overlapping files
    expect(() => {
      leaseManager.claimTask('sess-test', task2.id, 'gemini');
    }).toThrow(TaskConflictError);
  });

  it('unblocks dependent tasks upon completion', async () => {
    const parentTask = leaseManager.createTask('sess-test', {
      title: 'Step 1: DB Schema',
      description: 'Define schema.prisma',
      fileScope: ['prisma/schema.prisma']
    });

    const childTask = leaseManager.createTask('sess-test', {
      title: 'Step 2: Seed Data',
      description: 'Seed users into database',
      fileScope: ['prisma/seed.ts'],
      dependencies: [parentTask.id]
    });

    expect(childTask.status).toBe('blocked');

    // Attempting to claim child before parent completes should fail
    expect(() => {
      leaseManager.claimTask('sess-test', childTask.id, 'codex');
    }).toThrow(/blocked by incomplete dependency/);

    // Complete parent task
    leaseManager.claimTask('sess-test', parentTask.id, 'claude');
    await leaseManager.completeTask('sess-test', parentTask.id, 'claude', 'Finished schema');

    // Child should now be unblocked
    const updatedChild = leaseManager.getTask('sess-test', childTask.id);
    expect(updatedChild?.status).toBe('unassigned');

    // Now Codex can claim it
    const claimedChild = leaseManager.claimTask('sess-test', childTask.id, 'codex');
    expect(claimedChild.status).toBe('in_progress');
  });
});
