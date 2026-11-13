import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import {
  FileText,
  Image as ImageIcon,
  Code,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  Eye,
  FileCode,
  FileArchive,
  File,
  Check,
  Copy,
  Smartphone,
  Tablet,
  Monitor
} from 'lucide-react';
import { MessageArtifact } from '../../shared/types.ts';

// Configure mermaid once, in the app's pastel palette
try {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'strict',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    themeVariables: {
      background: '#FCFBF8',
      mainBkg: '#ECE7FB',
      nodeBorder: '#C6B8F1',
      clusterBkg: '#F7F5F1',
      clusterBorder: '#E3DFD7',
      lineColor: '#A29D93',
      textColor: '#2F2D2A',
      primaryColor: '#ECE7FB',
      primaryTextColor: '#2F2D2A',
      primaryBorderColor: '#C6B8F1',
      secondaryColor: '#DDF3E5',
      tertiaryColor: '#DFEEFA'
    }
  });
} catch {}

interface ArtifactPreviewProps {
  artifacts: MessageArtifact[];
}

export const ArtifactPreview: React.FC<ArtifactPreviewProps> = ({ artifacts }) => {
  if (!artifacts || artifacts.length === 0) return null;

  const [activeId, setActiveId] = useState<string>(artifacts[0]?.id || '');
  const [deviceWidth, setDeviceWidth] = useState<'100%' | '768px' | '375px'>('100%');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeArtifact = artifacts.find(a => a.id === activeId) || artifacts[0];

  const handleCopy = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`mt-4 rounded-xl border border-ink-100 bg-ink-25 overflow-hidden flex flex-col shadow-md ${
      isFullscreen ? 'fixed inset-4 z-50 bg-ink-0 border-ink-300 max-h-[92vh]' : ''
    }`}>
      {/* Top Header: Artifact Selector Tabs */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-100 bg-ink-50 overflow-x-auto gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {artifacts.map((art) => {
            const isActive = art.id === activeArtifact?.id;
            return (
              <button
                key={art.id}
                onClick={() => {
                  setActiveId(art.id);
                  setViewMode('preview');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-ink-100 text-ink-900 border border-ink-300'
                    : 'text-ink-600 hover:text-ink-800 hover:bg-ink-50'
                }`}
              >
                {art.type === 'mermaid' && <Code className="w-3.5 h-3.5 text-sky-600" />}
                {art.type === 'html' && <Eye className="w-3.5 h-3.5 text-mint-600" />}
                {art.type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-butter-600" />}
                {art.type === 'other' && <Download className="w-3.5 h-3.5 text-lav-600" />}
                <span className="truncate max-w-[140px]">{art.name}</span>
                <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-ink-50 text-ink-500 border border-ink-100">
                  {art.type}
                </span>
              </button>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {(activeArtifact?.type === 'html' || activeArtifact?.type === 'mermaid') && (
            <div className="flex items-center rounded-xl bg-ink-50 p-0.5 mr-1">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  viewMode === 'preview' ? 'bg-ink-100 text-ink-900 font-medium' : 'text-ink-600 hover:text-ink-800'
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  viewMode === 'code' ? 'bg-ink-100 text-ink-900 font-medium' : 'text-ink-600 hover:text-ink-800'
                }`}
              >
                Code
              </button>
            </div>
          )}

          {activeArtifact?.type === 'html' && viewMode === 'preview' && (
            <div className="hidden sm:flex items-center rounded-xl bg-ink-50 p-0.5 mr-1">
              <button
                onClick={() => setDeviceWidth('100%')}
                title="Desktop (100%)"
                className={`p-1 rounded ${deviceWidth === '100%' ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}
              >
                <Monitor className="w-3 h-3" />
              </button>
              <button
                onClick={() => setDeviceWidth('768px')}
                title="Tablet (768px)"
                className={`p-1 rounded ${deviceWidth === '768px' ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}
              >
                <Tablet className="w-3 h-3" />
              </button>
              <button
                onClick={() => setDeviceWidth('375px')}
                title="Mobile (375px)"
                className={`p-1 rounded ${deviceWidth === '375px' ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}
              >
                <Smartphone className="w-3 h-3" />
              </button>
            </div>
          )}

          {activeArtifact?.url && (
            <a
              href={`${activeArtifact.url}&download=1`}
              download={activeArtifact.name}
              title={`Download ${activeArtifact.name}`}
              className="p-1.5 rounded-lg bg-ink-50 hover:bg-ink-100 text-ink-600 hover:text-ink-800 border border-ink-100 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}

          {activeArtifact?.content && (
            <button
              onClick={() => handleCopy(activeArtifact.content)}
              title="Copy code"
              className="p-1.5 rounded-lg bg-ink-50 hover:bg-ink-100 text-ink-600 hover:text-ink-800 border border-ink-100 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-mint-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded-lg bg-ink-50 hover:bg-ink-100 text-ink-600 hover:text-ink-800 border border-ink-100 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Artifact Render Body */}
      <div className={`p-4 overflow-auto flex items-center justify-center bg-ink-0 ${
        isFullscreen ? 'flex-1' : 'min-h-[220px] max-h-[500px]'
      }`}>
        {activeArtifact && (
          <>
            {/* 1. MERMAID DIAGRAM PREVIEW */}
            {activeArtifact.type === 'mermaid' && (
              viewMode === 'preview' ? (
                <MermaidRenderer content={activeArtifact.content || ''} />
              ) : (
                <pre className="w-full h-full p-4 font-mono text-xs text-ink-800 bg-ink-50 rounded-lg overflow-auto border border-ink-100 select-text">
                  <code>{activeArtifact.content}</code>
                </pre>
              )
            )}

            {/* 2. HTML PAGE PREVIEW (Interactive Sandboxed Iframe) */}
            {activeArtifact.type === 'html' && (
              viewMode === 'preview' ? (
                <div
                  className="w-full flex justify-center h-full transition-all duration-200"
                  style={{ maxWidth: deviceWidth }}
                >
                  <iframe
                    title={activeArtifact.name}
                    srcDoc={activeArtifact.content}
                    src={activeArtifact.content ? undefined : activeArtifact.url}
                    sandbox="allow-scripts allow-forms allow-modals"
                    className="w-full h-[440px] rounded-lg border border-ink-100 bg-white dark:bg-ink-50 shadow-inner"
                  />
                </div>
              ) : (
                <pre className="w-full h-full p-4 font-mono text-xs text-ink-800 bg-ink-50 rounded-lg overflow-auto border border-ink-100 select-text">
                  <code>{activeArtifact.content}</code>
                </pre>
              )
            )}

            {/* 3. IMAGE PREVIEW */}
            {activeArtifact.type === 'image' && (
              <div className="flex flex-col items-center justify-center w-full space-y-2">
                <div className="relative group max-w-full">
                  <img
                    src={activeArtifact.url || (activeArtifact.content ? `data:${activeArtifact.mimeType || 'image/svg+xml'};utf8,${encodeURIComponent(activeArtifact.content)}` : '')}
                    alt={activeArtifact.name}
                    className="max-h-[420px] max-w-full object-contain rounded-lg border border-ink-100 bg-ink-50 p-1"
                  />
                </div>
                <div className="text-[11px] text-ink-500 font-mono flex items-center gap-3">
                  <span>{activeArtifact.name}</span>
                  {activeArtifact.sizeBytes && <span>{(activeArtifact.sizeBytes / 1024).toFixed(1)} KB</span>}
                </div>
              </div>
            )}

            {/* 4. OTHER FILE TYPES: DOWNLOAD CARD */}
            {activeArtifact.type === 'other' && (
              <div className="flex flex-col items-center justify-center p-8 text-center max-w-md w-full bg-ink-50 rounded-xl border border-ink-100 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-ink-100 flex items-center justify-center text-ink-700">
                  {activeArtifact.name.endsWith('.zip') || activeArtifact.name.endsWith('.tar') ? (
                    <FileArchive className="w-6 h-6 text-lav-600" />
                  ) : activeArtifact.name.endsWith('.json') || activeArtifact.name.endsWith('.ts') ? (
                    <FileCode className="w-6 h-6 text-sky-600" />
                  ) : (
                    <File className="w-6 h-6 text-ink-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink-800 truncate">{activeArtifact.name}</h3>
                  <p className="text-xs text-ink-600 mt-1">
                    {activeArtifact.description || 'Binary or structured data artifact generated by agent in worktree.'}
                  </p>
                  {activeArtifact.sizeBytes && (
                    <span className="text-[11px] text-ink-500 font-mono mt-1 block">
                      Size: {(activeArtifact.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
                <div className="pt-2">
                  <a
                    href={activeArtifact.url ? `${activeArtifact.url}&download=1` : '#'}
                    download={activeArtifact.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-lav-200 hover:bg-lav-300 text-lav-700 text-xs font-semibold shadow transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download {activeArtifact.name}</span>
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export interface MermaidRendererProps {
  content: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const renderId = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    async function renderMermaid() {
      if (!content.trim()) return;
      try {
        setRenderError(null);
        const { svg: renderedSvg } = await mermaid.render(renderId, content);
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Mermaid render error:', err);
          setRenderError(err.message || 'Syntax error in Mermaid diagram');
        }
      }
    }

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [content]);

  if (renderError) {
    return (
      <div className="w-full p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
        <div className="font-semibold mb-1">Mermaid Render Notice</div>
        <div className="font-mono text-[11px] text-ink-600 whitespace-pre-wrap">{content}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center overflow-auto p-4 [&>svg]:max-w-full [&>svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
