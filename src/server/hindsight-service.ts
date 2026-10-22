import fs from 'node:fs';
import path from 'node:path';
import type { HindsightServer as HindsightServerType } from '@vectorize-io/hindsight-all';
import { HindsightClient } from '@vectorize-io/hindsight-client';
import { config } from './config.ts';
import { HindsightFact, HindsightExperience, HindsightAntiPattern } from '../shared/types.ts';

// Dynamic loader for pure ESM @vectorize-io/hindsight-all
let HindsightServerClass: typeof HindsightServerType | null = null;
async function getHindsightServerClass(): Promise<typeof HindsightServerType | null> {
  if (!HindsightServerClass) {
    try {
      const mod = await import('@vectorize-io/hindsight-all') as any;
      HindsightServerClass = mod.HindsightServer || mod.default?.HindsightServer || mod.default;
    } catch (err) {
      console.warn('[hindsight] Could not dynamically load HindsightServer:', err);
    }
  }
  return HindsightServerClass;
}

// Ensure Astral uv / uvx is present on PATH and Python 3.12 is pinned for Hindsight packages
const homeDir = process.env.USERPROFILE || process.env.HOME || '';
if (homeDir) {
  const userLocalBin = path.join(homeDir, '.local', 'bin');
  const pathSep = process.platform === 'win32' ? ';' : ':';
  if (!process.env.PATH?.includes(userLocalBin)) {
    process.env.PATH = `${userLocalBin}${pathSep}${process.env.PATH || ''}`;
  }
}
process.env.UV_PYTHON = process.env.UV_PYTHON || '3.12';

export interface BankState {
  bankId: string;
  facts: HindsightFact[];
  experiences: HindsightExperience[];
  antiPatterns: HindsightAntiPattern[];
  lastReflectedState?: string;
}

export interface SemanticMatch<T> {
  item: T;
  score: number;
}

export class HindsightService {
  private localBanks: Map<string, BankState> = new Map();
  private banksDir: string;
  public isConnected: boolean = false;
  public daemonServer: HindsightServerType | null = null;
  public readonly client: HindsightClient;
  private startingPromise: Promise<boolean> | null = null;

  constructor() {
    this.banksDir = path.join(config.storageDir, 'banks');
    if (!fs.existsSync(this.banksDir)) {
      fs.mkdirSync(this.banksDir, { recursive: true });
    }

    // Initialize official @vectorize-io/hindsight-client SDK
    this.client = new HindsightClient({
      baseUrl: config.hindsightUrl || 'http://127.0.0.1:8888'
    });

    this.loadPersistedBanks();
  }

  public async getDaemonServer(): Promise<HindsightServerType | null> {
    if (!this.daemonServer) {
      const Cls = await getHindsightServerClass();
      if (Cls) {
        this.daemonServer = new Cls({
          profile: 'smith',
          port: 8888,
          env: {
            UV_PYTHON: process.env.UV_PYTHON || '3.12',
            HINDSIGHT_API_LLM_PROVIDER: config.hindsightProvider || 'openai',
            HINDSIGHT_API_LLM_API_KEY: config.hindsightApiKey || 'test-key',
          },
          readyTimeoutMs: 60000,
        });
      }
    }
    return this.daemonServer;
  }

  public getAllBankIds(): string[] {
    return Array.from(this.localBanks.keys());
  }

  private loadPersistedBanks() {
    try {
      const files = fs.readdirSync(this.banksDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const bankId = file.replace('.json', '');
          const content = fs.readFileSync(path.join(this.banksDir, file), 'utf-8');
          this.localBanks.set(bankId, JSON.parse(content));
        }
      }
    } catch {
      // Ignore initial directory empty
    }
  }

  private saveBank(bankId: string) {
    const bank = this.localBanks.get(bankId);
    if (bank) {
      fs.writeFileSync(path.join(this.banksDir, `${bankId}.json`), JSON.stringify(bank, null, 2));
    }
  }

  /**
   * Start the official Hindsight daemon via @vectorize-io/hindsight-all (uvx).
   */
  public async startDaemon(): Promise<boolean> {
    if (this.startingPromise) {
      return this.startingPromise;
    }

    this.startingPromise = (async () => {
      try {
        const daemon = await this.getDaemonServer();
        if (!daemon) return false;
        if (await daemon.checkHealth()) {
          this.isConnected = true;
          return true;
        }
        await daemon.start();
        this.isConnected = await daemon.checkHealth();
        return this.isConnected;
      } catch (err) {
        console.warn('[hindsight] Failed to start daemon:', err);
        this.isConnected = false;
        return false;
      } finally {
        this.startingPromise = null;
      }
    })();

    return this.startingPromise;
  }

  /**
   * Stop the official Hindsight daemon.
   */
  public async stopDaemon(): Promise<void> {
    try {
      if (this.daemonServer) {
        await this.daemonServer.stop();
      }
      this.isConnected = false;
    } catch {
      // Ignore
    }
  }

  /**
   * Health probe and daemon lifecycle supervision.
   * Checks if Hindsight daemon is running; if not and outside test runner, starts it.
   */
  async checkHealth(): Promise<{ status: string; connected: boolean; url: string; provider: string }> {
    try {
      const daemon = await this.getDaemonServer();
      if (!daemon) {
        this.isConnected = false;
        return {
          status: 'offline',
          connected: false,
          url: config.hindsightUrl || 'http://127.0.0.1:8888',
          provider: config.hindsightProvider
        };
      }

      const isHealthy = await daemon.checkHealth();
      if (isHealthy) {
        this.isConnected = true;
        return {
          status: 'ok',
          connected: true,
          url: daemon.getBaseUrl(),
          provider: config.hindsightProvider
        };
      }

      // If not running and server is starting up (non-vitest), start daemon backed by uvx
      if (!process.env.VITEST) {
        const started = await this.startDaemon();
        if (started) {
          return {
            status: 'ok',
            connected: true,
            url: daemon.getBaseUrl(),
            provider: config.hindsightProvider
          };
        }
      }

      this.isConnected = false;
      return {
        status: 'offline',
        connected: false,
        url: daemon.getBaseUrl(),
        provider: config.hindsightProvider
      };
    } catch {
      this.isConnected = false;
      return {
        status: 'offline',
        connected: false,
        url: config.hindsightUrl || 'http://127.0.0.1:8888',
        provider: config.hindsightProvider
      };
    }
  }

  async ensureBank(bankId: string): Promise<BankState> {
    if (!this.localBanks.has(bankId)) {
      const initialBank: BankState = {
        bankId,
        facts: [],
        experiences: [],
        antiPatterns: []
      };
      this.localBanks.set(bankId, initialBank);
      this.saveBank(bankId);
    }

    // Provision bank in daemon via @vectorize-io/hindsight-client if connected
    if (this.isConnected) {
      try {
        await this.client.createBank(bankId);
      } catch {
        // Fallback to local persistence
      }
    }

    return this.localBanks.get(bankId)!;
  }

  /**
   * Generates a normalized subword and term-frequency sparse vector for semantic similarity.
   * Extracts lowercase word tokens and character 3-grams to capture roots, technical syntax, and typos.
   */
  public vectorize(text: string): Map<string, number> {
    const vector = new Map<string, number>();
    const normalized = text.toLowerCase().replace(/[^a-z0-9_\-./]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);

    let magnitudeSq = 0;

    const addFeature = (feat: string, weight: number = 1.0) => {
      const current = vector.get(feat) || 0;
      vector.set(feat, current + weight);
    };

    // Full word tokens (high weight)
    for (const t of tokens) {
      if (t.length > 1) {
        addFeature(t, 2.5);
      }
      // Subword character 3-grams for root and partial matching
      if (t.length >= 3) {
        for (let i = 0; i <= t.length - 3; i++) {
          addFeature(t.substring(i, i + 3), 1.0);
        }
      }
    }

    // Calculate magnitude for L2 normalization
    for (const count of vector.values()) {
      magnitudeSq += count * count;
    }

    const magnitude = Math.sqrt(magnitudeSq);
    if (magnitude > 0) {
      for (const [k, v] of vector.entries()) {
        vector.set(k, v / magnitude);
      }
    }

    return vector;
  }

  /**
   * Computes cosine similarity between two normalized sparse vectors: dot product.
   * Returns a value between 0.0 and 1.0.
   */
  public cosineSimilarity(v1: Map<string, number>, v2: Map<string, number>): number {
    let dot = 0;
    // Iterate over smaller vector for performance
    const [smaller, larger] = v1.size <= v2.size ? [v1, v2] : [v2, v1];

    for (const [feat, val1] of smaller.entries()) {
      const val2 = larger.get(feat);
      if (val2 !== undefined) {
        dot += val1 * val2;
      }
    }
    return Math.min(1.0, Math.max(0.0, dot));
  }

  /**
   * Performs semantic vector similarity search over an array of items.
   */
  public semanticSearch<T>(
    items: T[],
    textExtractor: (item: T) => string,
    query: string,
    topK: number = 5,
    minScore: number = 0.05
  ): Array<SemanticMatch<T>> {
    if (items.length === 0 || !query.trim()) return [];

    const queryVec = this.vectorize(query);
    const scored: Array<SemanticMatch<T>> = [];

    for (const item of items) {
      const itemText = textExtractor(item);
      const itemVec = this.vectorize(itemText);
      const score = this.cosineSimilarity(queryVec, itemVec);

      if (score >= minScore) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async retainLocal(bankId: string, content: string, metadata?: { category?: string; agentId?: string }): Promise<boolean> {
    await this.ensureBank(bankId);
    const bank = this.localBanks.get(bankId)!;

    const fact: HindsightFact = {
      id: `fact-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      text: content,
      category: (metadata?.category as any) || 'general',
      createdAt: Date.now()
    };
    bank.facts.unshift(fact);
    this.saveBank(bankId);
    return true;
  }

  async retain(bankId: string, content: string, metadata?: { category?: string; agentId?: string }): Promise<boolean> {
    await this.retainLocal(bankId, content, metadata);

    // Forward to Hindsight client if daemon is active
    if (this.isConnected) {
      try {
        await this.client.retain(bankId, content, { metadata });
      } catch {
        // Local state already updated
      }
    }

    return true;
  }

  async retainExperience(bankId: string, experience: Omit<HindsightExperience, 'id' | 'timestamp'>): Promise<HindsightExperience> {
    await this.ensureBank(bankId);
    const bank = this.localBanks.get(bankId)!;

    const exp: HindsightExperience = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...experience,
      timestamp: Date.now()
    };
    bank.experiences.unshift(exp);
    this.saveBank(bankId);

    // Also retain as text fact in Hindsight
    await this.retain(bankId, `[Experience] Agent ${exp.agentId} performed: ${exp.action}. Outcome: ${exp.outcome}. Diff: ${exp.diffSummary || 'none'}`, {
      category: 'experience',
      agentId: exp.agentId
    });

    return exp;
  }

  async retainAntiPattern(bankId: string, antiPattern: Omit<HindsightAntiPattern, 'id' | 'timestamp'>): Promise<HindsightAntiPattern> {
    await this.ensureBank(bankId);
    const bank = this.localBanks.get(bankId)!;

    const ap: HindsightAntiPattern = {
      id: `ap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...antiPattern,
      timestamp: Date.now()
    };
    bank.antiPatterns.unshift(ap);
    this.saveBank(bankId);

    // Also retain as warning fact
    await this.retain(bankId, `[Anti-Pattern Warning] Error encountered: ${ap.error}. Context: ${ap.context}. Solution: ${ap.solution}`, {
      category: 'anti_pattern',
      agentId: ap.agentId
    });

    return ap;
  }

  async recallLocal(bankId: string, query: string): Promise<{
    facts: HindsightFact[];
    antiPatterns: HindsightAntiPattern[];
    summary: string;
    scores?: { facts: number[]; antiPatterns: number[] };
  }> {
    await this.ensureBank(bankId);
    const bank = this.localBanks.get(bankId)!;

    // Native Local Semantic Vector Search
    const factMatches = this.semanticSearch(bank.facts, (f) => `${f.category || ''} ${f.text}`, query, 8, 0.05);
    const apMatches = this.semanticSearch(bank.antiPatterns, (ap) => `${ap.error} ${ap.context} ${ap.solution}`, query, 5, 0.05);

    const matchedFacts = factMatches.length > 0 ? factMatches.map(m => m.item) : bank.facts.slice(0, 5);
    const matchedAPs = apMatches.length > 0 ? apMatches.map(m => m.item) : bank.antiPatterns.slice(0, 3);

    const topScore = factMatches[0]?.score ? (factMatches[0].score * 100).toFixed(0) : '0';

    return {
      facts: matchedFacts,
      antiPatterns: matchedAPs,
      summary: `Recalled ${matchedFacts.length} facts (top similarity ${topScore}%) and ${matchedAPs.length} anti-patterns from native vector memory in bank ${bankId}.`,
      scores: {
        facts: factMatches.map(m => Math.round(m.score * 1000) / 1000),
        antiPatterns: apMatches.map(m => Math.round(m.score * 1000) / 1000)
      }
    };
  }

  async recall(bankId: string, query: string): Promise<{
    facts: HindsightFact[];
    antiPatterns: HindsightAntiPattern[];
    summary: string;
    scores?: { facts: number[]; antiPatterns: number[] };
  }> {
    // Try @vectorize-io/hindsight-client if daemon is active
    if (this.isConnected) {
      try {
        const response: any = await this.client.recall(bankId, query);
        if (response) {
          const bank = this.localBanks.get(bankId);
          const facts = response.facts || response.memories || response.results?.map((r: any) => ({ id: r.id, text: r.text, createdAt: Date.now() })) || bank?.facts.slice(0, 5) || [];
          return {
            facts,
            antiPatterns: bank?.antiPatterns.slice(0, 5) || [],
            summary: response.summary || `Recalled ${facts.length} facts via @vectorize-io/hindsight-client.`
          };
        }
      } catch {
        // Fall back to native local vector search
      }
    }

    return this.recallLocal(bankId, query);
  }

  async reflectLocal(bankId: string, goal: string): Promise<string> {
    await this.ensureBank(bankId);
    const bank = this.localBanks.get(bankId)!;

    // Local synthesis with semantic ranking for relevance
    const relevantFacts = this.semanticSearch(bank.facts, (f) => f.text, goal, 5, 0.02).map(m => m.item);
    const relevantAPs = this.semanticSearch(bank.antiPatterns, (ap) => `${ap.error} ${ap.solution}`, goal, 3, 0.02).map(m => m.item);

    const factsCount = bank.facts.length;
    const expCount = bank.experiences.length;
    const apCount = bank.antiPatterns.length;

    const displayFacts = relevantFacts.length > 0 ? relevantFacts : bank.facts.slice(0, 3);
    const displayAPs = relevantAPs.length > 0 ? relevantAPs : bank.antiPatterns.slice(0, 3);

    const synthesized = `### Hindsight Reflected Synthesis for Goal: "${goal}"
- **Native Semantic Vector State**: ${factsCount} world facts, ${expCount} experiences recorded, ${apCount} anti-patterns identified.
- **Top Ranked Architectural Directives**:
${displayFacts.map(f => `  * ${f.text}`).join('\n') || '  * Standard project structure and clean commit boundaries.'}
- **Anti-Pattern Warnings**:
${displayAPs.map(ap => `  * ⚠️ ${ap.error} -> Fix: ${ap.solution}`).join('\n') || '  * None reported.'}`;

    bank.lastReflectedState = synthesized;
    this.saveBank(bankId);
    return synthesized;
  }

  async reflect(bankId: string, goal: string): Promise<string> {
    // Try @vectorize-io/hindsight-client if daemon is active
    if (this.isConnected) {
      try {
        const res: any = await this.client.reflect(bankId, goal);
        if (res) {
          const reflection = res.reflection || res.text || res.response || String(res);
          const bank = this.localBanks.get(bankId);
          if (bank) {
            bank.lastReflectedState = reflection;
            this.saveBank(bankId);
          }
          return reflection;
        }
      } catch {
        // Local synthesis
      }
    }

    return this.reflectLocal(bankId, goal);
  }

  getBank(bankId: string): BankState | undefined {
    return this.localBanks.get(bankId);
  }
}

export const hindsightService = new HindsightService();
