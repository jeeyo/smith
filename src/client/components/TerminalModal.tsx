import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, RefreshCw, Send, Play, ShieldAlert } from 'lucide-react';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCommand?: string;
  onRefreshHealth?: () => void;
}

export const TerminalModal: React.FC<TerminalModalProps> = ({
  isOpen,
  onClose,
  initialCommand = 'claude login',
  onRefreshHealth
}) => {
  const [ptyId, setPtyId] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (ptyId) {
        fetch(`/api/v1/system/pty/${ptyId}`, { method: 'DELETE' }).catch(() => {});
        setPtyId(null);
      }
      setLines([]);
      return;
    }

    let active = true;

    async function initPty() {
      try {
        const res = await fetch('/api/v1/system/pty/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'powershell.exe' })
        });
        const data = await res.json();
        if (!active) return;
        setPtyId(data.ptyId);

        // Connect WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/pty/${data.ptyId}`);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setLines(prev => [...prev, `[Smith ConPTY] Interactive Terminal session ${data.ptyId} attached.`]);
          if (initialCommand) {
            setTimeout(() => {
              ws.send(JSON.stringify({ type: 'input', data: `${initialCommand}\r\n` }));
            }, 600);
          }
        };

        ws.onmessage = (evt) => {
          try {
            const parsed = JSON.parse(evt.data);
            if (parsed.type === 'pty:data') {
              setLines(prev => [...prev, parsed.data]);
            }
          } catch {
            setLines(prev => [...prev, evt.data]);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          setLines(prev => [...prev, '[Smith ConPTY] Terminal session disconnected.']);
        };
      } catch (err: any) {
        setLines(prev => [...prev, `[Smith Error] Failed to create PTY: ${err.message}`]);
      }
    }

    initPty();

    return () => {
      active = false;
      if (wsRef.current) wsRef.current.close();
    };
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!wsRef.current || !inputVal.trim()) return;
    const text = inputVal;
    setInputVal('');
    wsRef.current.send(JSON.stringify({ type: 'input', data: `${text}\r\n` }));
  };

  const handleQuickCommand = (cmd: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'input', data: `${cmd}\r\n` }));
  };

  const handleClose = () => {
    if (onRefreshHealth) onRefreshHealth();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-zinc-300 flex-shrink-0">
              <TerminalIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5 sm:gap-2">
                <span className="truncate max-w-[150px] sm:max-w-none">In-App Terminal · Agent Auth</span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {onRefreshHealth && (
              <button
                onClick={onRefreshHealth}
                title="Re-probe agent auth & rate limits"
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">Probe Status</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-3 sm:px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/40 flex items-center gap-2 text-xs overflow-x-auto">
          <span className="text-zinc-500 text-[11px] flex-shrink-0">Quick Run:</span>
          <button
            onClick={() => handleQuickCommand('claude login')}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-[11px] transition-colors flex-shrink-0"
          >
            claude login
          </button>
          <button
            onClick={() => handleQuickCommand('codex --version')}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-[11px] transition-colors flex-shrink-0"
          >
            codex --version
          </button>
          <button
            onClick={() => setLines([])}
            className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
          >
            Clear Screen
          </button>
        </div>

        {/* Terminal Screen */}
        <div className="flex-1 p-4 bg-zinc-950 font-mono text-xs text-zinc-200 overflow-y-auto min-h-[340px] max-h-[460px] whitespace-pre-wrap leading-relaxed select-text">
          {lines.map((chunk, idx) => (
            <span key={idx}>{chunk}</span>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* Terminal Input */}
        <form onSubmit={handleSend} className="p-3 border-t border-zinc-800 bg-zinc-900/70 flex items-center gap-2">
          <span className="text-zinc-500 font-mono text-xs">$</span>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Type command and press Enter (e.g. claude login)..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-zinc-100 text-zinc-900 text-xs font-medium flex items-center gap-1 transition-colors"
          >
            <span>Send</span>
            <Send className="w-3 h-3" />
          </button>
        </form>
      </div>
    </div>
  );
};
