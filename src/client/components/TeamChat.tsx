import React, { useState } from 'react';
import { MessageSquare, Send, AlertTriangle, ShieldAlert, Sparkles, User, Info } from 'lucide-react';
import { TeamMessage, TeamMessageType } from '../../shared/types.ts';

interface TeamChatProps {
  messages: TeamMessage[];
  onSendMessage: (type: TeamMessageType, content: string) => void;
}

export const TeamChat: React.FC<TeamChatProps> = ({ messages, onSendMessage }) => {
  const [content, setContent] = useState('');
  const [type, setType] = useState<TeamMessageType>('intent');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSendMessage(type, content.trim());
    setContent('');
  };

  const getTypeBadge = (msgType: TeamMessageType) => {
    switch (msgType) {
      case 'intent':
        return <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[10px] font-semibold uppercase">Intent</span>;
      case 'hazard':
        return <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-semibold uppercase flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Hazard</span>;
      case 'anti_pattern':
        return <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-semibold uppercase flex items-center gap-1"><ShieldAlert className="w-2.5 h-2.5" /> Anti-Pattern</span>;
      case 'request':
        return <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800 text-[10px] font-semibold uppercase">Request</span>;
      case 'handoff':
        return <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-semibold uppercase">Handoff</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-semibold uppercase">Info</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <span>Inter-Agent Team Broadcast Bus</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Agents exchange real-time intents, hazard alerts, and anti-pattern lessons (arXiv:2610.22319).</p>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">No team messages broadcasted yet.</div>
        ) : (
          messages.map(m => (
            <div
              key={m.id}
              className={`p-3.5 rounded-xl border text-xs leading-relaxed transition-all ${
                m.type === 'anti_pattern'
                  ? 'bg-rose-950/20 border-rose-800/60 text-rose-200'
                  : m.type === 'hazard'
                  ? 'bg-amber-950/20 border-amber-800/60 text-amber-200'
                  : 'bg-slate-950/60 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-300 capitalize flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>{m.sender}</span>
                  </span>
                  {getTypeBadge(m.type)}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>

              {/* Anti-Pattern Solution Banner */}
              {m.metadata?.antiPattern && (
                <div className="mt-2 p-2 rounded-lg bg-slate-900/90 border border-rose-800/40 text-[11px] text-slate-300">
                  <div className="text-rose-400 font-semibold mb-0.5">Discovered Anti-Pattern Lesson:</div>
                  <div><strong>Error:</strong> {m.metadata.antiPattern.error}</div>
                  <div className="text-emerald-400 mt-0.5"><strong>Fix / Prevention:</strong> {m.metadata.antiPattern.solution}</div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Broadcast Form */}
      <form onSubmit={handleSend} className="pt-3 border-t border-slate-800 flex items-center gap-2">
        <select
          value={type}
          onChange={e => setType(e.target.value as any)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-sky-500 uppercase font-semibold"
        >
          <option value="intent">Intent</option>
          <option value="request">Request</option>
          <option value="hazard">Hazard</option>
          <option value="anti_pattern">Anti-Pattern</option>
          <option value="info">Info</option>
        </select>
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Broadcast intent, task handoff, or warning to all agents..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={!content.trim()}
          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-sky-500/20 transition-all flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" /> Broadcast
        </button>
      </form>
    </div>
  );
};
