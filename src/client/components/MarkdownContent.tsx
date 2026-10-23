import React, { useMemo, useState } from 'react';
import { marked } from 'marked';
import { Code, Eye, Copy, Check } from 'lucide-react';
import { MermaidRenderer } from './ArtifactPreview.tsx';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

interface Segment {
  type: 'markdown' | 'mermaid';
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
    <div className="my-3 rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800 text-[11px] text-zinc-400">
        <span className="font-mono flex items-center gap-1.5 text-zinc-300 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Mermaid Diagram
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCode(!showCode)}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={showCode ? 'View rendered diagram' : 'View diagram source'}
          >
            {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
            <span>{showCode ? 'Diagram' : 'Code'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Copy diagram definition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <div className="p-3 bg-zinc-950/60 overflow-x-auto">
        {showCode ? (
          <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap p-2 m-0 bg-transparent border-0">
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

    const regex = /```mermaid[^\n]*\n([\s\S]*?)```/g;
    const parts: Segment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'markdown',
          text: content.substring(lastIndex, match.index)
        });
      }
      parts.push({
        type: 'mermaid',
        text: match[1].trim()
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'markdown',
        text: content.substring(lastIndex)
      });
    }

    return parts;
  }, [content]);

  if (!content) return null;

  return (
    <div className={`markdown-body space-y-1 ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === 'mermaid') {
          return <InlineMermaid key={idx} content={seg.text} />;
        }

        const html = marked.parse(seg.text, {
          breaks: true,
          gfm: true
        }) as string;

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
