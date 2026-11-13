import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// These tests render to a string in Node, where there is no DOM for the sanitiser or Mermaid.
vi.mock('dompurify', () => ({ default: { sanitize: (html: string) => html } }));
vi.mock('mermaid', () => ({ default: { initialize: () => {}, render: async () => ({ svg: '' }) } }));

import { BoardView, CardDetail } from '../src/client/components/BoardView.tsx';
import { MarkdownContent } from '../src/client/components/MarkdownContent.tsx';
import { GoalChat } from '../src/client/components/GoalChat.tsx';
import { NewSessionModal, suggestTier } from '../src/client/components/NewSessionModal.tsx';
import { Board, emptyBoard } from '../src/server/board.ts';
import { suggestTier as serverSuggestTier } from '../src/server/routes/sessions.router.ts';
import { BoardLogEntry, TurnRecord } from '../src/shared/board.ts';
import { Session } from '../src/shared/types.ts';
import fs from 'node:fs';
import path from 'node:path';

/** A board with a card in every state, built through the real rules. */
function sampleBoard() {
  const log: BoardLogEntry[] = [];
  const board = new Board(emptyBoard('s1'), { onChange: e => log.push(e) });
  board.setPeers([
    { id: 'claude-1', harness: 'claude', model: 'opus', tier: 3 },
    { id: 'claude-2', harness: 'claude', model: 'sonnet', tier: 2 },
    { id: 'opencode-1', harness: 'opencode', model: 'local/x', tier: 1 }
  ]);
  board.setReviewMode('thorough');
  board.startGoal('Build the feature', '/repo/docs/spec.md', {
    verify: ['npm test'],
    tasks: [
      { id: 'a', title: 'Token types', description: 'types', acceptance: ['compiles'], fileScope: ['src/types.ts'] },
      { id: 'b', title: 'Route guards', description: 'guards', acceptance: ['rejects expired'], fileScope: ['src/guards.ts'], dependsOn: ['a'] },
      { id: 'c', title: 'Docs page', description: 'docs', acceptance: ['documented'], fileScope: ['docs/guide.md'] },
      { id: 'd', title: 'Pick a format', description: 'format', acceptance: ['decided'], fileScope: ['src/format.ts'], minTier: 2 },
      { id: 'e', title: 'Old idea', description: 'x', acceptance: ['x'], fileScope: ['old.ts'] }
    ]
  });
  const [types, guards, docs, format, old] = board.cards();
  board.claim('claude-1', types.id);
  board.submit('claude-1', types.id, { summary: 'Added the token types.', diff: { files: ['src/types.ts'], lines: 20 } });
  board.claim('claude-2', docs.id);
  board.edit('claude-1', docs.id, { acceptance: ['documented', 'has an example'] }, 'readers need an example', board.data.planVersion);
  board.claim('opencode-1', old.id);
  board.release('opencode-1', old.id, 'not sure this is needed');
  board.cancel('claude-1', old.id, 'superseded by the guards', board.data.planVersion);
  board.askUser('claude-1', format.id, 'The spec does not say: **JSON** or YAML?');
  board.removeForUsageLimit('opencode', 'local/x', 'usage limit reached', Date.now() + 3600_000);
  return { board, log, ids: { types: types.id, guards: guards.id, docs: docs.id, format: format.id } };
}

const noop = () => {};
const asyncNoop = async () => {};

describe('BoardView', () => {
  it('renders every column, the team, and the cards that need the user', () => {
    const { board, log, ids } = sampleBoard();
    const turn: TurnRecord = { id: 't1', sessionId: 's1', peer: 'claude-2', harness: 'claude', model: 'sonnet', reason: 'continue', cardId: ids.docs, startedAt: Date.now() };
    const html = renderToStaticMarkup(
      <BoardView board={board.data} log={log} runningTurns={[turn]} recentTurns={[]} onAnswer={asyncNoop} onSetReviewMode={noop} onPause={noop} onResume={noop} onSetMinTier={asyncNoop} />
    );

    for (const column of ['Ready', 'In progress', 'In review', 'Done']) expect(html).toContain(column);
    expect(html).toContain('Needs you (1)');
    for (const title of ['Token types', 'Route guards', 'Docs page', 'Pick a format', 'Old idea', 'Review: Token types']) expect(html).toContain(title);
    expect(html).toContain('@claude-1');
    expect(html).toContain('@opencode-1');
    expect(html).toContain('Away: usage limit reached');
    expect(html).toContain('Review: Thorough');
    expect(html).toContain('tier 2+');
    expect(html).toContain('src/guards.ts');
    expect(html).toMatch(/Plan changes \(\d+\)/);
    expect(html).toContain('Working');
  });

  it('shows why the goal is paused, with a way to resume', () => {
    const { board, log } = sampleBoard();
    board.pause('The team is stuck: nothing can move without you.');
    const html = renderToStaticMarkup(
      <BoardView board={board.data} log={log} runningTurns={[]} recentTurns={[]} onAnswer={asyncNoop} onSetReviewMode={noop} onPause={noop} onResume={noop} onSetMinTier={asyncNoop} />
    );
    expect(html).toContain('Paused');
    expect(html).toContain('nothing can move without you');
    expect(html).toContain('Resume');
  });

  it('renders an empty state without a board', () => {
    const html = renderToStaticMarkup(
      <BoardView board={null} log={[]} runningTurns={[]} recentTurns={[]} onAnswer={asyncNoop} onSetReviewMode={noop} onPause={noop} onResume={noop} onSetMinTier={asyncNoop} />
    );
    expect(html).toContain('No board yet');
  });
});

describe('CardDetail', () => {
  it('shows the thread and an answer box on a card that is waiting for the user', () => {
    const { board, ids } = sampleBoard();
    const html = renderToStaticMarkup(<CardDetail card={board.card(ids.format)} board={board.data} onClose={noop} onAnswer={asyncNoop} onSetMinTier={asyncNoop} />);
    expect(html).toContain('Pick a format');
    expect(html).toContain('<strong>JSON</strong>');
    expect(html).toContain('The team is waiting for your answer');
    expect(html).toContain('Minimum tier');
  });

  it('shows an open proposal with its changes on the owner’s card', () => {
    const { board, ids } = sampleBoard();
    const html = renderToStaticMarkup(<CardDetail card={board.card(ids.docs)} board={board.data} onClose={noop} onAnswer={asyncNoop} onSetMinTier={asyncNoop} />);
    expect(html).toContain('readers need an example');
    expect(html).toContain('has an example');
    expect(html).toContain('open');
    expect(html).not.toContain('The team is waiting for your answer');
  });
});

describe('GoalChat', () => {
  const session: Session = {
    id: 's1',
    name: 'Feature',
    repoPath: '/repo',
    macroGoal: 'Build the feature',
    worktree: { path: '/repo/.worktrees/smith-feature', branch: 'smith/feature', baseBranch: 'main', isClean: true, dirtyFiles: [] },
    agents: {},
    reviewMode: 'normal',
    customizations: { plugins: [], skills: [], mcpServers: {} },
    createdAt: 1,
    updatedAt: 1
  };
  const handlers = {
    isSending: false,
    onSendGoal: noop,
    onAnswerCard: asyncNoop,
    onSetReviewMode: noop,
    onPause: noop,
    onResume: noop,
    onSetMinTier: asyncNoop,
    onMergeWorktree: async () => ({}),
    onDiscardWorktree: async () => ({}),
    onOpenNewSession: noop
  };

  it('offers to create a session when there is none', () => {
    const html = renderToStaticMarkup(<GoalChat currentSession={null} messages={[]} board={null} log={[]} runningTurns={[]} recentTurns={[]} {...handlers} />);
    expect(html).toContain('No session yet');
    expect(html).toContain('New session');
  });

  it('renders the conversation, a question, and the finished diff with its merge action', () => {
    const { board, log } = sampleBoard();
    const html = renderToStaticMarkup(
      <GoalChat
        currentSession={session}
        board={board.data}
        log={log}
        runningTurns={[]}
        recentTurns={[]}
        messages={[
          { id: 'm1', sender: 'user', kind: 'goal', content: 'Build the feature', timestamp: 1 },
          { id: 'm2', sender: 'board', kind: 'question', cardId: 'c4', content: '**Pick a format** (c4) needs you', timestamp: 2 },
          {
            id: 'm3',
            sender: 'board',
            kind: 'completed',
            content: 'Goal verified and complete.',
            timestamp: 3,
            diffSummary: {
              branch: 'smith/feature',
              baseBranch: 'main',
              totalAdditions: 42,
              totalDeletions: 3,
              changedFilesCount: 2,
              canMergeCleanly: true,
              files: [
                { file: 'src/types.ts', additions: 30, deletions: 0, status: 'added' },
                { file: 'src/guards.ts', additions: 12, deletions: 3, status: 'modified' }
              ]
            }
          }
        ]}
        {...handlers}
      />
    );
    expect(html).toContain('Build the feature');
    expect(html).toContain('<strong>Pick a format</strong>');
    expect(html).toContain('Merge into main');
    expect(html).toContain('+42');
    expect(html).toContain('src/guards.ts');
    // One card is waiting, so the input says what a plain message will do.
    expect(html).toMatch(/Answer the team(&#x27;|')s question on c4/);
    // The board is rendered beside the chat.
    expect(html).toContain('Needs you (1)');

    // With SMITH_WRITE_PREVIEW set to a directory, also write the page with the built stylesheet
    // so the layout can be looked at in a browser without starting the server.
    const out = process.env.SMITH_WRITE_PREVIEW;
    if (out) {
      const assets = path.join(process.cwd(), 'dist', 'assets');
      const css = fs.readdirSync(assets).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(assets, f), 'utf-8')).join('\n');
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(
        path.join(out, 'preview.html'),
        `<!doctype html><html><head><meta charset="utf-8"><title>Smith preview</title><style>${css}</style></head><body><div class="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans"><main class="flex-1 overflow-hidden flex flex-col">${html}</main></div></body></html>`
      );
    }
  });
});

describe('NewSessionModal', () => {
  it('renders the form with review modes, and nothing when closed', () => {
    const open = renderToStaticMarkup(<NewSessionModal isOpen onClose={noop} availableModels={[]} agentHealth={{}} onCreateSession={async () => null} />);
    for (const text of ['New session', 'Repository path', 'Workers', 'Fast', 'Normal', 'Thorough', 'Create session']) expect(open).toContain(text);
    expect(renderToStaticMarkup(<NewSessionModal isOpen={false} onClose={noop} availableModels={[]} onCreateSession={async () => null} />)).toBe('');
  });

  it('suggests the same tier in the form as the server assigns', () => {
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'gpt-4o-mini', 'gpt-6.1-sol', 'ollama/qwen', 'something-else']) {
      expect(suggestTier(model)).toBe(serverSuggestTier(model));
    }
    expect(suggestTier('claude-opus-5-5')).toBe(3);
    expect(suggestTier('claude-haiku-5-5')).toBe(1);
    expect(suggestTier('claude-sonnet-5-5')).toBe(2);
  });
});

describe('Markdown content', () => {
  it('renders headings, lists, reference links, tables and fenced code together', () => {
    const content = '# Review\n\n- **One**\n- [Docs][ref]\n\n| Check | Result |\n| --- | --- |\n| Errors | Passed |\n\n```ts\nconst value = "<safe>";\n```\n\n[ref]: https://example.com/docs';
    const html = renderToStaticMarkup(<MarkdownContent content={content}/>);
    for (const fragment of ['<h1>Review</h1>', '<strong>One</strong>', '<table>', 'href="https://example.com/docs"', 'language-ts', '&lt;safe&gt;']) expect(html).toContain(fragment);
  });
  it('does not turn a Mermaid example nested in another code fence into a diagram', () => {
    const html = renderToStaticMarkup(<MarkdownContent content={'````markdown\n```mermaid\ngraph TD; A-->B;\n```\n````'}/>);
    expect(html).toContain('language-markdown'); expect(html).not.toContain('Mermaid Diagram');
  });
});
