import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { config } from './config.ts';
import { addSkill, globalSkills } from './catalog.ts';
import { getSession, sessionStore } from './session-store.ts';
import { localPath } from './workspace.ts';
import type { Skill } from '../shared/types.ts';

const exec = promisify(execFile);
const MAX_BYTES = 10 * 1024 * 1024;

function copyPackage(source: string, target: string) {
  let bytes = 0, files = 0;
  const hash = crypto.createHash('sha256');
  function copy(from: string, to: string) {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error('Skill packages may not contain symlinks.');
    if (stat.isDirectory()) {
      fs.mkdirSync(to, { recursive: true, mode: 0o700 });
      for (const name of fs.readdirSync(from).sort()) {
        if (['.git', 'node_modules', '.DS_Store', '__pycache__'].includes(name)) continue;
        copy(path.join(from, name), path.join(to, name));
      }
    } else if (stat.isFile()) {
      bytes += stat.size; files++;
      if (bytes > MAX_BYTES || files > 1000) throw new Error('Skill package exceeds 10 MiB or 1,000 files.');
      const content = fs.readFileSync(from);
      hash.update(JSON.stringify([path.relative(source, from), stat.mode & 0o100, content.length]));
      hash.update(content);
      fs.writeFileSync(to, content);
      fs.chmodSync(to, stat.mode & 0o100 ? 0o700 : 0o600);
    } else throw new Error('Skill packages may contain only regular files and directories.');
  }
  copy(source, target);
  return hash.digest('hex').slice(0, 16);
}

function repositorySource(source: URL): { repository: string; ref?: string; subpath: string } | null {
  const parts = source.pathname.split('/').filter(Boolean);
  if (source.hostname === 'github.com' && parts.length >= 2) {
    const [owner, repo, kind, ref, ...rest] = parts;
    if (kind && !['tree', 'blob'].includes(kind)) return null;
    const subpath = rest.join('/');
    return { repository: `https://github.com/${owner}/${repo.replace(/\.git$/, '')}.git`, ref, subpath: kind === 'blob' ? path.posix.dirname(subpath) : subpath };
  }
  if (source.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
    const [owner, repo, ref, ...rest] = parts;
    return { repository: `https://github.com/${owner}/${repo}.git`, ref, subpath: path.posix.dirname(rest.join('/')) };
  }
  const tree = source.pathname.match(/^(.*?)\/-\/(tree|blob)\/([^/]+)\/(.*)$/);
  if (tree) return { repository: `${source.origin}${tree[1]}.git`, ref: tree[3], subpath: tree[2] === 'blob' ? path.posix.dirname(tree[4]) : tree[4] };
  return source.pathname.endsWith('.git') ? { repository: source.href, subpath: '' } : null;
}

/** Copies the complete package; importing never executes a downloaded script. */
export async function installSkill(source: string, sessionId?: string): Promise<Skill> {
  if (typeof source !== 'string' || !source.trim()) throw new Error('A skill URL or local path is required.');
  const session = sessionId ? getSession(sessionId) : undefined;
  if (sessionId && !session) throw new Error('Session not found.');
  source = source.trim();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-skill-'));
  try {
    let directory: string;
    if (/^https?:\/\//i.test(source)) {
      const url = new URL(source);
      if (url.username || url.password) throw new Error('Use a skill URL without embedded credentials.');
      const repository = repositorySource(url);
      if (repository) {
        const clone = path.join(temporary, 'repository');
        const args = ['clone', '--depth', '1', '--single-branch', ...(repository.ref ? ['--branch', repository.ref] : []), '--', repository.repository, clone];
        await exec(config.gitPath || 'git', args, { timeout: 60000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' } });
        directory = path.resolve(clone, repository.subpath);
        if (path.relative(fs.realpathSync(clone), fs.realpathSync(directory)).startsWith('..')) throw new Error('Skill path escapes the repository.');
      } else {
        const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Skill download returned HTTP ${response.status}.`);
        if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Skill is too large.');
        const chunks: Uint8Array[] = []; let bytes = 0;
        if (!response.body) throw new Error('Skill download was empty.');
        const reader = response.body.getReader();
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          bytes += chunk.byteLength;
          if (bytes > MAX_BYTES) throw new Error('Skill is too large.');
          chunks.push(chunk);
        }
        directory = path.join(temporary, 'download'); fs.mkdirSync(directory);
        fs.writeFileSync(path.join(directory, 'SKILL.md'), Buffer.concat(chunks));
      }
    } else {
      const input = localPath(source);
      const stat = fs.lstatSync(input);
      if (stat.isSymbolicLink()) throw new Error('Choose the actual skill file or directory, not a symlink.');
      directory = stat.isDirectory() ? input : path.dirname(input);
      if (stat.isFile() && path.basename(input) !== 'SKILL.md') throw new Error('A skill file must be named SKILL.md.');
    }
    if (fs.lstatSync(directory).isSymbolicLink() || fs.lstatSync(path.join(directory, 'SKILL.md')).isSymbolicLink()) throw new Error('Skill packages may not contain symlinks.');
    const markdown = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8');
    if (!markdown.trim() || Buffer.byteLength(markdown) > 1024 * 1024) throw new Error('SKILL.md must be nonempty and at most 1 MiB.');
    const front = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const metadata = front ? parse(front[1], { maxAliasCount: 0 }) : {};
    const title = typeof metadata?.name === 'string' ? metadata.name : path.basename(directory);
    const slug = title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'imported-skill';
    const digest = crypto.createHash('sha256').update(source).digest('hex').slice(0, 10);
    const id = `${slug}-${digest}`;
    const bundleRoot = path.join(config.storageDir, 'skills'); fs.mkdirSync(bundleRoot, { recursive: true, mode: 0o700 });
    const instructions = front ? markdown.slice(front[0].length).trim() : markdown.trim();
    if (!instructions) throw new Error('SKILL.md must contain instructions after its frontmatter.');
    const staging = fs.mkdtempSync(path.join(bundleRoot, '.import-'));
    let destination: string;
    try {
      destination = path.join(bundleRoot, `${id}-${copyPackage(directory, staging)}`);
      if (fs.existsSync(destination)) fs.rmSync(staging, { recursive: true, force: true });
      else fs.renameSync(staging, destination);
    } catch (err) { fs.rmSync(staging, { recursive: true, force: true }); throw err; }
    const skill: Skill = { id, name: title, description: String(metadata?.description || ''), source, path: destination, instructions, enabled: true };
    addSkill(skill);
    if (session) {
      if (!session.customizations.skills.includes(id)) session.customizations.skills.push(id);
      sessionStore.save(session);
    }
    return globalSkills.get(id)!;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
