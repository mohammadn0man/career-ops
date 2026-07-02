/**
 * Port of dashboard/internal/data/pdf.go:
 * LoadPDFManifest, LoadPDFEntriesByPath, ResolvePDFs, ResolveHTML.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, relative } from 'path';
import { glob } from 'fs/promises';

const rePDFDate = /(\d{4}-\d{2}-\d{2})\.pdf$/;

function isSafeRepoRelativePath(p) {
  if (!p || p.trim() === '') return false;
  const clean = p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/\.\.\//g, '/').replace(/^\.\.\//, '').replace(/\/\.\.$/, '');
  if (clean.startsWith('/')) return false;
  if (clean === '..' || clean.startsWith('../')) return false;
  return true;
}

function normalizeReportKey(s) {
  const trimmed = (s ?? '').trim().replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

export function loadPDFManifest(careerOpsPath) {
  const manifest = new Map();
  const filePath = join(careerOpsPath, 'data', 'pdf-index.tsv');
  if (!existsSync(filePath)) return manifest;

  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const l = line.trimEnd();
    if (!l || l.startsWith('#')) continue;
    const fields = l.split('\t');
    if (fields.length < 2) continue;
    const entry = {
      reportNumber: fields[0]?.trim() ?? '',
      pdfPath:      fields[1]?.trim() ?? '',
      htmlPath:     fields[2]?.trim() ?? '',
      format:       fields[3]?.trim() ?? '',
      date:         fields[4]?.trim() ?? '',
    };
    if (!entry.reportNumber || !entry.pdfPath || !isSafeRepoRelativePath(entry.pdfPath)) continue;
    if (entry.htmlPath && !isSafeRepoRelativePath(entry.htmlPath)) entry.htmlPath = '';
    manifest.set(normalizeReportKey(entry.reportNumber), entry);
  }
  return manifest;
}

export function loadPDFEntriesByPath(careerOpsPath) {
  const byPath = new Map();
  const filePath = join(careerOpsPath, 'data', 'pdf-index.tsv');
  if (!existsSync(filePath)) return byPath;

  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const l = line.trimEnd();
    if (!l || l.startsWith('#')) continue;
    const fields = l.split('\t');
    if (fields.length < 2) continue;
    const entry = {
      reportNumber: fields[0]?.trim() ?? '',
      pdfPath:      fields[1]?.trim() ?? '',
      htmlPath:     fields[2]?.trim() ?? '',
      format:       fields[3]?.trim() ?? '',
      date:         fields[4]?.trim() ?? '',
    };
    if (!entry.pdfPath || !isSafeRepoRelativePath(entry.pdfPath)) continue;
    if (entry.htmlPath && !isSafeRepoRelativePath(entry.htmlPath)) entry.htmlPath = '';
    byPath.set(entry.pdfPath, entry);
  }
  return byPath;
}

function kebabCase(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function matchesCompanySlug(base, slug) {
  if (!slug) return false;
  if ([...slug].length < 3) return base.includes('-' + slug + '-');
  return base.includes(slug);
}

function dateOf(p) {
  const m = rePDFDate.exec(p);
  return m ? m[1] : '';
}

function mtimeOf(careerOpsPath, relPath) {
  try {
    return statSync(join(careerOpsPath, relPath.replace(/\//g, '\\'))).mtimeMs;
  } catch { return 0; }
}

function sortNewestFirst(careerOpsPath, paths) {
  paths.sort((a, b) => {
    const da = dateOf(a), db = dateOf(b);
    if (da !== db) return da > db ? -1 : 1;
    return mtimeOf(careerOpsPath, b) - mtimeOf(careerOpsPath, a);
  });
}

import { readdirSync } from 'fs';

function globPDFs(careerOpsPath, ext) {
  const outputDir = join(careerOpsPath, 'output');
  if (!existsSync(outputDir)) return [];
  try {
    return readdirSync(outputDir)
      .filter(f => f.startsWith('cv-') && f.endsWith(ext))
      .map(f => 'output/' + f);
  } catch { return []; }
}

export function resolvePDFs(careerOpsPath, app, manifest) {
  const key = normalizeReportKey(app.reportNumber ?? '');
  const entry = manifest.get(key) ?? manifest.get(String(app.number ?? ''));
  if (entry) {
    const abs = join(careerOpsPath, entry.pdfPath.replace(/\//g, '\\'));
    if (existsSync(abs)) return [entry.pdfPath];
  }

  const slug = kebabCase(app.company ?? '');
  if (!slug) return [];

  const candidates = globPDFs(careerOpsPath, '.pdf')
    .filter(p => matchesCompanySlug(p.toLowerCase(), slug));
  sortNewestFirst(careerOpsPath, candidates);
  return candidates;
}

export function resolveHTML(careerOpsPath, app) {
  const slug = kebabCase(app.company ?? '');
  if (!slug) return { htmlPath: '', pdfPath: '' };

  const candidates = globPDFs(careerOpsPath, '.html')
    .filter(p => matchesCompanySlug(p.toLowerCase(), slug));
  if (!candidates.length) return { htmlPath: '', pdfPath: '' };
  sortNewestFirst(careerOpsPath, candidates);
  const htmlPath = candidates[0];
  const pdfPath = htmlPath.replace(/\.html$/, '.pdf');
  return { htmlPath, pdfPath };
}
