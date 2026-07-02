import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReportData } from '../lib/types';
import { STATUS_OPTIONS, normalizeStatus } from '../lib/pipeline';
import { useKeyboard } from '../hooks/useKeyboard';
import { api } from '../lib/api';

interface Props {
  reportData: ReportData;
  onClose: () => void;
  onStatusUpdated: () => void;
}

export function Report({ reportData, onClose, onStatusUpdated }: Props) {
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [statusCursor, setStatusCursor] = useState(0);
  const [flash, setFlash] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { title, jobURL, coverLetterPath, markdown, app } = reportData;

  // Pre-select current status in picker
  const openStatusPicker = useCallback(() => {
    const norm = normalizeStatus(app?.status ?? '');
    const idx = STATUS_OPTIONS.findIndex(o => normalizeStatus(o) === norm);
    setStatusCursor(Math.max(0, idx));
    setStatusPickerOpen(true);
  }, [app?.status]);

  const handleStatusConfirm = useCallback(async (newStatus: string) => {
    setStatusPickerOpen(false);
    if (!app?.reportNumber) return;
    try {
      await api.updateStatus(app.reportNumber, app.status ?? '', newStatus);
      onStatusUpdated();
      setFlash(`Status changed to ${newStatus}`);
    } catch (e) {
      setFlash(`Status update failed: ${(e as Error).message}`);
    }
  }, [app, onStatusUpdated]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // Normal mode keys
  useKeyboard(
    {
      q: () => onClose(),
      Escape: () => {
        if (statusPickerOpen) { setStatusPickerOpen(false); return; }
        onClose();
      },
      c: () => openStatusPicker(),
      j: () => {
        if (scrollRef.current) scrollRef.current.scrollTop += 40;
      },
      k: () => {
        if (scrollRef.current) scrollRef.current.scrollTop -= 40;
      },
      PageDown: () => {
        if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.clientHeight / 2;
      },
      PageUp: () => {
        if (scrollRef.current) scrollRef.current.scrollTop -= scrollRef.current.clientHeight / 2;
      },
      'ctrl+d': () => {
        if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.clientHeight / 2;
      },
      'ctrl+u': () => {
        if (scrollRef.current) scrollRef.current.scrollTop -= scrollRef.current.clientHeight / 2;
      },
      g: () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; },
      G: () => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },
      o: () => { if (jobURL) api.openTarget(jobURL, 'url').catch(() => {}); },
      L: () => {
        if (coverLetterPath) api.openTarget(coverLetterPath, 'file').catch(() => {});
      },
    },
    !statusPickerOpen,
  );

  // Picker keys
  useKeyboard(
    {
      j: () => setStatusCursor(c => Math.min(c + 1, STATUS_OPTIONS.length - 1)),
      k: () => setStatusCursor(c => Math.max(c - 1, 0)),
      Enter: () => handleStatusConfirm(STATUS_OPTIONS[statusCursor]),
      Escape: () => setStatusPickerOpen(false),
      q: () => setStatusPickerOpen(false),
    },
    statusPickerOpen,
  );

  return (
    <div className="h-screen flex flex-col bg-ctp-base text-ctp-text font-mono text-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between bg-ctp-surface0 px-3 py-1 flex-shrink-0 gap-4">
        <span className="text-ctp-blue font-bold truncate">{title}</span>
        <div className="flex gap-3 text-xs text-ctp-subtext0 flex-shrink-0">
          {jobURL && (
            <a
              href={jobURL}
              target="_blank"
              rel="noreferrer"
              onClick={e => { e.preventDefault(); api.openTarget(jobURL, 'url').catch(() => {}); }}
              className="text-ctp-sky hover:underline"
            >
              Open URL ↗
            </a>
          )}
          <button onClick={onClose} className="hover:text-ctp-text">✕ Close [Esc/q]</button>
        </div>
      </div>

      {/* Markdown body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 prose-ctp">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-ctp-blue font-bold text-lg mt-4 mb-2 border-b border-ctp-overlay0 pb-1">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-ctp-mauve font-bold text-base mt-4 mb-1.5">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-ctp-sky font-bold text-sm mt-3 mb-1">{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-ctp-subtext1 font-bold text-sm mt-2 mb-0.5">{children}</h4>
            ),
            p: ({ children }) => (
              <p className="text-ctp-subtext1 leading-relaxed mb-2 text-sm">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="text-ctp-yellow font-bold">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="text-ctp-subtext1 italic">{children}</em>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.includes('language-');
              return isBlock ? (
                <code className="block bg-ctp-surface0 text-ctp-text px-3 py-2 rounded text-xs overflow-x-auto my-2 whitespace-pre">
                  {children}
                </code>
              ) : (
                <code className="bg-ctp-surface0 text-ctp-text px-1 rounded text-xs">{children}</code>
              );
            },
            pre: ({ children }) => <>{children}</>,
            ul: ({ children }) => (
              <ul className="list-none space-y-0.5 mb-2 pl-2">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-0.5 mb-2 pl-2 text-ctp-subtext1">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="text-ctp-text text-sm before:content-['•'] before:text-ctp-blue before:mr-2">{children}</li>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-ctp-blue hover:underline"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-ctp-overlay0 pl-3 text-ctp-subtext0 italic my-2">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="border-ctp-overlay0 my-4" />,
            table: ({ children }) => (
              <div className="overflow-x-auto my-3">
                <table className="w-full border-collapse text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-ctp-overlay0">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="px-3 py-1 text-left text-ctp-sky font-bold border border-ctp-overlay0">{children}</th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-1 text-ctp-text border border-ctp-overlay0">{children}</td>
            ),
            tr: ({ children }) => (
              <tr className="even:bg-ctp-surface0">{children}</tr>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>

      {/* Footer */}
      <div className="bg-ctp-surface0 px-3 py-0.5 text-xs text-ctp-subtext0 flex items-center justify-between flex-shrink-0">
        {flash ? (
          <span className="text-ctp-yellow">{flash}</span>
        ) : (
          <>
            <span>
              <kbd className="text-ctp-text">↑↓/jk</kbd> scroll ·{' '}
              <kbd className="text-ctp-text">PgUp/Dn</kbd> page ·{' '}
              <kbd className="text-ctp-text">g/G</kbd> top/end ·{' '}
              <kbd className="text-ctp-text">c</kbd> status ·{' '}
              {jobURL && <><kbd className="text-ctp-text">o</kbd> open URL · </>}
              {coverLetterPath && <><kbd className="text-ctp-text">L</kbd> cover letter · </>}
              <kbd className="text-ctp-text">Esc/q</kbd> back
            </span>
            <span className="text-ctp-overlay0">career-ops</span>
          </>
        )}
      </div>

      {/* Status picker overlay */}
      {statusPickerOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-ctp-surface0 border border-ctp-overlay0 rounded-lg shadow-xl min-w-[220px]">
            <div className="px-4 py-2 border-b border-ctp-overlay0 text-ctp-blue font-bold text-sm">
              Change status
            </div>
            <ul className="py-1">
              {STATUS_OPTIONS.map((opt, i) => (
                <li
                  key={opt}
                  onClick={() => handleStatusConfirm(opt)}
                  className={`px-4 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                    i === statusCursor
                      ? 'bg-ctp-overlay0 text-ctp-text font-bold'
                      : 'text-ctp-subtext1 hover:bg-ctp-surface1'
                  }`}
                >
                  <span className="w-4 text-ctp-blue">{i === statusCursor ? '▶' : ' '}</span>
                  {opt}
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-ctp-overlay0 text-ctp-overlay1 text-xs">
              ↑↓ navigate · Enter confirm · Esc cancel
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
