import { EventEmitter } from 'node:events';
import { spawn, ChildProcess } from 'node:child_process';

export interface PTYSession {
  id: string;
  sessionId: string;
  process: ChildProcess;
  cwd: string;
  shell: string;
}

export class PTYManager extends EventEmitter {
  private ptys: Map<string, PTYSession> = new Map();

  createPTY(id: string, sessionId: string, cwd: string, shellCmd?: string): PTYSession {
    const isWin = process.platform === 'win32';
    const shell = shellCmd || (isWin ? 'powershell.exe' : process.env.SHELL || '/bin/zsh');

    const proc = spawn(shell, [], {
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      },
      shell: false
    });

    const ptySession: PTYSession = {
      id,
      sessionId,
      process: proc,
      cwd,
      shell
    };

    this.ptys.set(id, ptySession);

    proc.stdout?.on('data', (data: Buffer) => {
      this.emit('pty:data', { ptyId: id, sessionId, data: data.toString() });
    });

    proc.stderr?.on('data', (data: Buffer) => {
      this.emit('pty:data', { ptyId: id, sessionId, data: data.toString() });
    });

    // Without these listeners a failed spawn (bad command/cwd) or a write to a dead shell
    // surfaces as an uncaught 'error' event and takes the whole server down.
    proc.on('error', (err: Error) => {
      this.ptys.delete(id);
      this.emit('pty:data', { ptyId: id, sessionId, data: `\r\n[failed to start ${shell}: ${err.message}]\r\n` });
      this.emit('pty:exit', { ptyId: id, sessionId, code: null });
    });
    proc.stdin?.on('error', () => {});

    proc.on('exit', (code: number | null) => {
      this.ptys.delete(id);
      this.emit('pty:exit', { ptyId: id, sessionId, code });
    });

    return ptySession;
  }

  writePTY(ptyId: string, input: string) {
    const session = this.ptys.get(ptyId);
    if (session && session.process.stdin?.writable) {
      session.process.stdin.write(input);
    }
  }

  resizePTY(ptyId: string, cols: number, rows: number) {
    // Stdio process resize hook
    this.emit('pty:resize', { ptyId, cols, rows });
  }

  terminatePTY(ptyId: string) {
    const session = this.ptys.get(ptyId);
    if (session && !session.process.killed) {
      session.process.kill();
      this.ptys.delete(ptyId);
    }
  }

  getPTY(ptyId: string): PTYSession | undefined {
    return this.ptys.get(ptyId);
  }
}

export const ptyManager = new PTYManager();
