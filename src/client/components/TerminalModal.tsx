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
  initialCommand = '',
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
          body: JSON.stringify({})
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
          setLines(prev => [...prev, `[Smith] Shell ${data.ptyId} attached (${data.command}). This is a plain shell without a TTY: commands that need one, such as some browser logins, are better run in your own terminal.`]);
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
          setLines(prev => [...prev, '[Smith] Shell disconnected.']);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-xs p-4">
      <div className="bg-ink-0 shadow-soft rounded-xl w-full max-w-3xl flex flex-col shadow-float overflow-hidden max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-ink-100 bg-ink-50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-ink-100 flex items-center justify-center text-ink-700 flex-shrink-0">
              <TerminalIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-ink-900 flex items-center gap-1.5 sm:gap-2">
                <span className="truncate max-w-[150px] sm:max-w-none">In-App Terminal · Agent Auth</span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-mint-400' : 'bg-butter-400'}`} />
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {onRefreshHealth && (
              <button
                onClick={onRefreshHealth}
                title="Re-probe agent auth & rate limits"
                className="flex items-center gap-1 px-2 py-1 rounded bg-ink-100 hover:bg-ink-200 text-ink-700 text-[11px] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">Probe Status</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1 rounded text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-3 sm:px-4 py-2 border-b border-ink-100 bg-ink-50 flex items-center gap-2 text-xs overflow-x-auto">
          <span className="text-ink-500 text-[11px] flex-shrink-0">Quick Run:</span>
          <button
            onClick={() => handleQuickCommand('claude login')}
            className="px-2 py-0.5 rounded bg-ink-100 hover:bg-ink-200 text-ink-800 font-mono text-[11px] transition-colors flex-shrink-0"
          >
            claude login
          </button>
          <button
            onClick={() => handleQuickCommand('codex --version')}
            className="px-2 py-0.5 rounded bg-ink-100 hover:bg-ink-200 text-ink-800 font-mono text-[11px] transition-colors flex-shrink-0"
          >
            codex --version
          </button>
          <button
            onClick={() => setLines([])}
            className="ml-auto text-[11px] text-ink-500 hover:text-ink-700 transition-colors flex-shrink-0"
          >
            Clear Screen
          </button>
        </div>

        {/* Terminal Screen */}
        <div className="flex-1 p-4 bg-ink-0 font-mono text-xs text-ink-800 overflow-y-auto min-h-[340px] max-h-[460px] whitespace-pre-wrap leading-relaxed select-text">
          {lines.map((chunk, idx) => (
            <span key={idx}>{chunk}</span>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* Terminal Input */}
        <form onSubmit={handleSend} className="p-3 border-t border-ink-100 bg-ink-50 flex items-center gap-2">
          <span className="text-ink-500 font-mono text-xs">$</span>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Type command and press Enter (e.g. claude login)..."
            className="flex-1 bg-ink-0 shadow-soft rounded px-3 py-1.5 text-xs text-ink-900 placeholder-ink-400 font-mono focus:outline-none focus:border-ink-400"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-lav-300 hover:bg-lav-200 text-lav-700 text-xs font-medium flex items-center gap-1 transition-colors"
          >
            <span>Send</span>
            <Send className="w-3 h-3" />
          </button>
        </form>
      </div>
    </div>
  );
};
