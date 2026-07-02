import { useState, useEffect, useCallback } from 'react';
import type { CareerApp, PipelineMetrics, ProgressMetrics, ReportData } from './lib/types';
import { api } from './lib/api';
import { Pipeline } from './screens/Pipeline';
import { Report } from './screens/Report';
import { Progress } from './screens/Progress';

type Screen = 'pipeline' | 'report' | 'progress';

export default function App() {
  const [screen, setScreen]     = useState<Screen>('pipeline');
  const [apps, setApps]         = useState<CareerApp[]>([]);
  const [metrics, setMetrics]   = useState<PipelineMetrics | null>(null);
  const [progress, setProgress] = useState<ProgressMetrics | null>(null);
  const [report, setReport]     = useState<ReportData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // ── Load applications ──────────────────────────────────────────────────────

  const loadApps = useCallback(async () => {
    try {
      const data = await api.getApplications();
      setApps(data.apps);
      setMetrics(data.metrics);
      setError('');
    } catch (e) {
      setError(`Failed to load pipeline: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  // ── SSE subscription for auto-refresh ──────────────────────────────────────

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'tracker-changed') loadApps();
      } catch { /* ignore malformed */ }
    };
    es.onerror = () => { /* server may not be available, fail silently */ };
    return () => es.close();
  }, [loadApps]);

  // ── Navigation helpers ──────────────────────────────────────────────────────

  const openReport = useCallback(async (app: CareerApp) => {
    try {
      const data = await api.getReport(app.reportPath);
      setReport(data);
      setScreen('report');
    } catch (e) {
      console.error('Failed to load report:', e);
    }
  }, []);

  const openProgress = useCallback(async () => {
    try {
      const data = await api.getProgress();
      setProgress(data);
      setScreen('progress');
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
  }, []);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen bg-ctp-base flex items-center justify-center text-ctp-blue font-mono">
        Loading pipeline…
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-ctp-base flex flex-col items-center justify-center gap-4 text-ctp-red font-mono px-8 text-center">
        <div className="text-2xl">⚠</div>
        <div>{error}</div>
        <div className="text-ctp-subtext0 text-sm">
          Make sure the career-ops web server is running on port 3333.
        </div>
        <button
          onClick={loadApps}
          className="mt-2 px-4 py-2 bg-ctp-surface0 text-ctp-blue rounded hover:bg-ctp-surface1 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Screen router ───────────────────────────────────────────────────────────

  if (screen === 'report' && report) {
    return (
      <Report
        reportData={report}
        onClose={() => setScreen('pipeline')}
        onStatusUpdated={loadApps}
      />
    );
  }

  if (screen === 'progress' && progress) {
    return (
      <Progress
        metrics={progress}
        onClose={() => setScreen('pipeline')}
      />
    );
  }

  return (
    <Pipeline
      apps={apps}
      metrics={metrics!}
      onOpenReport={openReport}
      onOpenProgress={openProgress}
      onRefresh={loadApps}
    />
  );
}
