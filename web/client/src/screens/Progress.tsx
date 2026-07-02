import { useKeyboard } from '../hooks/useKeyboard';
import type { ProgressMetrics } from '../lib/types';

interface Props {
  metrics: ProgressMetrics;
  onClose: () => void;
}

function pct(n: number): string {
  return n > 0 ? `${n.toFixed(0)}%` : '0%';
}

function Bar({ value, max, color, label, count }: { value: number; max: number; color: string; label: string; count: number }) {
  const filled = max > 0 ? Math.round((value / max) * 40) : 0;
  const bar = '█'.repeat(filled) + '░'.repeat(40 - filled);
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="w-24 text-right text-ctp-subtext1 shrink-0">{label}</span>
      <span className={`${color} tracking-tight`}>{bar}</span>
      <span className="text-ctp-subtext0 shrink-0">{count}</span>
    </div>
  );
}

function SmallBar({ pctVal, label, color }: { pctVal: number; label: string; color: string }) {
  const filled = Math.round(pctVal / 2.5); // 40 chars = 100%
  const clamped = Math.min(40, Math.max(0, filled));
  const bar = '█'.repeat(clamped) + '░'.repeat(40 - clamped);
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="w-20 text-right text-ctp-subtext1 shrink-0">{label}</span>
      <span className={`${color} tracking-tight`}>{bar}</span>
      <span className="text-ctp-subtext0 shrink-0">{pct(pctVal)}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-ctp-mauve font-bold text-xs border-b border-ctp-overlay0 pb-0.5 mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="text-xs font-mono">
      <span className="text-ctp-sky">{label}: </span>
      <span className={cls ?? 'text-ctp-text'}>{value}</span>
    </div>
  );
}

export function Progress({ metrics, onClose }: Props) {
  useKeyboard({
    q: () => onClose(),
    Escape: () => onClose(),
    p: () => onClose(),
  });

  const {
    funnelStages, scoreBuckets, weeklyActivity,
    responseRate, interviewRate, offerRate,
    avgScore, topScore, totalOffers, activeApps,
  } = metrics;

  // Funnel — pct relative to "Evaluated" (all)
  const totalEval = funnelStages.find(s => s.label === 'Evaluated')?.count ?? 0;
  const maxBar = totalEval;

  // Score buckets
  const maxBucket = Math.max(...scoreBuckets.map(b => b.count), 1);

  // Weekly activity
  const maxWeek = Math.max(...weeklyActivity.map(w => w.count), 1);

  return (
    <div className="h-screen flex flex-col bg-ctp-base text-ctp-text font-mono text-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-ctp-surface0 px-3 py-1 flex-shrink-0">
        <span className="text-ctp-blue font-bold text-base">PIPELINE PROGRESS</span>
        <button onClick={onClose} className="text-ctp-subtext0 hover:text-ctp-text text-xs">
          ✕ Close [p/Esc/q]
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

        {/* Summary stats */}
        <Section title="Summary">
          <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
            <Stat label="Active apps"     value={String(activeApps)} />
            <Stat label="Total offers"    value={String(totalOffers)} cls="text-ctp-green" />
            <Stat label="Avg score"       value={`${avgScore.toFixed(2)}/5`} cls={avgScore >= 3.8 ? 'text-ctp-yellow' : 'text-ctp-text'} />
            <Stat label="Top score"       value={`${topScore.toFixed(1)}/5`} cls="text-ctp-green" />
            <Stat label="Response rate"   value={pct(responseRate)} />
            <Stat label="Interview rate"  value={pct(interviewRate)} />
          </div>
        </Section>

        {/* Funnel */}
        <Section title="Application funnel">
          {funnelStages.map(stage => (
            <Bar
              key={stage.label}
              label={stage.label}
              value={stage.count}
              max={maxBar}
              count={stage.count}
              color={
                stage.label === 'Interview' ? 'text-ctp-green' :
                stage.label === 'Offer'     ? 'text-ctp-peach' :
                stage.label === 'Responded' ? 'text-ctp-sky' :
                stage.label === 'Applied'   ? 'text-ctp-blue' :
                'text-ctp-overlay1'
              }
            />
          ))}
        </Section>

        {/* Score distribution */}
        <Section title="Score distribution">
          {scoreBuckets.map(bucket => (
            <Bar
              key={bucket.label}
              label={bucket.label}
              value={bucket.count}
              max={maxBucket}
              count={bucket.count}
              color={
                bucket.label === '4.5-5.0' ? 'text-ctp-green' :
                bucket.label === '4.0-4.4' ? 'text-ctp-yellow' :
                bucket.label === '3.5-3.9' ? 'text-ctp-peach' :
                'text-ctp-subtext0'
              }
            />
          ))}
        </Section>

        {/* Conversion rates */}
        <Section title="Conversion rates (% of Applied)">
          <SmallBar pctVal={responseRate}  label="Response"  color="text-ctp-sky"   />
          <SmallBar pctVal={interviewRate} label="Interview" color="text-ctp-green" />
          <SmallBar pctVal={offerRate}     label="Offer"     color="text-ctp-peach" />
        </Section>

        {/* Weekly activity */}
        {weeklyActivity.length > 0 && (
          <Section title="Weekly activity (last 8 weeks)">
            {weeklyActivity.map(w => (
              <div key={w.week} className="flex items-center gap-2 text-xs font-mono">
                <span className="w-12 text-right text-ctp-subtext1 shrink-0">
                  {w.week.replace(/^.*?-W/, 'W')}
                </span>
                <Bar
                  label=""
                  value={w.count}
                  max={maxWeek}
                  count={w.count}
                  color="text-ctp-blue"
                />
              </div>
            ))}
          </Section>
        )}

      </div>

      {/* Footer */}
      <div className="bg-ctp-surface0 px-3 py-0.5 text-xs text-ctp-subtext0 flex items-center justify-between flex-shrink-0">
        <span><kbd className="text-ctp-text">Esc/q/p</kbd> back to pipeline</span>
        <span className="text-ctp-overlay0">career-ops</span>
      </div>
    </div>
  );
}
