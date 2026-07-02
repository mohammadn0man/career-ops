export interface CareerApp {
  number:       number;
  date:         string;
  company:      string;
  role:         string;
  status:       string;
  score:        number;
  scoreRaw:     string;
  hasPDF:       boolean;
  reportPath:   string;
  reportNumber: string;
  notes:        string;
  jobURL:       string;
  // derived from notes
  location:     string;
  workMode:     string;
  payRange:     string;
  payMax:       number;
  paySource:    string;
  lastContact:  string;
  // enriched from report
  archetype:    string;
  tldr:         string;
  remote:       string;
  compEstimate: string;
}

export interface PipelineMetrics {
  total:      number;
  byStatus:   Record<string, number>;
  avgScore:   number;
  topScore:   number;
  withPDF:    number;
  actionable: number;
}

export interface FunnelStage {
  label: string;
  count: number;
  pct:   number;
}

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface WeekActivity {
  week:  string;
  count: number;
}

export interface ProgressMetrics {
  funnelStages:   FunnelStage[];
  scoreBuckets:   ScoreBucket[];
  weeklyActivity: WeekActivity[];
  responseRate:   number;
  interviewRate:  number;
  offerRate:      number;
  avgScore:       number;
  topScore:       number;
  totalOffers:    number;
  activeApps:     number;
}

export type FilterTab = 'all' | 'evaluated' | 'applied' | 'interview' | 'top' | 'skip' | 'rejected' | 'discarded';
export type SortMode  = 'score' | 'date' | 'company' | 'status' | 'location' | 'pay' | 'last';
export type ViewMode  = 'grouped' | 'flat';

export interface ReportData {
  path:             string;
  title:            string;
  jobURL:           string;
  coverLetterPath:  string;
  markdown:         string;
  app:              Partial<CareerApp>;
}
