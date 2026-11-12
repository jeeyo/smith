import fs from 'node:fs';
import path from 'node:path';
import { DualLayerMemoryInfo } from '../shared/types.ts';

export class SessionMemoryService {
  private baseMemoryDir: string;

  constructor(customBaseDir?: string) {
    this.baseMemoryDir = customBaseDir || path.join(process.cwd(), '.smith', 'memory', 'sessions');
  }

  getSessionDir(sessionId: string): string {
    return path.join(this.baseMemoryDir, sessionId);
  }

  getTeamDir(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'team');
  }

  getAgentsDir(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'agents');
  }

  getTeamKnowledgePath(sessionId: string): string {
    return path.join(this.getTeamDir(sessionId), 'knowledge.md');
  }

  getAgentScratchpadPath(sessionId: string, agentId: string): string {
    return path.join(this.getAgentsDir(sessionId), agentId, 'scratchpad.md');
  }

  initSessionMemory(sessionId: string, agentIds: string[] = ['antigravity', 'claude', 'codex', 'opencode']): DualLayerMemoryInfo {
    const sessionDir = this.getSessionDir(sessionId);
    const teamDir = this.getTeamDir(sessionId);
    const agentsDir = this.getAgentsDir(sessionId);

    fs.mkdirSync(teamDir, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });

    // 1. Initialize Shared Team Knowledge Workspace
    const teamPath = this.getTeamKnowledgePath(sessionId);
    if (!fs.existsSync(teamPath)) {
      const initialTeamContent = [
        `# Shared Team Knowledge Base`,
        `**Session ID:** \`${sessionId}\``,
        `**Synchronized Workspace:** Shared state, architectural discoveries, and cross-agent agreements.`,
        ``,
        `## 1. Architectural Landmarks & Decisions`,
        `- Shared conventions and contracts established by cooperating agents.`,
        ``,
        `## 2. Reusable Modules & Verified Schemas`,
        `- Data types, shared routes, and validated protocol structures.`,
        ``,
        `## 3. Milestone Discoveries & Ground-Truth Facts`,
        `- Durable domain knowledge certified across agents.`
      ].join('\n');
      fs.writeFileSync(teamPath, initialTeamContent, 'utf-8');
    }

    // 2. Initialize Private Agent Scratchpads
    const agentScratchpadFiles: Record<string, string> = {};
    const agentScratchpads: Record<string, string> = {};

    for (const agentId of agentIds) {
      const agentFolder = path.join(agentsDir, agentId);
      fs.mkdirSync(agentFolder, { recursive: true });
      const scratchpadPath = path.join(agentFolder, 'scratchpad.md');
      agentScratchpadFiles[agentId] = scratchpadPath;

      if (!fs.existsSync(scratchpadPath)) {
        const initialPrivateContent = [
          `# Private Agent Scratchpad: @${agentId}`,
          `**Session:** \`${sessionId}\``,
          `**Private Task Stack:** Execution plans, local hypotheses, and turn notes.`,
          ``,
          `### Current Focus:`,
          `- Ready for assigned task execution.`,
          ``,
          `### Working State & In-Flight Subtasks:`,
          `- Initialized.`
        ].join('\n');
        fs.writeFileSync(scratchpadPath, initialPrivateContent, 'utf-8');
      }

      agentScratchpads[agentId] = fs.readFileSync(scratchpadPath, 'utf-8');
    }

    const teamKnowledgeContent = fs.readFileSync(teamPath, 'utf-8');

    return {
      sessionId,
      basePath: sessionDir,
      teamKnowledgeFile: teamPath,
      agentScratchpadFiles,
      teamKnowledgeContent,
      agentScratchpads
    };
  }

  readSharedKnowledge(sessionId: string): string {
    const p = this.getTeamKnowledgePath(sessionId);
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf-8');
  }

  writeSharedKnowledge(sessionId: string, content: string): void {
    const p = this.getTeamKnowledgePath(sessionId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf-8');
  }

  appendSharedKnowledge(sessionId: string, sectionTitle: string, content: string, agentId: string = 'system'): void {
    const p = this.getTeamKnowledgePath(sessionId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const timestamp = new Date().toISOString();
    const entry = `\n\n### ${sectionTitle} (@${agentId} · ${timestamp})\n${content.trim()}`;
    fs.appendFileSync(p, entry, 'utf-8');
  }

  readPrivateScratchpad(sessionId: string, agentId: string): string {
    const p = this.getAgentScratchpadPath(sessionId, agentId);
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf-8');
  }

  writePrivateScratchpad(sessionId: string, agentId: string, content: string): void {
    const p = this.getAgentScratchpadPath(sessionId, agentId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf-8');
  }

  appendPrivateScratchpad(sessionId: string, agentId: string, note: string): void {
    const p = this.getAgentScratchpadPath(sessionId, agentId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const timestamp = new Date().toLocaleTimeString();
    const entry = `\n- [${timestamp}] ${note.trim()}`;
    fs.appendFileSync(p, entry, 'utf-8');
  }

  /**
   * Compaction Survival Routine:
   * When day-long or multi-phase contexts threaten context limits, the harness
   * prompts agents to push durable discoveries into the shared team/knowledge.md
   * workspace before their private scratchpad or conversation history is compacted.
   */
  flushCompactionSurvival(
    sessionId: string,
    agentId: string,
    durableKnowledge?: string
  ): { flushed: boolean; bytesSaved: number; timestamp: number } {
    const scratchpad = this.readPrivateScratchpad(sessionId, agentId);
    const timestamp = Date.now();
    const iso = new Date(timestamp).toISOString();

    const textToPreserve = durableKnowledge || scratchpad;
    if (!textToPreserve || textToPreserve.length < 20) {
      return { flushed: false, bytesSaved: 0, timestamp };
    }

    // Append durable state to synchronized team workspace
    this.appendSharedKnowledge(
      sessionId,
      `Compaction Survival Snapshot: Durable Knowledge`,
      `The following durable discoveries were preserved prior to context compaction:\n\n${textToPreserve}`,
      agentId
    );

    // Compact private scratchpad to clean summary
    const compactedScratchpad = [
      `# Private Agent Scratchpad: @${agentId}`,
      `**Session:** \`${sessionId}\` (Compacted at ${iso})`,
      `*Prior durable knowledge successfully flushed to \`team/knowledge.md\`.*`,
      ``,
      `### Active Task Queue (Post-Compaction):`,
      `- Resuming execution with preserved shared memory.`
    ].join('\n');

    this.writePrivateScratchpad(sessionId, agentId, compactedScratchpad);

    return {
      flushed: true,
      bytesSaved: Math.max(0, scratchpad.length - compactedScratchpad.length),
      timestamp
    };
  }

  getSessionMemoryInfo(sessionId: string, agentIds: string[] = ['antigravity', 'claude', 'codex', 'opencode']): DualLayerMemoryInfo {
    this.initSessionMemory(sessionId, agentIds);
    const teamPath = this.getTeamKnowledgePath(sessionId);
    const agentScratchpadFiles: Record<string, string> = {};
    const agentScratchpads: Record<string, string> = {};

    for (const id of agentIds) {
      const p = this.getAgentScratchpadPath(sessionId, id);
      agentScratchpadFiles[id] = p;
      if (fs.existsSync(p)) {
        agentScratchpads[id] = fs.readFileSync(p, 'utf-8');
      }
    }

    return {
      sessionId,
      basePath: this.getSessionDir(sessionId),
      teamKnowledgeFile: teamPath,
      agentScratchpadFiles,
      teamKnowledgeContent: fs.existsSync(teamPath) ? fs.readFileSync(teamPath, 'utf-8') : '',
      agentScratchpads
    };
  }
}

export const sessionMemoryService = new SessionMemoryService();
