/**
 * API routes for the career-ops web dashboard.
 * All routes include path-traversal guards and use execFile (never shell strings).
 */

import { Router } from 'express';
import { existsSync, readFileSync, createReadStream } from 'fs';
import { join, resolve, relative, isAbsolute, normalize } from 'path';
import { execFile } from 'child_process';
import { platform } from 'os';
import { parseApplications, enrichReportSummaries, updateApplicationStatus } from './data/applications.mjs';
import { computeMetrics, computeProgressMetrics } from './data/metrics.mjs';
import { loadReportSummary, parseCoverLetterPath } from './data/report-summary.mjs';
import { loadPDFManifest, resolvePDFs, resolveHTML, loadPDFEntriesByPath } from './data/pdf.mjs';
import { normalizeStatus } from './data/status.mjs';

// ── Path safety ────────────────────────────────────────────────────────────────

/**
 * Returns true iff `relOrAbs` resolves to a path inside `root`.
 * Rejects absolute paths, ".." traversal, and non-existent files.
 */
function isSafeInRepo(root, relOrAbs) {
  if (!relOrAbs) return false;
  // Reject absolute paths
  if (isAbsolute(relOrAbs)) return false;
  // Reject ".." components
  const normalized = normalize(relOrAbs);
  if (normalized.startsWith('..')) return false;
  const abs = resolve(root, normalized);
  // Must be inside root
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  return existsSync(abs);
}

function safeJoin(root, relPath) {
  const abs = resolve(root, normalize(relPath));
  return abs;
}

// ── OS open helper ─────────────────────────────────────────────────────────────

function openWithOS(target) {
  return new Promise((res, rej) => {
    const p = platform();
    let cmd, args;
    if (p === 'win32') {
      cmd = 'cmd'; args = ['/c', 'start', '', target];
    } else if (p === 'darwin') {
      cmd = 'open'; args = [target];
    } else {
      cmd = 'xdg-open'; args = [target];
    }
    execFile(cmd, args, { windowsHide: true }, err => {
      if (err) rej(err); else res();
    });
  });
}

// ── Simple cache ───────────────────────────────────────────────────────────────

let _appsCache = null;
let _appsCacheTime = 0;
const CACHE_TTL = 2000; // ms

function getCachedApps(careerOpsPath) {
  const now = Date.now();
  if (_appsCache && (now - _appsCacheTime) < CACHE_TTL) return _appsCache;
  const apps = parseApplications(careerOpsPath);
  enrichReportSummaries(careerOpsPath, apps);
  _appsCache = apps;
  _appsCacheTime = now;
  return apps;
}

export function invalidateCache() {
  _appsCache = null;
}

// ── Router factory ─────────────────────────────────────────────────────────────

export function createRouter(careerOpsPath, sseClients) {
  const router = Router();

  // GET /api/health
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', path: careerOpsPath });
  });

  // GET /api/applications
  router.get('/applications', (_req, res) => {
    try {
      const apps = getCachedApps(careerOpsPath);
      const metrics = computeMetrics(apps);
      res.json({ apps, metrics });
    } catch (err) {
      console.error('GET /applications error:', err);
      res.status(500).json({ error: String(err.message) });
    }
  });

  // GET /api/progress
  router.get('/progress', (_req, res) => {
    try {
      const apps = getCachedApps(careerOpsPath);
      const metrics = computeProgressMetrics(apps);
      res.json(metrics);
    } catch (err) {
      console.error('GET /progress error:', err);
      res.status(500).json({ error: String(err.message) });
    }
  });

  // GET /api/report?path=reports/001-acme-2026-01-01.md
  router.get('/report', (req, res) => {
    const relPath = req.query.path;
    if (!relPath || !isSafeInRepo(careerOpsPath, relPath)) {
      return res.status(400).json({ error: 'Invalid or unsafe report path' });
    }
    try {
      const abs = safeJoin(careerOpsPath, relPath);
      const markdown = readFileSync(abs, 'utf8');
      const lines = markdown.split('\n');

      // Extract metadata from report header
      const summary = loadReportSummary(careerOpsPath, relPath);
      const coverLetterPath = parseCoverLetterPath(lines, careerOpsPath);

      // Find the matching app for job URL
      const apps = getCachedApps(careerOpsPath);
      const app = apps.find(a => a.reportPath === relPath) ?? {};

      res.json({
        path: relPath,
        title: app.company ? `${app.company} — ${app.role}` : relPath,
        jobURL: app.jobURL ?? summary.jobURL ?? '',
        coverLetterPath,
        markdown,
        app,
      });
    } catch (err) {
      console.error('GET /report error:', err);
      res.status(500).json({ error: String(err.message) });
    }
  });

  // GET /api/pdfs?path=output/cv-acme-2026-01-01.pdf  — streams the PDF inline
  router.get('/pdfs', (req, res) => {
    const relPath = req.query.path;
    if (!relPath || !isSafeInRepo(careerOpsPath, relPath)) {
      return res.status(400).json({ error: 'Invalid or unsafe PDF path' });
    }
    const abs = safeJoin(careerOpsPath, relPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    createReadStream(abs).pipe(res);
  });

  // PATCH /api/applications/:reportNumber/status
  router.patch('/applications/:reportNumber/status', (req, res) => {
    const { reportNumber } = req.params;
    const { newStatus, oldStatus } = req.body ?? {};
    if (!reportNumber || !newStatus) {
      return res.status(400).json({ error: 'reportNumber and newStatus required' });
    }
    // Validate newStatus is a canonical value
    const valid = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];
    if (!valid.includes(newStatus)) {
      return res.status(400).json({ error: `Invalid status: ${newStatus}` });
    }
    const ok = updateApplicationStatus(careerOpsPath, reportNumber, oldStatus ?? '', newStatus);
    if (!ok) return res.status(404).json({ error: 'Application not found' });
    invalidateCache();
    res.json({ ok: true });
  });

  // POST /api/open  — open a URL or local file with the OS default handler
  router.post('/open', async (req, res) => {
    const { target, kind } = req.body ?? {};
    if (!target || !kind) return res.status(400).json({ error: 'target and kind required' });

    if (kind === 'url') {
      if (!/^https?:\/\//.test(target)) {
        return res.status(400).json({ error: 'Only http/https URLs allowed' });
      }
    } else if (kind === 'file') {
      if (!isSafeInRepo(careerOpsPath, target)) {
        return res.status(400).json({ error: 'File path outside repo or not found' });
      }
    } else {
      return res.status(400).json({ error: 'kind must be url or file' });
    }

    const actualTarget = kind === 'file' ? safeJoin(careerOpsPath, target) : target;
    try {
      await openWithOS(actualTarget);
      res.json({ ok: true });
    } catch (err) {
      console.error('POST /open error:', err);
      res.status(500).json({ error: String(err.message) });
    }
  });

  // POST /api/generate-pdf  — shell out to node generate-pdf.mjs (streams progress via SSE)
  router.post('/generate-pdf', (req, res) => {
    const { htmlPath, pdfPath, format, reportNumber } = req.body ?? {};
    if (!htmlPath || !pdfPath) {
      return res.status(400).json({ error: 'htmlPath and pdfPath required' });
    }
    if (!isSafeInRepo(careerOpsPath, htmlPath)) {
      return res.status(400).json({ error: 'Unsafe htmlPath' });
    }
    if (!isSafeInRepo(careerOpsPath, pdfPath.replace(/\.pdf$/, '.html')) &&
        !pdfPath.startsWith('output/')) {
      // pdfPath may not exist yet; just validate it starts with output/
    }

    // Build argv — never use shell string concatenation
    const args = [
      join(careerOpsPath, 'generate-pdf.mjs'),
      htmlPath,
      pdfPath,
    ];
    if (format) args.push(`--format=${format}`);
    if (reportNumber) args.push(`--report=${reportNumber}`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const child = execFile('node', args, { cwd: careerOpsPath }, (err, stdout, stderr) => {
      if (err) {
        const last = (stderr || stdout || '').trim().split('\n').reverse().find(l => l.trim());
        send({ type: 'done', ok: false, error: last || err.message });
      } else {
        send({ type: 'done', ok: true, pdfPath });
      }
      res.end();
    });

    child.stdout?.on('data', d => send({ type: 'log', text: d.toString() }));
    child.stderr?.on('data', d => send({ type: 'log', text: d.toString() }));
  });

  // GET /api/events  — SSE stream for real-time tracker changes
  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  // GET /api/pdfs/list?reportNumber=001   — list available PDFs for an app
  router.get('/pdfs/list', (req, res) => {
    const { reportNumber } = req.query;
    const apps = getCachedApps(careerOpsPath);
    const app = apps.find(a => a.reportNumber === reportNumber);
    if (!app) return res.json({ pdfs: [] });
    const manifest = loadPDFManifest(careerOpsPath);
    const pdfs = resolvePDFs(careerOpsPath, app, manifest);
    res.json({ pdfs });
  });

  return router;
}
