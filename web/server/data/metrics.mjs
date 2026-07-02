/**
 * Port of dashboard/internal/data/career.go: ComputeMetrics, ComputeProgressMetrics.
 */

import { normalizeStatus } from './status.mjs';

export function computeMetrics(apps) {
  const m = { total: apps.length, byStatus: {}, avgScore: 0, topScore: 0, withPDF: 0, actionable: 0 };
  let totalScore = 0, scored = 0;

  for (const app of apps) {
    const norm = normalizeStatus(app.status);
    m.byStatus[norm] = (m.byStatus[norm] ?? 0) + 1;
    if (app.score > 0) {
      totalScore += app.score;
      scored++;
      if (app.score > m.topScore) m.topScore = app.score;
    }
    if (app.hasPDF) m.withPDF++;
    if (norm !== 'skip' && norm !== 'rejected' && norm !== 'discarded') m.actionable++;
  }
  if (scored > 0) m.avgScore = totalScore / scored;
  return m;
}

/** ISO week key: "2026-W14" — matches Go's time.ISOWeek exactly. */
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  // Thursday of the week that contains this date
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((thu - yearStart) / 86400000) + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function safePct(part, whole) {
  if (whole === 0) return 0;
  return (part / whole) * 100;
}

export function computeProgressMetrics(apps) {
  const pm = {
    funnelStages:   [],
    scoreBuckets:   [],
    weeklyActivity: [],
    responseRate:   0,
    interviewRate:  0,
    offerRate:      0,
    avgScore:       0,
    topScore:       0,
    totalOffers:    0,
    activeApps:     0,
  };

  const statusCounts = {};
  let totalScore = 0, scored = 0;

  for (const app of apps) {
    const norm = normalizeStatus(app.status);
    statusCounts[norm] = (statusCounts[norm] ?? 0) + 1;
    if (app.score > 0) {
      totalScore += app.score;
      scored++;
      if (app.score > pm.topScore) pm.topScore = app.score;
    }
    if (norm === 'offer') pm.totalOffers++;
    if (norm !== 'skip' && norm !== 'rejected' && norm !== 'discarded') pm.activeApps++;
  }
  if (scored > 0) pm.avgScore = totalScore / scored;

  // Funnel (cumulative stages)
  const total     = apps.length;
  const applied   = (statusCounts.applied ?? 0) + (statusCounts.responded ?? 0) + (statusCounts.interview ?? 0) + (statusCounts.offer ?? 0) + (statusCounts.rejected ?? 0);
  const responded = (statusCounts.responded ?? 0) + (statusCounts.interview ?? 0) + (statusCounts.offer ?? 0);
  const interview = (statusCounts.interview ?? 0) + (statusCounts.offer ?? 0);
  const offer     = statusCounts.offer ?? 0;

  pm.funnelStages = [
    { label: 'Evaluated', count: total,     pct: 100 },
    { label: 'Applied',   count: applied,   pct: safePct(applied, total) },
    { label: 'Responded', count: responded, pct: safePct(responded, applied) },
    { label: 'Interview', count: interview, pct: safePct(interview, applied) },
    { label: 'Offer',     count: offer,     pct: safePct(offer, applied) },
  ];

  if (applied > 0) {
    pm.responseRate  = responded / applied * 100;
    pm.interviewRate = interview / applied * 100;
    pm.offerRate     = offer     / applied * 100;
  }

  // Score buckets
  const buckets = [0, 0, 0, 0, 0]; // 4.5+, 4.0-4.4, 3.5-3.9, 3.0-3.4, <3.0
  for (const app of apps) {
    if (app.score <= 0) continue;
    if      (app.score >= 4.5) buckets[0]++;
    else if (app.score >= 4.0) buckets[1]++;
    else if (app.score >= 3.5) buckets[2]++;
    else if (app.score >= 3.0) buckets[3]++;
    else                       buckets[4]++;
  }
  pm.scoreBuckets = [
    { label: '4.5-5.0', count: buckets[0] },
    { label: '4.0-4.4', count: buckets[1] },
    { label: '3.5-3.9', count: buckets[2] },
    { label: '3.0-3.4', count: buckets[3] },
    { label: '  <3.0',  count: buckets[4] },
  ];

  // Weekly activity (last 8 ISO weeks)
  const weekCounts = new Map();
  for (const app of apps) {
    if (!app.date) continue;
    const key = isoWeekKey(app.date);
    if (!key) continue;
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }
  let weeks = [...weekCounts.keys()].sort();
  if (weeks.length > 8) weeks = weeks.slice(-8);
  pm.weeklyActivity = weeks.map(w => ({ week: w, count: weekCounts.get(w) ?? 0 }));

  return pm;
}
