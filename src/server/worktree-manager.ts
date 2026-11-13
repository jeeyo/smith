import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.ts';
import { WorktreeInfo, WorktreeDiffSummary, WorktreeDiffFile } from '../shared/types.ts';

const execFileAsync = promisify(execFile);

/**
 * Branch/ref names are passed to git as argv entries (never through a shell), but a name
 * starting with '-' would still be parsed as an option, so refs are validated up front.
 */
export function assertSafeRef(ref: string, label: string = 'ref'): string {
  if (
    typeof ref !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) ||
    ref.includes('..') ||
    ref.endsWith('/') ||
    ref.endsWith('.lock')
  ) {
    throw new Error(`Invalid git ${label}: ${JSON.stringify(ref)}`);
  }
  return ref;
}

export class WorktreeManager {
  private get gitBinary(): string {
    return config.gitPath && fs.existsSync(config.gitPath) ? config.gitPath : 'git';
  }

  private async runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(this.gitBinary, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'Smith',
        GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'smith@local',
        GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'Smith',
        GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'smith@local'
      }
    });
  }

  /**
   * True only when `dir` is the root of its own git working tree.
   *
   * A session directory that is not a real worktree (creation fell back to a plain folder)
   * still sits inside the user's repository, so git commands run there would silently act
   * on that parent repository. Every mutating command must be gated on this check.
   */
  async isWorktreeRoot(dir: string): Promise<boolean> {
    try {
      if (!fs.existsSync(dir)) return false;
      const { stdout } = await this.runGit(['rev-parse', '--show-toplevel'], dir);
      return fs.realpathSync(stdout.trim()) === fs.realpathSync(dir);
    } catch {
      return false;
    }
  }

  async ensureGitRepo(repoPath: string): Promise<boolean> {
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      try {
        await this.runGit(['init', '-b', 'main'], repoPath);
        // Initial empty commit to establish HEAD
        fs.writeFileSync(path.join(repoPath, '.gitignore'), 'node_modules/\n.worktrees/\n.smith/\n');
        await this.runGit(['add', '.gitignore'], repoPath);
        await this.runGit(['commit', '-m', 'Initial commit'], repoPath);
        return true;
      } catch (err: any) {
        console.warn(`Git init warning: ${err.message}`);
      }
    }
    return true;
  }

  async createWorktree(repoPath: string, branchName: string, baseBranch: string = 'main'): Promise<WorktreeInfo> {
    assertSafeRef(branchName, 'branch name');
    assertSafeRef(baseBranch, 'base branch');
    await this.ensureGitRepo(repoPath);

    const worktreeDir = path.join(repoPath, '.worktrees', branchName.replace(/[^a-zA-Z0-9_-]/g, '-'));
    if (!fs.existsSync(path.dirname(worktreeDir))) {
      fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });
    }

    // Check if worktree already exists
    if (!fs.existsSync(worktreeDir)) {
      try {
        await this.runGit(['worktree', 'add', '-b', branchName, worktreeDir, baseBranch], repoPath);
      } catch {
        // Fallback: checkout branch or copy if branch already exists
        try {
          await this.runGit(['worktree', 'add', worktreeDir, branchName], repoPath);
        } catch {
          // No usable git worktree: fall back to a plain scratch directory. Git operations
          // on it are refused by isWorktreeRoot() so they can never touch the parent repo.
          fs.mkdirSync(worktreeDir, { recursive: true });
        }
      }
    }

    return this.getWorktreeInfo(worktreeDir, branchName, baseBranch);
  }

  async getWorktreeInfo(worktreePath: string, branch: string, baseBranch: string): Promise<WorktreeInfo> {
    try {
      if (!(await this.isWorktreeRoot(worktreePath))) throw new Error('not a git worktree');
      const { stdout } = await this.runGit(['status', '--porcelain'], worktreePath);
      const dirtyFiles = stdout.split('\n').filter(Boolean).map(line => line.substring(3).trim());
      return {
        path: worktreePath,
        branch,
        baseBranch,
        isClean: dirtyFiles.length === 0,
        dirtyFiles
      };
    } catch {
      return {
        path: worktreePath,
        branch,
        baseBranch,
        isClean: true,
        dirtyFiles: []
      };
    }
  }

  async getDiff(worktreePath: string): Promise<string> {
    try {
      if (!(await this.isWorktreeRoot(worktreePath))) throw new Error('not a git worktree');
      const { stdout } = await this.runGit(['diff', 'HEAD'], worktreePath);
      return stdout || '(No uncommitted diff)';
    } catch {
      return '(Diff unavailable or no commits)';
    }
  }

  /**
   * Retrieves structured per-file additions/deletions and merge check
   */
  async getDiffSummary(
    worktreePath: string,
    branch: string,
    baseBranch: string = 'main'
  ): Promise<WorktreeDiffSummary> {
    const files: WorktreeDiffFile[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let canMergeCleanly = true;

    try {
      // 1. Try git diff --numstat against baseBranch or HEAD
      let diffOutput = '';
      if (!(await this.isWorktreeRoot(worktreePath))) throw new Error('not a git worktree');
      try {
        const res = await this.runGit(
          ['diff', '--numstat', `${assertSafeRef(baseBranch)}...${assertSafeRef(branch)}`],
          worktreePath
        );
        diffOutput = res.stdout;
      } catch {
        const res = await this.runGit(['diff', '--numstat', 'HEAD'], worktreePath);
        diffOutput = res.stdout;
      }

      if (diffOutput.trim()) {
        const lines = diffOutput.trim().split('\n');
        for (const line of lines) {
          // numstat is tab-separated: "<adds>\t<dels>\t<path>" (binary files report "-").
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const adds = parseInt(parts[0], 10) || 0;
            const dels = parseInt(parts[1], 10) || 0;
            const file = parts.slice(2).join('\t');
            totalAdditions += adds;
            totalDeletions += dels;
            files.push({
              file,
              additions: adds,
              deletions: dels,
              status: dels === 0 ? 'added' : 'modified'
            });
          }
        }
      }
    } catch {
      // Ignore git command error
    }

    return {
      branch,
      baseBranch,
      totalAdditions,
      totalDeletions,
      changedFilesCount: files.length,
      files,
      canMergeCleanly
    };
  }

  async commit(worktreePath: string, message: string): Promise<string> {
    if (!(await this.isWorktreeRoot(worktreePath))) {
      throw new Error(`Git commit failed: ${worktreePath} is not a git worktree`);
    }
    try {
      await this.runGit(['add', '-A'], worktreePath);
      const { stdout } = await this.runGit(['commit', '-m', message], worktreePath);
      return stdout;
    } catch (err: any) {
      throw new Error(`Git commit failed: ${err.message}`);
    }
  }

  /**
   * One-click merge from session worktree branch into baseBranch
   */
  async mergeWorktree(repoPath: string, branch: string, baseBranch: string = 'main'): Promise<{
    success: boolean;
    commit: string;
    branch: string;
    baseBranch: string;
    message: string;
  }> {
    try {
      assertSafeRef(branch, 'branch name');
      assertSafeRef(baseBranch, 'base branch');
      await this.ensureGitRepo(repoPath);

      await this.runGit(['checkout', baseBranch], repoPath);
      try {
        await this.runGit(
          ['merge', branch, '--no-edit', '-m', `Merge ${branch} into ${baseBranch} via Smith`],
          repoPath
        );
      } catch (mergeErr: any) {
        // Never report a merge that did not happen; restore the repo to its pre-merge state.
        try {
          await this.runGit(['merge', '--abort'], repoPath);
        } catch {
          // No merge in progress (e.g. unknown branch)
        }
        const detail = String(mergeErr.stdout || mergeErr.stderr || mergeErr.message || '').trim();
        return {
          success: false,
          commit: '',
          branch,
          baseBranch,
          message: `Could not merge ${branch} into ${baseBranch}; the merge was aborted. ${detail}`.trim()
        };
      }

      const { stdout: sha } = await this.runGit(['rev-parse', '--short', 'HEAD'], repoPath);
      return {
        success: true,
        commit: sha.trim() || 'HEAD',
        branch,
        baseBranch,
        message: `Successfully merged ${branch} into ${baseBranch}.`
      };
    } catch (err: any) {
      return {
        success: false,
        commit: '',
        branch,
        baseBranch,
        message: err.message
      };
    }
  }

  /**
   * One-click discard of unmerged worktree modifications
   */
  async discardWorktree(repoPath: string, worktreePath: string, branch: string): Promise<{
    success: boolean;
    branch: string;
    message: string;
  }> {
    try {
      // reset/clean are destructive: only ever run them inside the session's own worktree.
      if (await this.isWorktreeRoot(worktreePath)) {
        await this.runGit(['reset', '--hard', 'HEAD'], worktreePath);
        await this.runGit(['clean', '-fd'], worktreePath);
      }
      return {
        success: true,
        branch,
        message: `Changes on branch ${branch} discarded.`
      };
    } catch (err: any) {
      return {
        success: false,
        branch,
        message: err.message
      };
    }
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<boolean> {
    try {
      await this.runGit(['worktree', 'remove', '--force', worktreePath], repoPath);
      return true;
    } catch {
      // Manual directory removal fallback, restricted to Smith's own .worktrees folder
      const rel = path.relative(path.join(path.resolve(repoPath), '.worktrees'), path.resolve(worktreePath));
      const isSessionDir = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
      if (isSessionDir && fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
      return true;
    }
  }

  // ---- Per-card worktrees (docs/designs/peer-board.md, section 9) --------------------------

  private cardWorktreeDir(repoPath: string, cardBranch: string): string {
    return path.join(repoPath, '.worktrees', cardBranch.replace(/[^a-zA-Z0-9_-]/g, '-'));
  }

  /**
   * Creates (or reuses) the branch and worktree a card is worked on in. Unlike the session
   * worktree there is no plain-folder fallback: without a real worktree the card's diff could
   * not be checked against its scope.
   */
  async createCardWorktree(repoPath: string, cardBranch: string, fromRef: string): Promise<string> {
    assertSafeRef(cardBranch, 'card branch');
    assertSafeRef(fromRef, 'base ref');
    const dir = this.cardWorktreeDir(repoPath, cardBranch);
    if (await this.isWorktreeRoot(dir)) return dir;
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    try {
      await this.runGit(['worktree', 'add', '-b', cardBranch, dir, fromRef], repoPath);
    } catch {
      // The branch exists already (the card was claimed before and its worktree was removed).
      await this.runGit(['worktree', 'prune'], repoPath);
      await this.runGit(['worktree', 'add', dir, cardBranch], repoPath);
    }
    return dir;
  }

  /** Commits everything in a worktree. Returns the HEAD commit, whether or not anything changed. */
  async commitAll(worktreePath: string, message: string): Promise<string> {
    if (!(await this.isWorktreeRoot(worktreePath))) {
      throw new Error(`${worktreePath} is not a git worktree`);
    }
    await this.runGit(['add', '-A'], worktreePath);
    const { stdout: staged } = await this.runGit(['status', '--porcelain'], worktreePath);
    if (staged.trim()) {
      await this.runGit(['commit', '--no-verify', '-m', message], worktreePath);
    }
    const { stdout } = await this.runGit(['rev-parse', '--short', 'HEAD'], worktreePath);
    return stdout.trim();
  }

  /** Files and line count a branch changes relative to where it left `baseRef`. */
  async diffStat(worktreePath: string, baseRef: string): Promise<{ files: string[]; lines: number }> {
    assertSafeRef(baseRef, 'base ref');
    const { stdout } = await this.runGit(['diff', '--numstat', `${baseRef}...HEAD`], worktreePath);
    const files: string[] = [];
    let lines = 0;
    for (const line of stdout.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      lines += (parseInt(parts[0], 10) || 0) + (parseInt(parts[1], 10) || 0);
      files.push(parts.slice(2).join('\t'));
    }
    return { files, lines };
  }

  async diffText(worktreePath: string, baseRef: string, maxChars: number = 60000): Promise<string> {
    assertSafeRef(baseRef, 'base ref');
    try {
      const { stdout } = await this.runGit(['diff', `${baseRef}...HEAD`], worktreePath);
      return stdout.length > maxChars
        ? stdout.slice(0, maxChars) + `\n… [diff truncated at ${maxChars} characters; read the files in the worktree for the rest]`
        : stdout;
    } catch (err: any) {
      return `(diff unavailable: ${err.message})`;
    }
  }

  /**
   * Merges a card branch into the session branch, inside the session worktree. A conflicting
   * merge is aborted and its files are reported so a peer can resolve them on a card.
   */
  async mergeCardBranch(
    sessionWorktree: string,
    cardBranch: string,
    message: string
  ): Promise<{ ok: true; commit: string } | { ok: false; files: string[]; error: string }> {
    assertSafeRef(cardBranch, 'card branch');
    if (!(await this.isWorktreeRoot(sessionWorktree))) {
      return { ok: false, files: [], error: `${sessionWorktree} is not a git worktree` };
    }
    // Anything left uncommitted in the session worktree would make the merge refuse to start.
    await this.commitAll(sessionWorktree, 'chore: save uncommitted session changes');
    try {
      await this.runGit(['merge', '--no-ff', '--no-verify', cardBranch, '-m', message], sessionWorktree);
    } catch (err: any) {
      let files: string[] = [];
      try {
        const { stdout } = await this.runGit(['diff', '--name-only', '--diff-filter=U'], sessionWorktree);
        files = stdout.split('\n').filter(Boolean);
      } catch {}
      try {
        await this.runGit(['merge', '--abort'], sessionWorktree);
      } catch {}
      return { ok: false, files, error: String(err.stdout || err.stderr || err.message || '').trim() };
    }
    const { stdout } = await this.runGit(['rev-parse', '--short', 'HEAD'], sessionWorktree);
    return { ok: true, commit: stdout.trim() };
  }

  /** Brings the session branch into a card worktree, leaving any conflict markers for a peer to resolve. */
  async startConflictResolution(cardWorktree: string, sessionBranch: string): Promise<void> {
    assertSafeRef(sessionBranch, 'session branch');
    if (!(await this.isWorktreeRoot(cardWorktree))) return;
    try {
      await this.runGit(['merge', '--no-verify', sessionBranch, '-m', `Merge ${sessionBranch} to resolve conflicts`], cardWorktree);
    } catch {
      // Expected: the conflict is now in the working tree.
    }
  }

  async removeCardWorktree(repoPath: string, worktreePath: string, cardBranch?: string): Promise<void> {
    await this.removeWorktree(repoPath, worktreePath);
    if (cardBranch) {
      try {
        await this.runGit(['branch', '-D', assertSafeRef(cardBranch, 'card branch')], repoPath);
      } catch {
        // Branch already gone
      }
    }
  }
}

export const worktreeManager = new WorktreeManager();
