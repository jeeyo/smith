/**
 * Google Elephant-Goldfish Model (EGM) Spec-Driven Development Framework
 * https://github.com/google/elephant-goldfish-model
 *
 * Enforced behind-the-scenes for the Orchestrator (The Elephant) and Observer/Workers (The Goldfish).
 * - The Elephant: Deep-context agent that probes requirements, surfaces ambiguities,
 *   asks multi-dimensional clarification questions to squeeze out user preferences,
 *   and drafts an explicit specification before any code execution starts.
 * - The Goldfish: Zero-context, unbiased worker/observer that operates strictly within
 *   the bounded specification without conversational assumptions or milestone fraud.
 */

import { InteractiveQuestion, AgentId } from '../../shared/types.ts';

export const ELEPHANT_PROTOCOL_INSTRUCTIONS = `
[ELEPHANT-GOLDFISH MODEL: THE ELEPHANT PROTOCOL]
You are operating as The Elephant (Deep-Context Memory & Specification Architect).
Guidelines:
1. SPEC-DRIVEN: Thoroughly explore the problem space, edge cases, and architectural tradeoffs.
2. ELICITATION FIRST: Squeeze out the user's opinions, preferences, and constraints using multi-dimensional clarification questions before executing work.
3. GATED EXECUTION: Never modify files or claim locks while in Plan mode. Execution begins only after the plan is confirmed.
4. BOUNDED CONTRACTS: Break down work into disjoint, non-racing subtask boundaries with explicit acceptance criteria.
`;

export const GOLDFISH_PROTOCOL_INSTRUCTIONS = `
[ELEPHANT-GOLDFISH MODEL: THE GOLDFISH PROTOCOL]
You are operating as The Goldfish (Zero-Context Objective Auditor & Worker).
Guidelines:
1. ZERO CONTEXT BIAS: Evaluate implementation strictly against the bounded specification and acceptance criteria.
2. GROUND TRUTH VERIFICATION: Verify that claimed files actually exist on disk and have non-trivial content.
3. NO RUBBER-STAMPING: Never certify a subtask as verified if 0 files match the scope or test runs were not executed.
`;

export interface ElephantQuestionSpec {
  id: string;
  category: 'architecture' | 'ux_config' | 'edge_cases' | 'verification';
  prompt: string;
  context: string;
  options: string[];
}

/**
 * Generates multi-topic clarification questions to thoroughly squeeze out user opinions
 * based on the declared goal.
 */
export function generateElephantInquiries(
  goalText: string,
  sessionId: string,
  orchestratorAgentId: AgentId = 'antigravity',
  orchestratorModel: string = 'gemini-4-argon'
): InteractiveQuestion[] {
  const lower = goalText.toLowerCase();
  const questions: InteractiveQuestion[] = [];

  if (lower.includes('android') || lower.includes('notification')) {
    // 1. Architecture Question
    questions.push({
      id: `q-arch-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'Which Android notification listening architecture should be implemented?',
      context: 'NotificationListenerService provides system-level event hooks but requires user enablement in Settings > Special App Access, whereas a Foreground Service ensures persistent process lifetime.',
      options: [
        'NotificationListenerService with intent to redirect user to Settings (Recommended)',
        'Foreground Service with continuous sticky notification badge',
        'Hybrid NotificationListenerService backed by Foreground Service keep-alive'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });

    // 2. UX & Default Configuration Question (Squeezing out user preference)
    questions.push({
      id: `q-settings-default-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'How should the app filtering settings behavior and storage be structured?',
      context: 'The user requested a settings page to pick which apps to listen to, defaulting to "All apps".',
      options: [
        'Default to "All apps" with room to toggle specific package names via Jetpack DataStore (Recommended)',
        'Default to "All apps" using SharedPreferences with instantaneous listener broadcast refresh',
        'Whitelist mode where user must explicitly approve individual apps'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });

    // 3. Edge-Case & Background Survival Question
    questions.push({
      id: `q-lifecycle-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'How should OS process death and device restarts be handled?',
      context: 'Android OEM battery managers may kill long-running background services if not registered with boot receivers.',
      options: [
        'BOOT_COMPLETED broadcast receiver to auto-rebind service on device boot (Recommended)',
        'Rely on standard system re-bind without explicit boot receiver',
        'Periodic WorkManager health check to verify listener is active'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });
  } else if (lower.includes('auth') || lower.includes('jwt') || lower.includes('token') || lower.includes('login')) {
    // 1. Cryptographic Standard
    questions.push({
      id: `q-crypto-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'Which cryptographic signature algorithm should the team adhere to for tokens?',
      context: 'Ed25519 provides compact, high-performance signatures with quantum resilience, while RS256 maintains legacy OIDC/JWKS compatibility.',
      options: [
        'Ed25519 asymmetric signatures (Recommended)',
        'RS256 with rotating JWKS keypair',
        'Standard HMAC-SHA256 (HS256)'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });

    // 2. Session Revocation Strategy
    questions.push({
      id: `q-revocation-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'How should token revocations and logout cascades be managed?',
      context: 'Stateless tokens cannot be revoked without a centralized blacklist or short expiration window.',
      options: [
        'In-memory / Redis TTL blacklist for revoked tokens (Recommended)',
        'Durable SQL database table for active refresh tokens',
        'Stateless short-lived tokens (5 min) with no revocation table'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });

    // 3. User Permission / Scope Granularity
    questions.push({
      id: `q-rbac-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'What authorization model should protect authenticated routes?',
      context: 'Determines how permissions and roles are embedded in the access token.',
      options: [
        'Role-Based Access Control (RBAC) with predefined admin/user roles (Recommended)',
        'Fine-grained attribute/scope claims (e.g. read:notifications, write:settings)',
        'Basic authentication check (authenticated vs unauthenticated only)'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });
  } else if (lower.includes('api') || lower.includes('endpoint') || lower.includes('crud')) {
    questions.push({
      id: `q-api-spec-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'Which contract specification standard should define API routes?',
      context: 'Establishing a strict schema upfront prevents integration mismatches between client and server.',
      options: [
        'OpenAPI 3.1 JSON Specification with TypeScript types (Recommended)',
        'tRPC end-to-end typed router definitions',
        'GraphQL Schema with typed code-generation'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });
    questions.push({
      id: `q-api-errors-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'What error response standard should API endpoints adopt?',
      context: 'RFC 7807 Problem Details provides standardized JSON error bodies across all status codes.',
      options: [
        'RFC 7807 Problem Details standard (Recommended)',
        'Custom { error: string, code: number } payload',
        'Minimal HTTP status code with error message string'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });
  } else {
    // General / Domain-agnostic comprehensive inquiry
    questions.push({
      id: `q-scope-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: `What is the primary architectural priority for "${goalText.length > 50 ? goalText.substring(0, 50) + '...' : goalText}"?`,
      context: 'Specifying the core tradeoff upfront guides subtask partitioning and performance vs maintainability priorities.',
      options: [
        'Complete end-to-end implementation with unit and integration tests (Recommended)',
        'Rapid modular prototype focusing on core functionality first',
        'Production-grade implementation with strict error boundaries and telemetry'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });

    questions.push({
      id: `q-test-strategy-${sessionId}`,
      askingAgent: orchestratorAgentId,
      askingModel: orchestratorModel,
      prompt: 'What verification and test coverage standard should be applied?',
      context: 'The observer uses this criterion to certify task completion.',
      options: [
        'Automated test suite with real execution check (Recommended)',
        'Isolated unit test mocks for fast iteration',
        'Visual & manual smoke-test validation'
      ],
      isMultiSelect: false,
      allowCustom: true,
      answered: false
    });
  }

  return questions;
}
