import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getSession } from './sessions.router.ts';
import { worktreeManager } from '../worktree-manager.ts';
import { ArtifactType, MessageArtifact } from '../../shared/types.ts';

export const worktreeRouter = Router();

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.mermaid': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

export function classifyArtifactType(extOrPath: string): ArtifactType {
  const ext = path.extname(extOrPath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) return 'image';
  if (['.mmd', '.mermaid'].includes(ext)) return 'mermaid';
  if (['.html', '.htm'].includes(ext)) return 'html';
  return 'other';
}

worktreeRouter.get('/sessions/:id/worktree', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const info = await worktreeManager.getWorktreeInfo(
    session.worktree.path,
    session.worktree.branch,
    session.worktree.baseBranch
  );

  res.json(info);
});

worktreeRouter.get('/sessions/:id/worktree/diff', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const diff = await worktreeManager.getDiff(session.worktree.path);
  res.json({
    sessionId: session.id,
    branch: session.worktree.branch,
    diff
  });
});

worktreeRouter.get('/sessions/:id/worktree/summary', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const touchedFiles = Object.values(session.tasks).flatMap(t => t.fileScope);
  const summary = await worktreeManager.getDiffSummary(
    session.worktree.path,
    session.worktree.branch,
    session.worktree.baseBranch,
    touchedFiles
  );

  res.json(summary);
});

/**
 * Serves or downloads a file from the session's worktree with proper Content-Type & security traversal checks.
 */
worktreeRouter.get('/sessions/:id/worktree/file', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const reqPath = req.query.path as string;
  if (!reqPath) return res.status(400).json({ error: 'path query parameter is required' });

  // Resolve inside worktree or fallback to repoPath
  let fullPath = path.isAbsolute(reqPath) ? reqPath : path.resolve(session.worktree.path, reqPath);
  if (!fs.existsSync(fullPath)) {
    fullPath = path.resolve(session.repoPath, reqPath);
  }

  // Prevent path traversal
  const normWorktree = path.resolve(session.worktree.path);
  const normRepo = path.resolve(session.repoPath);
  const normTarget = path.resolve(fullPath);

  if (!normTarget.startsWith(normWorktree) && !normTarget.startsWith(normRepo)) {
    return res.status(403).json({ error: 'Access denied: path outside session workspace' });
  }

  if (!fs.existsSync(normTarget) || fs.statSync(normTarget).isDirectory()) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(normTarget).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);

  if (req.query.download === 'true' || req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(normTarget)}"`);
  }

  res.sendFile(normTarget);
});

/**
 * Lists generated artifacts in the session worktree.
 */
worktreeRouter.get('/sessions/:id/worktree/artifacts', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const artifacts: MessageArtifact[] = [];
  const searchDirs = [session.worktree.path, path.join(session.worktree.path, 'artifacts'), path.join(session.worktree.path, 'dist')];

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) {
            const ext = path.extname(e.name).toLowerCase();
            const filePath = path.join(dir, e.name);
            const stats = fs.statSync(filePath);
            const type = classifyArtifactType(ext);

            artifacts.push({
              id: `art-${e.name}-${stats.mtimeMs}`,
              name: e.name,
              path: path.relative(session.worktree.path, filePath),
              type,
              mimeType: MIME_MAP[ext] || 'application/octet-stream',
              sizeBytes: stats.size,
              url: `/api/v1/sessions/${session.id}/worktree/file?path=${encodeURIComponent(path.relative(session.worktree.path, filePath))}`
            });
          }
        }
      } catch {}
    }
  }

  res.json({ sessionId: session.id, count: artifacts.length, artifacts });
});

worktreeRouter.post('/sessions/:id/worktree/commit', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'commit message is required' });

  try {
    const output = await worktreeManager.commit(session.worktree.path, message);
    res.json({ status: 'committed', message, output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

worktreeRouter.post('/sessions/:id/worktree/merge', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const result = await worktreeManager.mergeWorktree(
    session.repoPath,
    session.worktree.branch,
    session.worktree.baseBranch || 'main'
  );

  res.json(result);
});

worktreeRouter.post('/sessions/:id/worktree/discard', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const result = await worktreeManager.discardWorktree(
    session.repoPath,
    session.worktree.path,
    session.worktree.branch
  );

  res.json(result);
});
