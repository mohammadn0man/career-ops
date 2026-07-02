import type { CareerApp, PipelineMetrics, ProgressMetrics, ReportData } from './types';

const BASE = '/api';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getApplications: (): Promise<{ apps: CareerApp[]; metrics: PipelineMetrics }> =>
    req('/applications'),

  getProgress: (): Promise<ProgressMetrics> =>
    req('/progress'),

  getReport: (path: string): Promise<ReportData> =>
    req(`/report?path=${encodeURIComponent(path)}`),

  getPdfList: (reportNumber: string): Promise<{ pdfs: string[] }> =>
    req(`/pdfs/list?reportNumber=${encodeURIComponent(reportNumber)}`),

  updateStatus: (reportNumber: string, oldStatus: string, newStatus: string) =>
    req<{ ok: boolean }>(`/applications/${encodeURIComponent(reportNumber)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStatus, oldStatus }),
    }),

  openTarget: (target: string, kind: 'url' | 'file') =>
    req<{ ok: boolean }>('/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, kind }),
    }),

  generatePDF: (htmlPath: string, pdfPath: string, format?: string, reportNumber?: string) => {
    return fetch(BASE + '/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ htmlPath, pdfPath, format, reportNumber }),
    });
  },

  pdfUrl: (relPath: string) => `${BASE}/pdfs?path=${encodeURIComponent(relPath)}`,
};
