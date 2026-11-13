# Smith user manual

Smith runs a team of coding agents on a goal you state. The agents are the CLIs you already have (Claude Code, Codex, OpenCode), using the logins those CLIs already hold. Nobody leads the team. The agents coordinate through one shared board that you can watch and steer.

## 1. Before you start

- Node.js 22 or later, and Git.
- At least one agent CLI installed and logged in. Smith finds `claude`, `codex` and `opencode` on your `PATH`; you can set exact paths in **App settings → Agent Binaries**.
- A local Git repository to work in.

Start the app from source with `npm run tauri:dev`, or the server and web UI with `npm run server` and `npm run dev`. The UI is at `http://localhost:4100` and the API reference at `http://localhost:4100/api/docs`.

The server listens on `127.0.0.1` only. Set the `HOST` environment variable if you deliberately want it reachable from other machines.

## 2. Sessions

A session is an isolated Git worktree plus a team of workers. Create one with **New Session**:

- **Name** and **repository path**. Smith creates a branch `smith/<name>-<id>` and a worktree for it under `.worktrees/` in the repository. Your own checkout is not touched.
- **Workers.** Each worker is a CLI and a model, for example Claude Code on Opus. Add as many as you like, including several on the same CLI. All workers are peers.
- **Tier.** A number from 1 to 3 saying how capable the worker's model is. Smith suggests one from the model name and you can change it. Tiers only matter if you mix stronger and weaker models: a card can require a minimum tier.
- **Review mode** (section 6).

Workers on the same CLI and model share one subscription limit. More workers on one subscription reach that limit sooner; they do not add capacity.

## 3. Stating a goal

Type the goal in the session chat. Two forms work:

- **Plain words.** Smith saves them as the spec. The first card on the board asks the team to break the goal into cards.
- **The path of a spec file in the repository**, for example `docs/designs/feature.md`. If the spec ends with a task list, those tasks become the first cards directly.

A task list is a fenced block tagged `smith-tasks` at the end of the spec:

````
```smith-tasks
{
  "verify": ["npm test"],
  "tasks": [
    { "id": "types", "title": "Token types", "description": "...",
      "acceptance": ["types compile"], "fileScope": ["src/auth/types.ts"] },
    { "id": "guards", "title": "Route guards", "description": "...",
      "acceptance": ["guards reject expired tokens"], "fileScope": ["src/auth/guards.ts"],
      "dependsOn": ["types"], "review": true }
  ]
}
```
````

`verify` lists the commands that prove the goal is met. `review: true` forces a review of that card in Normal mode. `minTier` restricts a card to stronger workers.

The spec is yours. Workers can read it but cannot change it; a card whose changes touch the spec file is refused.

## 4. The board

The board is on the right of the chat. Each card shows its id, title, owner, file scope and state.

| State | Meaning |
|---|---|
| Ready | Can be claimed. Blocked cards also sit here until what they wait for is finished. |
| In progress | Claimed by one worker. |
| In review | Submitted; waiting for another worker's review or for the merge. |
| Done | Merged into the session branch, or cancelled. |
| Needs you | Waiting for your answer. Shown above the columns. |

Card kinds: **plan** (break the goal into cards), **work**, **review** (check another worker's card), **merge-conflict** (resolve a merge that conflicted) and **verify** (the final check).

Click a card to see its acceptance criteria, scope, dependencies, branch, and its thread: every note, proposal, decision and question on that card, in order.

Above the board:

- **Team.** One chip per worker. A spinner means it has a turn running; a greyed chip means it is away for a usage limit.
- **Plan changes.** The change log: who changed the plan, what they did and why.
- **Turns.** Each agent run, with its outcome.

## 5. How the team works

Workers run in short turns. Each turn starts with no memory: the worker is given the goal, one line per card, and the full thread of the card in hand. Anything a worker learns has to be written on a card, which is why the threads are worth reading.

In a turn a worker can:

- claim a ready card, do the work in the card's own worktree, and submit it;
- add, split, edit or cancel cards when the plan is wrong;
- block its card on another card it needs first;
- hand a card back, or offer it to a named worker;
- propose a change to a card someone else holds, which that owner accepts or rejects;
- ask you a question.

The server does not decide who does what. It enforces rules:

- The first claim on a card wins, and a worker holds one card at a time.
- Two cards in progress cannot have overlapping file scopes.
- When a card is submitted, Smith commits the worker's changes and compares them with the card's file scope. Changes outside the scope are refused.
- A review is never done by the card's author.
- A card cannot be handed back to someone who already passed it on, and can be handed on at most twice.
- A worker that fails a card does not get the next attempt while another worker is free.
- A lease expires after 20 minutes without a turn, and the card returns to the board.

When a card is done its branch is merged into the session branch. If the merge conflicts, it is aborted and a merge-conflict card is opened for a worker to resolve.

## 6. Review modes

| Mode | Which cards are reviewed by another worker |
|---|---|
| Fast | None. |
| Normal | Cards that change more than 150 lines or 5 files, cards the spec marked, cards whose author asked, and cards that came back at least once. |
| Thorough | All. |

Change the mode at any time from the board header; it applies to cards submitted afterwards. With a single worker there is nobody else to review, so no cards are reviewed.

In every mode, once all cards are finished, one worker runs the spec's verify commands and reports each exit code. The goal is complete when that passes. If it fails, the worker creates cards for what is wrong and the team continues.

## 7. When the team needs you

A card moves to **Needs you** when:

- a worker asks a question, including whenever the spec looks wrong or incomplete;
- a card has come back three times without being finished;
- nobody has taken a card for 30 minutes while workers were idle;
- no worker on the team meets the card's minimum tier.

The question appears in the chat and on the card. Answer on the card, or just type in the chat if only one card is waiting. With several waiting, start the message with the card id, for example `c4: use JSON`.

Anything else you type while a goal is running becomes a new card for the team.

The goal **pauses** when the team has used its turn budget (60 turns) or plan-edit budget (40 edits), or when no worker can move any open card. Read the reason on the board, then press **Resume** or type `resume`.

## 8. Usage limits

When a CLI reports that its subscription limit is reached, every worker on that CLI and model leaves the team. Their cards go back to the board without counting as failures, and the work already on each card's branch is kept for whoever takes it next. The other workers carry on.

A worker rejoins by itself: at the reset time when the CLI gives one, otherwise after ten minutes, when it is given a turn to try. If it is still limited it leaves again.

If every worker is away, the goal waits and the board shows the earliest reset time.

Smith recognises a usage limit by matching the CLI's error text. If a CLI changes its wording, the turn is treated as an ordinary failure instead.

## 9. Finishing

When the goal is verified, the chat shows the diff summary of the session branch against its base branch, with two actions:

- **Merge into `<base>`** merges the session branch into the base branch in your repository. If that merge conflicts it is aborted and reported; nothing is left half-merged.
- **Discard uncommitted** resets uncommitted changes in the session worktree.

Deleting a session removes its worktrees and its board. The session branch stays in the repository.

## 10. Settings

- **Agent Binaries:** paths to `claude`, `codex` and `opencode`, with a check that each exists.
- **App & Workspace:** Git path, default repository path, server port, display currency.
- **Customizations** (sliders icon, per session): team conventions ("skills") added to every worker's instructions, and extra MCP servers started for Claude Code and OpenCode workers.

Settings are stored in `~/.smith/config.json`. Sessions, boards, chats and specs typed in the chat are under `~/.smith/`.

## 11. Cost figures

Claude Code reports real token usage for each turn, and Smith prices it from its pricing table. Codex and OpenCode turns report no usage, so they add nothing to the totals. The figure is an estimate of what the tokens would cost at list prices, not a charge.

## 12. Known limits

- Only Claude Code has been run end to end against the board. Codex and OpenCode are wired up from their documented options and may need adjusting.
- Agents run with their permission prompts disabled so they can work unattended. They can run commands and change files anywhere your user account can. Use repositories and machines where that is acceptable.
- The in-app terminal is a plain shell without a TTY. Logins that need one are better done in your own terminal.
- File scopes are checked when a card is submitted, not while the worker is editing.
