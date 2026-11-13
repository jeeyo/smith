import React, { useEffect, useRef, useState } from 'react';
import { X, Send, LoaderCircle } from 'lucide-react';
import type { DiscoveredModel, SmithChat } from '../../shared/types.ts';
import { MarkdownContent } from './MarkdownContent.tsx';

export const SmithAssistant: React.FC<{
  isOpen: boolean; onClose: () => void; sessionId?: string; models: DiscoveredModel[];
  initialRequest?: { id: number; message: string }; onChanged: (sessionId?: string) => Promise<void>;
}> = ({ isOpen, onClose, sessionId, models, initialRequest, onChanged }) => {
  const [chat, setChat] = useState<SmithChat | null>(null);
  const [input, setInput] = useState('');
  const [harness, setHarness] = useState('claude');
  const [model, setModel] = useState('sonnet');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const handledRequest = useRef<number | undefined>(undefined);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  useEffect(() => {
    const id = localStorage.getItem('smith_assistant_chat');
    if (id) fetch(`/api/v1/assistant/chats/${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then(setChat).catch(() => {}).finally(() => setHistoryLoaded(true));
    else setHistoryLoaded(true);
  }, []);
  useEffect(() => {
    if (!chat?.running) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/assistant/chats/${chat.id}`);
        if (!response.ok) throw new Error('Could not load the request.');
        const next: SmithChat = await response.json();
        if (!active) return;
        setChat(next); setError('');
        if (!next.running) await onChanged(next.sessionId);
      } catch (err: any) { if (active) setError(err.message); }
    }, 1200);
    return () => { active = false; clearInterval(timer); };
  }, [chat?.id, chat?.running]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat?.messages.length, chat?.actions?.length, isOpen]);
  const sendMessage = async (message: string) => {
    if (!message.trim() || sending || chat?.running) return;
    setSending(true); setError('');
    try {
      const response = await fetch('/api/v1/assistant/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim(), chatId: chat?.id, sessionId, harness, model }) });
      const next = await response.json(); if (!response.ok) throw new Error(next.error);
      setChat(next); localStorage.setItem('smith_assistant_chat', next.id); setInput('');
    } catch (err: any) { setError(err.message); }
    finally { setSending(false); }
  };
  useEffect(() => {
    if (!initialRequest || handledRequest.current === initialRequest.id || !historyLoaded) return;
    setInput(initialRequest.message);
    if (sending || chat?.running) return;
    handledRequest.current = initialRequest.id;
    void sendMessage(initialRequest.message);
  }, [initialRequest?.id, historyLoaded, chat?.running, sending]);
  if (!isOpen) return null;
  const send = (event: React.FormEvent) => { event.preventDefault(); void sendMessage(input); };
  const busy = sending || chat?.running;
  const defaults: Record<string, string> = { claude: 'sonnet', codex: 'gpt-6.1-sol', opencode: 'agoda/glm-5.2' };
  return <div className="fixed inset-0 z-50 bg-ink-900/20 flex items-center justify-center p-3 md:p-6">
    <section role="dialog" aria-modal="true" aria-labelledby="smith-assistant-title" className="bg-ink-0 shadow-float rounded-2xl flex flex-col w-full max-w-3xl h-[min(800px,90dvh)]">
      <header className="p-4 border-b border-ink-100 flex justify-between gap-3">
        <div><h2 id="smith-assistant-title" className="font-semibold">Ask Smith</h2><p className="text-xs text-ink-500 mt-1">Create sessions, choose workers, install skills and connect tools.</p></div>
        <button onClick={onClose} aria-label="Close Ask Smith" className="p-1"><X size={18}/></button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {!chat?.messages.length && <div className="text-sm text-ink-500 space-y-3">
          <p>Tell Smith what to set up. For example:</p>
          <button className="text-left p-3 rounded-xl bg-lav-50 w-full" onClick={() => setInput('Start a session on main branch in this folder /path/to/repo with 2 Claude Sonnets and 1 GPT 6.1 Sol')}>Start a session on main in a folder with 2 Claude Sonnets and 1 GPT 6.1 Sol</button>
          <button className="text-left p-3 rounded-xl bg-lav-50 w-full" onClick={() => setInput('Install this skill /path/to/skill to this session')}>Install a skill from a URL or local path to this session</button>
        </div>}
        {chat?.messages.map((message, index) => <article key={index} className={`p-3 rounded-xl ${message.role === 'user' ? 'bg-lav-50' : 'bg-ink-25'}`}>
          <div className="text-[10px] uppercase text-ink-400 mb-1">{message.role === 'user' ? 'You' : 'Smith'}</div>
          <MarkdownContent content={message.content}/>
        </article>)}
        {!!chat?.actions?.length && <p className="text-xs text-ink-500" aria-live="polite">Completed: {chat.actions.join(', ')}</p>}
        {chat?.running && <p role="status" className="text-sm text-ink-500 flex gap-2 items-center"><LoaderCircle size={14} className="animate-spin"/> Smith is working…</p>}
        {(error || chat?.error) && <p role="alert" className="text-sm text-rose-700">{error || chat?.error}</p>}
        <div ref={bottom}/>
      </div>
      <form onSubmit={send} className="p-4 border-t border-ink-100 space-y-3">
        <div className="flex gap-2 text-xs items-center flex-wrap">
          <label>Assistant <select aria-label="Assistant harness" value={harness} disabled={busy} onChange={e => { setHarness(e.target.value); setModel(defaults[e.target.value]); }} className="p-1 rounded bg-ink-50"><option value="claude">Claude</option><option value="codex">Codex</option><option value="opencode">OpenCode</option></select></label>
          <input aria-label="Assistant model" value={model} onChange={e => setModel(e.target.value)} disabled={busy} list="smith-assistant-models" className="px-2 py-1 rounded bg-ink-50 min-w-0"/>
          <datalist id="smith-assistant-models">{models.filter(m => m.agentId === harness).map(m => <option key={m.id} value={m.id}/>)}</datalist>
          <button type="button" disabled={busy} onClick={() => { setChat(null); setError(''); localStorage.removeItem('smith_assistant_chat'); }} className="ml-auto text-ink-500 disabled:opacity-50">New chat</button>
        </div>
        <div className="flex gap-2"><textarea aria-label="Message Smith" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask Smith to create a session or install a skill…" rows={3} className="flex-1 min-w-0 bg-ink-50 rounded-xl p-3 text-sm focus:outline-lav-300" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/><button type="submit" disabled={!!busy || !input.trim()} aria-label="Send to Smith" className="px-4 bg-lav-200 rounded-xl text-lav-700 disabled:opacity-50"><Send size={18}/></button></div>
      </form>
    </section>
  </div>;
};
