/**
 * Port of dashboard/internal/data/career.go: LoadReportSummary, parseCoverLetterPath.
 */

import { readFileSync, existsSync } from 'fs';
import { join, sep } from 'path';

const reArchetype      = /\*\*(?:Arquetipo|Archetype)(?:\s+(?:detectado|detected))?\*\*\s*\|\s*(.+)/i;
const reTlDr           = /\*\*TL;DR\*\*\s*\|\s*(.+)/i;
const reTlDrColon      = /\*\*TL;DR:\*\*\s*(.+)/i;
const reRemote         = /\*\*Remote\*\*\s*\|\s*(.+)/i;
const reComp           = /\*\*Comp\*\*\s*\|\s*(.+)/i;
const reArchetypeColon = /\*\*(?:Arquetipo|Archetype):\*\*\s*(.+)/i;
const reArchetypeYAML  = /^archetype:\s*"?([^"\n]+)"?\s*$/m;
const reReportURL      = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/m;
const reBatchID        = /^\*\*Batch ID:\*\*\s*(\d+)/m;
const reCoverLetterPDF = /PDF generated:\s*(output\/[^\s]+\.pdf)/;

function cleanCell(s) {
  return s.replace(/\|.*$/, '').trim();
}

/**
 * Extract key summary fields from the first 1000 bytes of a report file.
 * Returns { archetype, tldr, remote, comp, jobURL, batchId }.
 */
export function loadReportSummary(careerOpsPath, reportPath) {
  const full = join(careerOpsPath, reportPath);
  if (!existsSync(full)) return {};
  let text;
  try {
    const buf = readFileSync(full);
    text = buf.slice(0, 1000).toString('utf8');
  } catch { return {}; }

  const result = {};

  const archetypeM = reArchetype.exec(text) ?? reArchetypeColon.exec(text) ?? reArchetypeYAML.exec(text);
  if (archetypeM) result.archetype = cleanCell(archetypeM[1]);

  const tldrM = reTlDr.exec(text) ?? reTlDrColon.exec(text);
  if (tldrM) result.tldr = cleanCell(tldrM[1]).slice(0, 120);

  const remoteM = reRemote.exec(text);
  if (remoteM) result.remote = cleanCell(remoteM[1]);

  const compM = reComp.exec(text);
  if (compM) result.comp = cleanCell(compM[1]);

  const urlM = reReportURL.exec(text);
  if (urlM) result.jobURL = urlM[1].trim();

  const batchM = reBatchID.exec(text);
  if (batchM) result.batchId = batchM[1];

  return result;
}

/**
 * Scan report lines for a cover letter PDF path in the "## Cover Letter Draft" section.
 * Mirrors Go's parseCoverLetterPath.
 */
export function parseCoverLetterPath(lines, careerOpsPath) {
  let inCover = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('## Cover Letter Draft')) { inCover = true; continue; }
    if (inCover && t.startsWith('## ')) break;
    if (inCover) {
      const m = reCoverLetterPDF.exec(line);
      if (m) {
        const relPath = m[1];
        const abs = join(careerOpsPath, relPath.replace(/\//g, sep));
        if (existsSync(abs)) return relPath;
      }
    }
  }
  return '';
}
