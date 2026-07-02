/**
 * career-ops web dashboard — Express server.
 * Reads from (and writes to) the same files as the Go TUI dashboard.
 *
 * Usage:
 *   node index.mjs [--path /path/to/career-ops]   # defaults to repo root
 *   PORT=3333 node index.mjs
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync, watch } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRouter } from './routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve career-ops root: --path arg, or 2 levels up from web/server/
const pathArgIdx = process.argv.indexOf('--path');
const CAREER_OPS_PATH = pathArgIdx >= 0
  ? resolve(process.argv[pathArgIdx + 1])
  : resolve(__dirname, '../../');

const PORT = Number(process.env.PORT ?? 3333);

const app = express();
app.use(cors({ origin: ['http://localhost:5174', 'http://127.0.0.1:5174'] }));
app.use(express.json());

// SSE clients: Set of res objects
const sseClients = new Set();

// Mount API routes
app.use('/api', createRouter(CAREER_OPS_PATH, sseClients));

// Serve built client in production (npm start)
const clientDist = join(__dirname, '..', 'client', 'dist');
import { existsSync } from 'fs';
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const server = createServer(app);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`career-ops web dashboard running at http://127.0.0.1:${PORT}`);
  console.log(`career-ops path: ${CAREER_OPS_PATH}`);
});

// Watch applications.md for changes → notify SSE clients
const trackerPaths = [
  join(CAREER_OPS_PATH, 'data', 'applications.md'),
  join(CAREER_OPS_PATH, 'applications.md'),
];
for (const p of trackerPaths) {
  if (existsSync(p)) {
    watch(p, { persistent: false }, () => {
      const msg = `data: ${JSON.stringify({ type: 'tracker-changed' })}\n\n`;
      for (const client of sseClients) {
        try { client.write(msg); } catch { sseClients.delete(client); }
      }
    });
    console.log(`Watching: ${p}`);
    break;
  }
}
