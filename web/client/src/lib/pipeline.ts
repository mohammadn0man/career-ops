/**
 * Pure pipeline logic: filtering, sorting, grouping.
 * Mirrors Go's applyFilterAndSort + sortLess + NormalizeStatus.
 */

import type { CareerApp, FilterTab, SortMode, ViewMode } from './types';

export function normalizeStatus(raw: string): string {
  let s = (raw ?? '').replace(/\*\*/g, '').trim().toLowerCase();
  const idx = s.indexOf(' 202');
  if (idx > 0) s = s.slice(0, idx).trimEnd();
  if (s.includes('no aplicar') || s.includes('no_aplicar') || s === 'skip' || s.includes('geo blocker')) return 'skip';
  if (s.includes('interview') || s.includes('entrevista')) return 'interview';
  if (s === 'offer' || s.includes('oferta')) return 'offer';
  if (s.includes('responded') || s.includes('respondido')) return 'responded';
  if (s.includes('applied') || s.includes('aplicado') || s === 'enviada' || s === 'aplicada' || s === 'sent') return 'applied';
  if (s.includes('rejected') || s.includes('rechazado') || s === 'rechazada') return 'rejected';
  if (s.includes('discarded') || s.includes('descartado') || s === 'descartada' || s === 'cerrada' || s === 'cancelada' || s.startsWith('duplicado') || s.startsWith('dup')) return 'discarded';
  if (s.includes('evaluated') || s.includes('evaluada') || s === 'condicional' || s === 'hold' || s === 'monitor' || s === 'evaluar' || s === 'verificar') return 'evaluated';
  return s;
}

export function statusPriority(status: string): number {
  switch (normalizeStatus(status)) {
    case 'interview': return 0;
    case 'offer':     return 1;
    case 'responded': return 2;
    case 'applied':   return 3;
    case 'evaluated': return 4;
    case 'skip':      return 5;
    case 'rejected':  return 6;
    case 'discarded': return 7;
    default:          return 8;
  }
}

export function statusLabel(norm: string): string {
  const map: Record<string, string> = {
    interview: 'Interview', offer: 'Offer', responded: 'Responded',
    applied: 'Applied', evaluated: 'Evaluated', skip: 'Skip',
    rejected: 'Rejected', discarded: 'Discarded',
  };
  return map[norm] ?? norm;
}

export const STATUS_OPTIONS = [
  'Evaluated', 'Applied', 'Responded', 'Interview',
  'Offer', 'Rejected', 'Discarded', 'SKIP',
];

export const PIPELINE_TABS: { filter: FilterTab; label: string }[] = [
  { filter: 'all',       label: 'ALL' },
  { filter: 'evaluated', label: 'EVALUATED' },
  { filter: 'applied',   label: 'APPLIED' },
  { filter: 'interview', label: 'INTERVIEW' },
  { filter: 'top',       label: 'TOP ≥4' },
  { filter: 'skip',      label: 'SKIP' },
  { filter: 'rejected',  label: 'REJECTED' },
  { filter: 'discarded', label: 'DISCARDED' },
];

export const SORT_CYCLE: SortMode[] = ['score', 'date', 'company', 'status', 'location', 'pay', 'last'];

export const STATUS_GROUP_ORDER = ['interview', 'offer', 'responded', 'applied', 'evaluated', 'skip', 'rejected', 'discarded'];

function workModeRank(mode: string): number {
  switch (mode) {
    case 'Remote':     return 0;
    case 'RemoteFlex': return 1;
    case 'Hybrid':     return 2;
    case 'Full':       return 3;
    default:           return 4;
  }
}

function sortLess(sortMode: SortMode): (a: CareerApp, b: CareerApp) => number {
  switch (sortMode) {
    case 'date':     return (a, b) => b.date.localeCompare(a.date);
    case 'company':  return (a, b) => a.company.toLowerCase().localeCompare(b.company.toLowerCase());
    case 'status':   return (a, b) => statusPriority(a.status) - statusPriority(b.status);
    case 'location': return (a, b) => {
      const ra = workModeRank(a.workMode), rb = workModeRank(b.workMode);
      if (ra !== rb) return ra - rb;
      return a.location.localeCompare(b.location);
    };
    case 'pay':      return (a, b) => b.payMax - a.payMax;
    case 'last':     return (a, b) => b.lastContact.localeCompare(a.lastContact);
    default:         return (a, b) => b.score - a.score;
  }
}

export function matchesSearch(app: CareerApp, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    app.company.toLowerCase().includes(q) ||
    app.role.toLowerCase().includes(q) ||
    (app.notes ?? '').toLowerCase().includes(q)
  );
}

export function countForFilter(apps: CareerApp[], filter: FilterTab): number {
  return apps.filter(app => {
    const norm = normalizeStatus(app.status);
    if (filter === 'all')  return true;
    if (filter === 'top')  return app.score >= 4.0 && norm !== 'skip';
    return norm === filter;
  }).length;
}

export function filterAndSort(
  apps: CareerApp[],
  tab: FilterTab,
  sortMode: SortMode,
  viewMode: ViewMode,
  searchQuery: string,
): CareerApp[] {
  const cmp = sortLess(sortMode);

  let filtered = apps.filter(app => {
    if (!matchesSearch(app, searchQuery)) return false;
    const norm = normalizeStatus(app.status);
    if (tab === 'all')  return true;
    if (tab === 'top')  return app.score >= 4.0 && norm !== 'skip';
    return norm === tab;
  });

  filtered.sort(cmp);

  if (viewMode === 'grouped') {
    filtered.sort((a, b) => {
      const pa = statusPriority(a.status), pb = statusPriority(b.status);
      if (pa !== pb) return pa - pb;
      return cmp(a, b);
    });
  }

  return filtered;
}

/** Days since a YYYY-MM-DD date — matches Go's formatTimeAgo logic. */
export function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days <= 0)  return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
