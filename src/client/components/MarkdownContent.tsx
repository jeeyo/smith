import React, { useMemo, useState } from 'react';
import { marked, type Token, type TokensList } from 'marked';
import DOMPurify from 'dompurify';
import { Code, Eye, Copy, Check } from 'lucide-react';
import { MermaidRenderer } from './ArtifactPreview.tsx';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

interface Segment {
  type: 'markdown' | 'mermaid' | 'code';
  language?: string;
  text: string;
}

export const InlineMermaid: React.FC<{ content: string }> = ({ content }) => {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-ink-200 bg-ink-0 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-ink-50 border-b border-ink-200 text-[11px] text-ink-600">
        <span className="font-mono flex items-center gap-1.5 text-ink-700 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-mint-400"></span>
          Mermaid Diagram
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCode(!showCode)}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-ink-100 text-ink-600 hover:text-ink-800 transition-colors"
            title={showCode ? 'View rendered diagram' : 'View diagram source'}
          >
            {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
            <span>{showCode ? 'Diagram' : 'Code'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-ink-100 text-ink-600 hover:text-ink-800 transition-colors"
            title="Copy diagram definition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-mint-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <div className="p-3 bg-ink-25 overflow-x-auto">
        {showCode ? (
          <pre className="font-mono text-xs text-ink-700 whitespace-pre-wrap p-2 m-0 bg-transparent border-0">
            {content}
          </pre>
        ) : (
          <MermaidRenderer content={content} />
        )}
      </div>
    </div>
  );
};

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  const segments = useMemo<Segment[]>(() => {
    if (!content) return [];

    const tokens = marked.lexer(content, { gfm: true, breaks: true });
    const parts: Segment[] = [];
    let pending: Token[] = [];
    const flush = () => {
      if (!pending.length) return;
      const group = Object.assign(pending, { links: tokens.links }) as TokensList;
      parts.push({ type: 'markdown', text: DOMPurify.sanitize(marked.parser(group, { gfm: true, breaks: true })) });
      pending = [];
    };
    for (const token of tokens) {
      if (token.type === 'code') {
        flush();
        const language = (token.lang || '').split(/\s/)[0];
        parts.push({ type: language === 'mermaid' ? 'mermaid' : 'code', language, text: token.text });
      } else pending.push(token);
    }
    flush();
    return parts;
  }, [content]);

  if (!content) return null;

  return (
    <div className={`markdown-body space-y-1 ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === 'mermaid') {
          return <InlineMermaid key={idx} content={seg.text} />;
        }

        if (seg.type === 'code') return <CodeBlock key={idx} content={seg.text} language={seg.language}/>;
        const html = seg.text;

        return (
          <div
            key={idx}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
};

const CodeBlock: React.FC<{ content: string; language?: string }> = ({ content, language }) => {
  const [copied, setCopied] = useState(false);
  return <div className="my-3 rounded-xl border border-ink-200 overflow-hidden">
    <div className="px-3 py-1.5 bg-ink-50 flex justify-between text-[11px] text-ink-500"><span>{language || 'Code'}</span><button type="button" aria-label="Copy code" onClick={async () => { try { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy'}</button></div>
    <pre className="!m-0 !border-0 !rounded-none overflow-x-auto"><code className={language ? `language-${language}` : undefined}>{content}</code></pre>
  </div>;
};
