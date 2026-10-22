import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { observerAgentService } from '../src/server/observer-agent.ts';
import { teamBus } from '../src/server/team-bus.ts';

describe('The Observer Agent · Independent Verification & Safety Harness', () => {
  const sessionId = `test-obs-${Date.now()}`;
  const mockWorktreePath = path.join(process.cwd(), '.smith', 'test-worktree-obs');

  beforeEach(() => {
    fs.mkdirSync(mockWorktreePath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(mockWorktreePath)) {
      fs.rmSync(mockWorktreePath, { recursive: true, force: true });
    }
  });

  it('certifies subtasks and ground-truth milestones when code is clean and verified', async () => {
    // Create valid files
    const srcDir = path.join(mockWorktreePath, 'src', 'auth');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'token.ts'), 'export function generateToken() { return "valid"; }', 'utf-8');

    const audit = await observerAgentService.auditSubtaskCompletion({
      sessionId,
      phaseOrTaskId: 'task-1',
      targetAgent: 'antigravity',
      claimedGoal: 'Implement Ed25519 Token Generator & Security Guards',
      claimedFileScope: ['src/auth/*'],
      worktreePath: mockWorktreePath
    });

    expect(audit.verdict).toBe('verified');
    expect(audit.confidence).toBeGreaterThanOrEqual(0.9);
    expect(audit.groundTruthCheck.missingFiles.length).toBe(0);
    expect(audit.milestonesVerified.some(m => m.includes('Milestone Verified'))).toBe(true);

    // Verified audit is broadcasted to team bus
    const busMessages = teamBus.getMessages(sessionId);
    expect(busMessages.some(m => m.sender === 'observer' && m.content.includes('VERIFIED'))).toBe(true);
  });

  it('detects hallucinated achievements when claimed files do not exist on disk', async () => {
    const audit = await observerAgentService.auditSubtaskCompletion({
      sessionId,
      phaseOrTaskId: 'task-ghost',
      targetAgent: 'codex',
      claimedGoal: 'Implement Database Migration & Table Indices',
      claimedFileScope: ['migrations/001_initial_schema.sql'],
      worktreePath: mockWorktreePath
    });

    expect(audit.verdict).toBe('hallucination_detected');
    expect(audit.groundTruthCheck.missingFiles).toContain('migrations/001_initial_schema.sql');
    expect(audit.findings[0]).toContain('HALLUCINATION DETECTED');
  });

  it('detects specification gaming such as empty test blocks and validation bypasses', async () => {
    const testDir = path.join(mockWorktreePath, 'tests');
    fs.mkdirSync(testDir, { recursive: true });

    // Specification gaming: empty test block bypassing assertion check
    fs.writeFileSync(
      path.join(testDir, 'auth.test.ts'),
      'test("should reject expired token", () => {});',
      'utf-8'
    );

    // Specification gaming: hardcoded truth stub
    const codeDir = path.join(mockWorktreePath, 'src');
    fs.mkdirSync(codeDir, { recursive: true });
    fs.writeFileSync(
      path.join(codeDir, 'guard.ts'),
      'function verifyAuth() { return true; }',
      'utf-8'
    );

    const audit = await observerAgentService.auditSubtaskCompletion({
      sessionId,
      phaseOrTaskId: 'task-gaming',
      targetAgent: 'claude',
      claimedGoal: 'Implement Auth Guard and Expiration Tests',
      claimedFileScope: ['tests/*', 'src/*'],
      worktreePath: mockWorktreePath
    });

    expect(audit.verdict).toBe('spec_gaming_detected');
    expect(audit.groundTruthCheck.specGamingSigns.length).toBeGreaterThanOrEqual(2);
    expect(audit.findings[0]).toContain('SPECIFICATION GAMING DETECTED');
  });
});
