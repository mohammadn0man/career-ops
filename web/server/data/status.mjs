/**
 * Port of dashboard/internal/data/career.go: NormalizeStatus, StatusPriority, statusLabel.
 * Must stay in sync with Go implementation.
 */

export function normalizeStatus(raw) {
  let s = (raw ?? '').replace(/\*\*/g, '').trim().toLowerCase();
  const idx = s.indexOf(' 202');
  if (idx > 0) s = s.slice(0, idx).trimEnd();

  if (s.includes('no aplicar') || s.includes('no_aplicar') || s === 'skip' || s.includes('geo blocker')) return 'skip';
  if (s.includes('interview') || s.includes('entrevista')) return 'interview';
  if (s === 'offer' || s.includes('oferta')) return 'offer';
  if (s.includes('responded') || s.includes('respondido')) return 'responded';
  if (s.includes('applied') || s.includes('aplicado') || s === 'enviada' || s === 'aplicada' || s === 'sent') return 'applied';
  if (s.includes('rejected') || s.includes('rechazado') || s === 'rechazada') return 'rejected';
  if (
    s.includes('discarded') || s.includes('descartado') || s === 'descartada' ||
    s === 'cerrada' || s === 'cancelada' || s.startsWith('duplicado') || s.startsWith('dup')
  ) return 'discarded';
  if (
    s.includes('evaluated') || s.includes('evaluada') || s === 'condicional' ||
    s === 'hold' || s === 'monitor' || s === 'evaluar' || s === 'verificar'
  ) return 'evaluated';
  return s;
}

export function statusPriority(status) {
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

export function statusLabel(norm) {
  const map = {
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

/**
 * Update the status cell of an application row in applications.md.
 * Mirrors Go's replaceStatusInLine — whole-cell match, never substring.
 *
 * @param {string} content - Full file content
 * @param {string} reportNumber - Report number to find the row
 * @param {string} oldStatus - Current status text (for locating the cell)
 * @param {string} newStatus - Replacement status
 * @param {Map<string,number>} colmap - Header-detected column map
 * @returns {string} Updated file content
 */
export function replaceStatusInContent(content, reportNumber, oldStatus, newStatus, colmap) {
  const lines = content.split('\n');
  const statusIdx = colmap.get('status') ?? 6; // default legacy index

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    if (!line.includes(`[${reportNumber}]`)) continue;

    const parts = line.split('|');
    // Find the status cell — prefer canonical index, then scan for whole-cell match
    let targetIdx = -1;
    if (
      statusIdx < parts.length &&
      parts[statusIdx].trim().toLowerCase() === oldStatus.trim().toLowerCase()
    ) {
      targetIdx = statusIdx;
    } else {
      for (let j = 0; j < parts.length; j++) {
        if (parts[j].trim().toLowerCase() === oldStatus.trim().toLowerCase()) {
          targetIdx = j;
          break;
        }
      }
    }
    if (targetIdx < 0) continue;

    // Preserve surrounding whitespace (mirrors spliceCellValue in Go)
    const cell = parts[targetIdx];
    const trimmed = cell.trim();
    const start = cell.indexOf(trimmed);
    parts[targetIdx] = cell.slice(0, start) + newStatus + cell.slice(start + trimmed.length);
    lines[i] = parts.join('|');
    break;
  }

  return lines.join('\n');
}
