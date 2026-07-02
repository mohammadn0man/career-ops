import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { CareerApp, PipelineMetrics, FilterTab, SortMode, ViewMode } from '../lib/types';
import {
  normalizeStatus, statusLabel,
  PIPELINE_TABS, SORT_CYCLE, STATUS_OPTIONS,
  filterAndSort, countForFilter, timeAgo,
} from '../lib/pipeline';
import { useKeyboard } from '../hooks/useKeyboard';
import { api } from '../lib/api';
import { StatusPicker } from '../components/StatusPicker';
import { ColumnPicker, OPTIONAL_COLS } from '../components/ColumnPicker';
import { PdfPicker } from '../components/PdfPicker';

export type ColId = 'date' | 'location' | 'pay' | 'rpt' | 'pdf' | 'last';
export type VisibleCols = Record<ColId, boolean>;

const DEFAULT_VISIBLE: VisibleCols = {
  date: true, location: true, pay: true, rpt: false, pdf: false, last: false,
};

interface Props {
  apps: CareerApp[];
  metrics: PipelineMetrics;
  onOpenReport: (app: CareerApp) => void;
  onOpenProgress: () => void;
  onRefresh: () => void;
}

// ── Score / status colour helpers ──────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 4.2) return 'text-ctp-green font-bold';
  if (score >= 3.8) return 'text-ctp-yellow';
  if (score >= 3.0) return 'text-ctp-text';
  return 'text-ctp-red';
}

function statusColor(norm: string): string {
  switch (norm) {
    case 'interview': return 'text-ctp-green';
    case 'offer':     return 'text-ctp-green';
    case 'applied':   return 'text-ctp-sky';
    case 'responded': return 'text-ctp-blue';
    case 'evaluated': return 'text-ctp-text';
    case 'skip':      return 'text-ctp-red';
    case 'rejected':  return 'text-ctp-subtext0';
    case 'discarded': return 'text-ctp-subtext0';
    default:          return 'text-ctp-text';
  }
}

function workModeColor(mode: string): string {
  switch (mode) {
    case 'Remote':     return 'text-ctp-green';
    case 'RemoteFlex': return 'text-ctp-sky';
    case 'Hybrid':     return 'text-ctp-yellow';
    case 'Full':       return 'text-ctp-red';
    default:           return 'text-ctp-subtext0';
  }
}

// ── Truncate helper ────────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ── Preview outcome (mirrors Go previewOutcome) ────────────────────────────────

function previewOutcome(app: CareerApp): string {
  const norm = normalizeStatus(app.status);
  if (norm !== 'discarded' && norm !== 'skip' && norm !== 'rejected') return '';
  const status = (app.status ?? '').replace(/\*\*/g, '').trim();
  return app.notes ? `${status} — ${app.notes}` : status;
}


// ── Main Pipeline component ────────────────────────────────────────────────────

export function Pipeline({ apps, metrics, onOpenReport, onOpenProgress, onRefresh }: Props) {
  const [activeTab, setActiveTab]     = useState<FilterTab>('all');
  const [sortMode, setSortMode]       = useState<SortMode>('score');
  const [viewMode, setViewMode]       = useState<ViewMode>('grouped');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [cursor, setCursor]           = useState(0);
  const [visibleCols, setVisibleCols] = useState<VisibleCols>(DEFAULT_VISIBLE);
  const [flash, setFlash]             = useState('');

  // Overlays
  const [statusPickerOpen, setStatusPickerOpen]   = useState(false);
  const [statusPickerCursor, setStatusPickerCursor] = useState(0);
  const [colPickerOpen, setColPickerOpen]         = useState(false);
  const [colPickerCursor, setColPickerCursor]     = useState(0);
  const [pdfPickerOpen, setPdfPickerOpen]         = useState(false);
  const [pdfPickerCursor, setPdfPickerCursor]     = useState(0);
  const [pdfChoices, setPdfChoices]               = useState<string[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const filtered = useMemo(
    () => filterAndSort(apps, activeTab, sortMode, viewMode, searchQuery),
    [apps, activeTab, sortMode, viewMode, searchQuery],
  );

  const selectedApp = filtered[cursor] ?? null;

  // Keep cursor in bounds when filtered list changes
  useEffect(() => {
    setCursor(c => Math.max(0, Math.min(c, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll selected row into view
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // Flash auto-clear
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const anyOverlayOpen = statusPickerOpen || colPickerOpen || pdfPickerOpen;

  // ── Navigation helpers ───────────────────────────────────────────────────────

  const navigate = useCallback((delta: number) => {
    if (!filtered.length) return;
    setCursor(c => Math.max(0, Math.min(c + delta, filtered.length - 1)));
  }, [filtered.length]);

  const gotoEnd = useCallback(() => {
    setCursor(Math.max(0, filtered.length - 1));
  }, [filtered.length]);

  const cycleTab = useCallback((delta: number) => {
    setActiveTab(t => {
      const i = PIPELINE_TABS.findIndex(tab => tab.filter === t);
      const next = ((i + delta) + PIPELINE_TABS.length) % PIPELINE_TABS.length;
      return PIPELINE_TABS[next].filter;
    });
    setCursor(0);
  }, []);

  const cycleSortMode = useCallback(() => {
    setSortMode(s => {
      const i = SORT_CYCLE.indexOf(s);
      return SORT_CYCLE[(i + 1) % SORT_CYCLE.length];
    });
  }, []);

  const openStatusPicker = useCallback(() => {
    if (!selectedApp) return;
    const norm = normalizeStatus(selectedApp.status);
    const idx = STATUS_OPTIONS.findIndex(o => normalizeStatus(o) === norm);
    setStatusPickerCursor(Math.max(0, idx));
    setStatusPickerOpen(true);
  }, [selectedApp]);

  const handleStatusConfirm = useCallback(async (newStatus: string) => {
    setStatusPickerOpen(false);
    if (!selectedApp?.reportNumber) return;
    try {
      await api.updateStatus(selectedApp.reportNumber, selectedApp.status, newStatus);
      onRefresh();
    } catch (e) {
      setFlash(`Status update failed: ${(e as Error).message}`);
    }
  }, [selectedApp, onRefresh]);

  const openPDFPicker = useCallback(async () => {
    if (!selectedApp) return;
    try {
      const { pdfs } = await api.getPdfList(selectedApp.reportNumber);
      if (pdfs.length === 0) {
        setFlash('No CV PDF found — generate one with /career-ops pdf');
      } else if (pdfs.length === 1) {
        await api.openTarget(pdfs[0], 'file');
      } else {
        setPdfChoices(pdfs);
        setPdfPickerCursor(0);
        setPdfPickerOpen(true);
      }
    } catch (e) {
      setFlash(`Could not open PDF: ${(e as Error).message}`);
    }
  }, [selectedApp]);

  const handlePdfConfirm = useCallback(async (path: string) => {
    setPdfPickerOpen(false);
    try {
      await api.openTarget(path, 'file');
    } catch (e) {
      setFlash(`Could not open PDF: ${(e as Error).message}`);
    }
  }, []);

  const regenPDF = useCallback(async () => {
    if (!selectedApp) return;
    setFlash('Regenerating PDF… this takes a few seconds');
    try {
      const { pdfs } = await api.getPdfList(selectedApp.reportNumber);
      if (!pdfs.length) { setFlash('No source HTML found — run /career-ops pdf first'); return; }
      const htmlPath = pdfs[0].replace(/\.pdf$/, '.html');
      const resp = await api.generatePDF(htmlPath, pdfs[0], undefined, selectedApp.reportNumber);
      const reader = resp.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const ev of events) {
          const m = ev.match(/^data: (.+)$/m);
          if (m) {
            const d = JSON.parse(m[1]);
            if (d.type === 'done') {
              setFlash(d.ok ? `PDF regenerated: ${d.pdfPath}` : `PDF failed: ${d.error}`);
            }
          }
        }
      }
    } catch (e) {
      setFlash(`PDF regeneration failed: ${(e as Error).message}`);
    }
  }, [selectedApp]);

  // ── Keyboard handler (normal mode) ──────────────────────────────────────────

  useKeyboard(
    {
      j: () => navigate(+1),
      k: () => navigate(-1),
      g: () => setCursor(0),
      G: () => gotoEnd(),
      h: () => cycleTab(-1),
      l: () => cycleTab(+1),
      PageDown:  () => navigate(+10),
      PageUp:    () => navigate(-10),
      'ctrl+d':  () => navigate(+10),
      'ctrl+u':  () => navigate(-10),
      s: () => cycleSortMode(),
      v: () => setViewMode(m => m === 'grouped' ? 'flat' : 'grouped'),
      r: () => onRefresh(),
      p: () => onOpenProgress(),
      c: () => openStatusPicker(),
      C: () => { setColPickerOpen(true); setColPickerCursor(0); },
      Escape: () => {
        if (searchQuery) { setSearchQuery(''); setCursor(0); }
      },
      '/': () => {
        setSearchActive(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      },
      Enter: () => {
        if (selectedApp?.reportPath) onOpenReport(selectedApp);
      },
      o: () => {
        if (selectedApp?.jobURL) api.openTarget(selectedApp.jobURL, 'url').catch(() => {});
      },
      d: () => openPDFPicker(),
      D: () => regenPDF(),
    },
    !anyOverlayOpen && !searchActive,
  );

  // ── Tab counts ───────────────────────────────────────────────────────────────

  const tabCounts = useMemo(
    () => PIPELINE_TABS.map(t => ({ ...t, count: countForFilter(apps, t.filter) })),
    [apps],
  );

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderMetricsBar = () => {
    const parts: string[] = [];
    const order = ['interview', 'offer', 'responded', 'applied', 'evaluated', 'skip', 'rejected', 'discarded'];
    for (const s of order) {
      const n = metrics.byStatus[s];
      if (n) parts.push(`${statusLabel(s)}:${n}`);
    }
    return parts;
  };

  // Build a flat list of render items (group headers + rows)
  interface GroupHeader { type: 'group'; norm: string; count: number }
  interface AppRow      { type: 'row';   app: CareerApp; idx: number }
  type RenderItem = GroupHeader | AppRow;

  const renderItems = useMemo((): RenderItem[] => {
    const items: RenderItem[] = [];
    let prevNorm = '';
    filtered.forEach((app, idx) => {
      const norm = normalizeStatus(app.status);
      if (viewMode === 'grouped' && norm !== prevNorm) {
        const count = filtered.filter(a => normalizeStatus(a.status) === norm).length;
        items.push({ type: 'group', norm, count });
        prevNorm = norm;
      }
      items.push({ type: 'row', app, idx });
    });
    return items;
  }, [filtered, viewMode]);

  // ── Preview panel ────────────────────────────────────────────────────────────

  const renderPreview = () => {
    const app = selectedApp;
    if (!app) return null;
    const facts: { label: string; value: string; cls?: string }[] = [];

    if (app.workMode || app.location) {
      const loc = [app.workMode, app.location].filter(Boolean).join(' · ');
      facts.push({ label: 'Loc', value: loc, cls: workModeColor(app.workMode) });
    }
    if (app.payRange) {
      const pay = app.paySource ? `${app.payRange} (${app.paySource})` : app.payRange;
      facts.push({ label: 'Pay', value: pay, cls: app.paySource === 'POSTED' ? 'text-ctp-green' : 'text-ctp-yellow' });
    }
    if (app.lastContact && app.lastContact !== app.date) {
      facts.push({ label: 'Last contact', value: `${app.lastContact} (${timeAgo(app.lastContact)})` });
    }

    const outcome = previewOutcome(app);

    return (
      <div className="border-t border-ctp-overlay0 px-3 py-2 text-xs space-y-0.5 flex-shrink-0 min-h-[80px]">
        {facts.length > 0 && (
          <div className="flex gap-4 flex-wrap">
            {facts.map(f => (
              <span key={f.label}>
                <span className="text-ctp-sky font-bold">{f.label}: </span>
                <span className={f.cls ?? 'text-ctp-text'}>{f.value}</span>
              </span>
            ))}
          </div>
        )}
        {app.archetype && (
          <div>
            <span className="text-ctp-sky font-bold">Archetype: </span>
            <span className="text-ctp-text">{app.archetype}</span>
          </div>
        )}
        {app.tldr && (
          <div>
            <span className="text-ctp-sky font-bold">TL;DR: </span>
            <span className="text-ctp-text">{trunc(app.tldr, 120)}</span>
          </div>
        )}
        {app.compEstimate && !app.payRange && (
          <div>
            <span className="text-ctp-sky font-bold">Comp: </span>
            <span className="text-ctp-yellow">{app.compEstimate}</span>
          </div>
        )}
        {app.remote && (
          <div>
            <span className="text-ctp-sky font-bold">Remote: </span>
            <span className="text-ctp-text">{app.remote}</span>
          </div>
        )}
        {outcome && (
          <div>
            <span className="text-ctp-sky font-bold">Outcome: </span>
            <span className="text-ctp-subtext1">{trunc(outcome, 120)}</span>
          </div>
        )}
        {!app.archetype && !app.tldr && !outcome && app.notes && (
          <div className="text-ctp-subtext0 truncate">{trunc(app.notes, 120)}</div>
        )}
        {!app.archetype && !app.tldr && !app.notes && app.reportPath && (
          <div className="text-ctp-overlay1 italic">Loading preview…</div>
        )}
      </div>
    );
  };

  // ── Table row ────────────────────────────────────────────────────────────────

  const renderRow = (app: CareerApp, idx: number) => {
    const isSelected = idx === cursor;
    const norm = normalizeStatus(app.status);

    return (
      <tr
        key={app.number}
        ref={isSelected ? selectedRowRef : null}
        onClick={() => setCursor(idx)}
        onDoubleClick={() => app.reportPath && onOpenReport(app)}
        className={`cursor-pointer text-xs font-mono ${
          isSelected ? 'bg-ctp-overlay0' : 'hover:bg-ctp-surface1'
        }`}
      >
        <td className="pl-2 pr-1 py-0.5 text-ctp-blue font-bold whitespace-nowrap overflow-hidden">
          #{app.number}
        </td>
        <td className={`px-1 py-0.5 ${scoreColor(app.score)}`}>
          {app.score > 0 ? app.score.toFixed(1) : '—'}
        </td>
        {visibleCols.date && (
          <td className="px-1 py-0.5 text-ctp-subtext0 whitespace-nowrap overflow-hidden">
            {app.date || '—'}
          </td>
        )}
        <td className="px-1 py-0.5 text-ctp-text overflow-hidden">
          <span className="block truncate">{app.company}</span>
        </td>
        <td className="px-1 py-0.5 text-ctp-subtext1 overflow-hidden">
          <span className="block truncate">{app.role}</span>
        </td>
        <td className={`px-1 py-0.5 whitespace-nowrap overflow-hidden ${statusColor(norm)}`}>
          {statusLabel(norm)}
        </td>
        {visibleCols.location && (
          <td className={`px-1 py-0.5 overflow-hidden ${workModeColor(app.workMode)}`}>
            <span className="block truncate">
              {app.workMode || app.location
                ? [app.workMode, app.location].filter(Boolean).join(' · ')
                : '—'}
            </span>
          </td>
        )}
        {visibleCols.pay && (
          <td className={`px-1 py-0.5 overflow-hidden ${
            app.paySource === 'POSTED' ? 'text-ctp-green' : 'text-ctp-yellow'
          }`}>
            <span className="block truncate">
              {app.payRange || app.compEstimate || '—'}
            </span>
          </td>
        )}
        {visibleCols.rpt && (
          <td className={`px-1 py-0.5 text-center ${app.reportPath ? 'text-ctp-green' : 'text-ctp-subtext0'}`}>
            {app.reportPath ? '✓' : '—'}
          </td>
        )}
        {visibleCols.pdf && (
          <td className={`px-1 py-0.5 text-center ${app.hasPDF ? 'text-ctp-green' : 'text-ctp-subtext0'}`}>
            {app.hasPDF ? '✓' : '—'}
          </td>
        )}
        {visibleCols.last && (
          <td className="px-1 py-0.5 text-ctp-subtext0 whitespace-nowrap overflow-hidden">
            {app.lastContact && app.lastContact !== app.date ? timeAgo(app.lastContact) : '—'}
          </td>
        )}
      </tr>
    );
  };

  // ── Full render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-ctp-base text-ctp-text font-mono text-sm select-none overflow-hidden relative">

      {/* Header */}
      <div className="flex items-center justify-between bg-ctp-surface0 px-3 py-1 flex-shrink-0">
        <span className="text-ctp-blue font-bold text-base tracking-wide">CAREER PIPELINE</span>
        <span className="text-ctp-subtext0 text-xs">
          {metrics.total} offers · avg {metrics.avgScore.toFixed(1)}/5
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 bg-ctp-mantle px-2 pt-1 flex-shrink-0 overflow-x-auto">
        {tabCounts.map(tab => (
          <button
            key={tab.filter}
            onClick={() => { setActiveTab(tab.filter); setCursor(0); }}
            className={`px-3 pb-1 text-xs whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.filter
                ? 'border-ctp-blue text-ctp-blue font-bold'
                : 'border-transparent text-ctp-subtext0 hover:text-ctp-text'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Metrics bar */}
      <div className="flex gap-3 bg-ctp-surface0 px-3 py-0.5 flex-shrink-0 text-xs overflow-x-auto">
        {renderMetricsBar().map(part => {
          const [label, count] = part.split(':');
          const norm = label.toLowerCase();
          return (
            <span key={norm} className={statusColor(norm)}>
              {label}:<span className="font-bold">{count}</span>
            </span>
          );
        })}
      </div>

      {/* Sort/view bar */}
      <div className="flex gap-3 px-3 py-0.5 text-xs text-ctp-subtext0 flex-shrink-0 bg-ctp-mantle">
        <button onClick={cycleSortMode} className="hover:text-ctp-text">
          [Sort: {sortMode}]
        </button>
        <button onClick={() => setViewMode(m => m === 'grouped' ? 'flat' : 'grouped')} className="hover:text-ctp-text">
          [View: {viewMode}]
        </button>
        <span>{filtered.length} shown</span>
      </div>

      {/* Search bar */}
      {(searchActive || searchQuery) && (
        <div className="flex items-center gap-2 px-3 py-0.5 bg-ctp-surface1 text-xs flex-shrink-0">
          <span className="text-ctp-blue font-bold">/</span>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchActive(true)}
            onBlur={() => setSearchActive(false)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setSearchQuery(''); setSearchActive(false); e.currentTarget.blur(); }
              if (e.key === 'Enter')  { setSearchActive(false); e.currentTarget.blur(); }
            }}
            placeholder="search company / role / notes…"
            className="flex-1 bg-transparent outline-none text-ctp-text placeholder-ctp-overlay1"
            autoFocus
          />
          <span className="text-ctp-subtext0">
            {filtered.length}/{countForFilter(apps, activeTab)} matching
          </span>
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setCursor(0); }} className="text-ctp-overlay1 hover:text-ctp-text">✕</button>
          )}
        </div>
      )}

      {/* Table: header + body unified so column widths always sync */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-4 text-ctp-subtext0 text-sm">No offers match this filter</div>
        ) : (
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            {/* ROLE col explicitly gets 100% width — in table-layout: fixed this makes it
                absorb whatever pixels are left after the fixed cols. Chrome collapses
                <col> with no width to ~0px, so we can't leave it unstyled. */}
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: '36px' }} />
              {visibleCols.date     && <col style={{ width: '82px' }} />}
              <col style={{ width: '100px' }} />
              <col style={{ width: '100%' }} />
              <col style={{ width: '82px' }} />
              {visibleCols.location && <col style={{ width: '110px' }} />}
              {visibleCols.pay      && <col style={{ width: '92px' }} />}
              {visibleCols.rpt      && <col style={{ width: '32px' }} />}
              {visibleCols.pdf      && <col style={{ width: '32px' }} />}
              {visibleCols.last     && <col style={{ width: '80px' }} />}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-overlay0">
              <tr className="text-xs text-ctp-subtext0 font-bold">
                <th className="pl-2 pr-1 py-0.5 text-left font-bold">#</th>
                <th className="px-1 py-0.5 text-left font-bold">FIT</th>
                {visibleCols.date     && <th className="px-1 py-0.5 text-left font-bold">APPLIED</th>}
                <th className="px-1 py-0.5 text-left font-bold">COMPANY</th>
                <th className="px-1 py-0.5 text-left font-bold">ROLE</th>
                <th className="px-1 py-0.5 text-left font-bold">STATUS</th>
                {visibleCols.location && <th className="px-1 py-0.5 text-left font-bold">LOCATION</th>}
                {visibleCols.pay      && <th className="px-1 py-0.5 text-left font-bold">PAY</th>}
                {visibleCols.rpt      && <th className="px-1 py-0.5 text-center font-bold">RPT</th>}
                {visibleCols.pdf      && <th className="px-1 py-0.5 text-center font-bold">PDF</th>}
                {visibleCols.last     && <th className="px-1 py-0.5 text-left font-bold">LAST</th>}
              </tr>
            </thead>
            <tbody>
              {renderItems.map((item, _i) => {
                if (item.type === 'group') {
                  return (
                    <tr key={`g-${item.norm}`} className="bg-ctp-mantle">
                      <td colSpan={99} className="px-2 py-0.5 text-ctp-subtext0 font-bold text-xs">
                        ── {statusLabel(item.norm).toUpperCase()} ({item.count})
                      </td>
                    </tr>
                  );
                }
                return renderRow(item.app, item.idx);
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview panel */}
      {renderPreview()}

      {/* Help / flash bar */}
      <div className="bg-ctp-surface0 px-3 py-0.5 text-xs text-ctp-subtext0 flex items-center justify-between flex-shrink-0 overflow-x-auto gap-3 whitespace-nowrap">
        {flash ? (
          <span className="text-ctp-yellow">{flash}</span>
        ) : (
          <>
            <span>
              <kbd className="text-ctp-text">↑↓/jk</kbd> nav ·{' '}
              <kbd className="text-ctp-text">←→/hl</kbd> tabs ·{' '}
              <kbd className="text-ctp-text">/</kbd> search ·{' '}
              <kbd className="text-ctp-text">s</kbd> sort ·{' '}
              <kbd className="text-ctp-text">v</kbd> view ·{' '}
              <kbd className="text-ctp-text">Enter</kbd> report ·{' '}
              <kbd className="text-ctp-text">o</kbd> URL ·{' '}
              <kbd className="text-ctp-text">d</kbd> PDF ·{' '}
              <kbd className="text-ctp-text">D</kbd> regen ·{' '}
              <kbd className="text-ctp-text">c</kbd> status ·{' '}
              <kbd className="text-ctp-text">C</kbd> cols ·{' '}
              <kbd className="text-ctp-text">p</kbd> progress ·{' '}
              <kbd className="text-ctp-text">r</kbd> refresh
            </span>
            <span className="text-ctp-overlay0 flex-shrink-0">career-ops</span>
          </>
        )}
      </div>

      {/* Overlays */}
      {statusPickerOpen && (
        <StatusPicker
          cursor={statusPickerCursor}
          onMoveCursor={d => setStatusPickerCursor(c => Math.max(0, Math.min(c + d, STATUS_OPTIONS.length - 1)))}
          onConfirm={handleStatusConfirm}
          onClose={() => setStatusPickerOpen(false)}
        />
      )}
      {colPickerOpen && (
        <ColumnPicker
          cursor={colPickerCursor}
          visibleCols={visibleCols}
          onMoveCursor={d => setColPickerCursor(c => Math.max(0, Math.min(c + d, OPTIONAL_COLS.length - 1)))}
          onToggle={id => setVisibleCols(v => ({ ...v, [id]: !v[id] }))}
          onClose={() => setColPickerOpen(false)}
        />
      )}
      {pdfPickerOpen && (
        <PdfPicker
          choices={pdfChoices}
          cursor={pdfPickerCursor}
          onMoveCursor={d => setPdfPickerCursor(c => Math.max(0, Math.min(c + d, pdfChoices.length - 1)))}
          onConfirm={handlePdfConfirm}
          onClose={() => setPdfPickerOpen(false)}
        />
      )}
    </div>
  );
}
