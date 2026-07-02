/**
 * Port of dashboard/internal/data/career.go: ParseApplications + URL enrichment.
 * Reads data/applications.md, parses tracker rows, derives note fields,
 * enriches with job URLs from reports/batch/scan-history, and loads report summaries.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { deriveNoteFields } from './derive.mjs';
import { loadReportSummary } from './report-summary.mjs';
import { normalizeStatus } from './status.mjs';

// Import tracker-parse.mjs from the career-ops repo root (3 levels up from web/server/data/)
const __dirname2 = dirname(fileURLToPath(import.meta.url));
const TRACKER_PARSE_PATH = join(__dirname2, '..', '..', '..', 'tracker-parse.mjs');
const { parseTrackerRow, resolveColumns } = await import(
  pathToFileURL(TRACKER_PARSE_PATH).href
);

const reReportLink = /\[(\d+)\]\(([^)]+)\)/;
const reScoreValue = /(\d+\.?\d*)\/5/;
const reReportURL  = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/m;
const reBatchID    = /^\*\*Batch ID:\*\*\s*(\d+)/m;

function findTrackerFile(careerOpsPath) {
  const paths = [
    join(careerOpsPath, 'data', 'applications.md'),
    join(careerOpsPath, 'applications.md'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

function resolveReportPath(careerOpsPath, trackerPath, link) {
  const resolved = join(dirname(trackerPath), link.replace(/\//g, '\\'));
  if (existsSync(resolved)) {
    try { return relative(careerOpsPath, resolved).replace(/\\/g, '/'); } catch { return link; }
  }
  const legacy = join(careerOpsPath, link.replace(/\//g, '\\'));
  if (existsSync(legacy)) {
    try { return relative(careerOpsPath, legacy).replace(/\\/g, '/'); } catch { return link; }
  }
  return link;
}

function loadBatchInputURLs(careerOpsPath) {
  const result = new Map();
  const p = join(careerOpsPath, 'batch', 'batch-input.tsv');
  if (!existsSync(p)) return result;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length < 4 || f[0] === 'id') continue;
    const notes = f[3] ?? '';
    let url = '';
    const pipeIdx = notes.lastIndexOf('| ');
    if (pipeIdx >= 0) {
      const u = notes.slice(pipeIdx + 2).trim();
      if (u.startsWith('http')) url = u;
    }
    if (!url && (f[1] ?? '').startsWith('http')) url = f[1];
    if (url) result.set(f[0], url);
  }
  return result;
}

function loadJobURLs(careerOpsPath) {
  const batchURLs = loadBatchInputURLs(careerOpsPath);
  const statePath = join(careerOpsPath, 'batch', 'batch-state.tsv');
  if (!existsSync(statePath)) return new Map();

  const reportToURL = new Map();
  for (const line of readFileSync(statePath, 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length < 6 || f[0] === 'id') continue;
    const id = f[0], status = f[2], reportNum = f[5];
    if (status !== 'completed' || !reportNum || reportNum === '-') continue;
    const entry = batchURLs.get(id);
    if (entry) {
      reportToURL.set(reportNum, entry);
      if (reportNum.length < 3) reportToURL.set(reportNum.padStart(3, '0'), entry);
    }
  }
  return reportToURL;
}

function normalizeCompany(name) {
  let s = (name ?? '').toLowerCase().trim();
  for (const sfx of [' inc.', ' inc', ' llc', ' ltd', ' corp', ' corporation', ' technologies', ' technology', ' group', ' co.']) {
    if (s.endsWith(sfx)) s = s.slice(0, -sfx.length);
  }
  return s.trim();
}

function enrichFromScanHistory(careerOpsPath, apps) {
  const scanPath = join(careerOpsPath, 'data', 'scan-history.tsv');
  if (!existsSync(scanPath)) return;

  const byCompany = new Map();
  for (const line of readFileSync(scanPath, 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length < 5 || f[0] === 'url') continue;
    const url = f[0], title = f[3], company = f[4];
    if (!url?.startsWith('http')) continue;
    const key = normalizeCompany(company);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push({ url, title });
  }

  for (const app of apps) {
    if (app.jobURL) continue;
    const key = normalizeCompany(app.company);
    const matches = byCompany.get(key) ?? [];
    if (matches.length === 1) { app.jobURL = matches[0].url; continue; }
    if (matches.length > 1) {
      const appRole = (app.role ?? '').toLowerCase();
      let best = matches[0].url, bestScore = 0;
      for (const m of matches) {
        const score = (app.role?.toLowerCase().split(/\s+/) ?? [])
          .filter(w => w.length > 2 && m.title?.toLowerCase().includes(w)).length;
        if (score > bestScore) { bestScore = score; best = m.url; }
      }
      app.jobURL = best;
    }
  }
}

function enrichByCompanyFromBatch(careerOpsPath, apps) {
  const p = join(careerOpsPath, 'batch', 'batch-input.tsv');
  if (!existsSync(p)) return;

  const byCompany = new Map();
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length < 4 || f[0] === 'id') continue;
    const notes = f[3] ?? '';
    let url = '';
    const pipeIdx = notes.lastIndexOf('| ');
    if (pipeIdx >= 0) { const u = notes.slice(pipeIdx + 2).trim(); if (u.startsWith('http')) url = u; }
    if (!url && (f[1] ?? '').startsWith('http')) url = f[1];
    if (!url) continue;
    let notesPart = notes;
    const pi = notesPart.indexOf(' | ');
    if (pi >= 0) notesPart = notesPart.slice(0, pi);
    const ai = notesPart.lastIndexOf(' @ ');
    if (ai >= 0) {
      const role = notesPart.slice(0, ai).trim();
      const company = notesPart.slice(ai + 3).trim();
      const key = normalizeCompany(company);
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key).push({ role, url });
    }
  }

  for (const app of apps) {
    if (app.jobURL) continue;
    const key = normalizeCompany(app.company);
    const matches = byCompany.get(key) ?? [];
    if (matches.length === 1) { app.jobURL = matches[0].url; continue; }
    if (matches.length > 1) {
      let best = matches[0].url, bestScore = 0;
      for (const m of matches) {
        const score = (app.role?.toLowerCase().split(/\s+/) ?? [])
          .filter(w => w.length > 2 && m.role?.toLowerCase().includes(w)).length;
        if (score > bestScore) { bestScore = score; best = m.url; }
      }
      app.jobURL = best;
    }
  }
}

/**
 * Parse applications.md and return enriched app objects.
 * @param {string} careerOpsPath
 * @returns {object[]}
 */
export function parseApplications(careerOpsPath) {
  const trackerPath = findTrackerFile(careerOpsPath);
  if (!trackerPath) return [];

  const content = readFileSync(trackerPath, 'utf8');
  const lines = content.split('\n');
  const colmap = resolveColumns(lines);

  // resolveColumns returns a plain object; convert to Map for replaceStatusInContent
  const colmapMap = new Map(Object.entries(colmap).map(([k, v]) => [k, v]));

  const apps = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const row = parseTrackerRow(line, colmap);
    if (!row) continue;

    const scoreM = reScoreValue.exec(row.score ?? '');
    const app = {
      number:       row.num,
      date:         row.date ?? '',
      company:      row.company ?? '',
      role:         row.role ?? '',
      status:       row.status ?? '',
      score:        scoreM ? parseFloat(scoreM[1]) : 0,
      scoreRaw:     row.score ?? '',
      hasPDF:       (row.pdf ?? '').includes('✅'),
      reportPath:   '',
      reportNumber: '',
      notes:        row.notes ?? '',
      jobURL:       '',
      // derived
      location:     '',
      workMode:     '',
      payRange:     '',
      payMax:       0,
      paySource:    '',
      lastContact:  '',
      // enrichment
      archetype:    '',
      tldr:         '',
      remote:       '',
      compEstimate: '',
    };

    const reportM = reReportLink.exec(row.report ?? '');
    if (reportM) {
      app.reportNumber = reportM[1];
      app.reportPath   = resolveReportPath(careerOpsPath, trackerPath, reportM[2]);
    }

    deriveNoteFields(app);
    apps.push(app);
  }

  // Enrich job URLs
  const batchURLs   = loadBatchInputURLs(careerOpsPath);
  const reportToURL = loadJobURLs(careerOpsPath);

  for (const app of apps) {
    if (!app.reportPath) continue;
    const fullReport = join(careerOpsPath, app.reportPath.replace(/\//g, '\\'));
    if (!existsSync(fullReport)) continue;
    let header;
    try {
      const buf = readFileSync(fullReport);
      header = buf.slice(0, 1000).toString('utf8');
    } catch { continue; }

    // Strategy 1: **URL:** in report
    const urlM = reReportURL.exec(header);
    if (urlM) { app.jobURL = urlM[1].trim(); continue; }

    // Strategy 2: **Batch ID:** → batch-input.tsv
    const batchM = reBatchID.exec(header);
    if (batchM) {
      const u = batchURLs.get(batchM[1]);
      if (u) { app.jobURL = u; continue; }
    }

    // Strategy 3: report_num → batch-state completed
    const u3 = reportToURL.get(app.reportNumber);
    if (u3) { app.jobURL = u3; continue; }
  }

  // Strategy 4 & 5
  enrichFromScanHistory(careerOpsPath, apps);
  enrichByCompanyFromBatch(careerOpsPath, apps);

  return apps;
}

/**
 * Load report summaries for all apps that have a reportPath.
 * Mutates apps in place, setting archetype/tldr/remote/compEstimate.
 */
export function enrichReportSummaries(careerOpsPath, apps) {
  for (const app of apps) {
    if (!app.reportPath) continue;
    const s = loadReportSummary(careerOpsPath, app.reportPath);
    if (s.archetype)  app.archetype    = s.archetype;
    if (s.tldr)       app.tldr         = s.tldr;
    if (s.remote)     app.remote       = s.remote;
    if (s.comp)       app.compEstimate = s.comp;
    if (s.jobURL && !app.jobURL) app.jobURL = s.jobURL;
  }
}

/**
 * Update the status of one application in applications.md.
 * Returns true on success.
 */
export function updateApplicationStatus(careerOpsPath, reportNumber, oldStatus, newStatus) {
  const trackerPath = findTrackerFile(careerOpsPath);
  if (!trackerPath) return false;

  const content = readFileSync(trackerPath, 'utf8');
  const lines = content.split('\n');
  const colmap = resolveColumns(lines);
  const statusFieldIdx = colmap.status ?? 6;

  let found = false;
  const updated = lines.map(line => {
    if (!line.startsWith('|')) return line;
    if (!line.includes(`[${reportNumber}]`)) return line;

    const parts = line.split('|');
    let targetIdx = -1;
    const want = (oldStatus ?? '').trim().toLowerCase();

    if (
      statusFieldIdx < parts.length &&
      parts[statusFieldIdx].trim().toLowerCase() === want
    ) {
      targetIdx = statusFieldIdx;
    } else {
      for (let j = 0; j < parts.length; j++) {
        if (parts[j].trim().toLowerCase() === want) { targetIdx = j; break; }
      }
    }
    if (targetIdx < 0) return line;

    const cell = parts[targetIdx];
    const trimmed = cell.trim();
    const start = cell.indexOf(trimmed);
    parts[targetIdx] = cell.slice(0, start) + newStatus + cell.slice(start + trimmed.length);
    found = true;
    return parts.join('|');
  });

  if (!found) return false;

  try {
    writeFileSync(trackerPath, updated.join('\n'), 'utf8');
    return true;
  } catch (_e) { return false; }
}
