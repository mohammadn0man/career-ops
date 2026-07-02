import type { VisibleCols, ColId } from '../screens/Pipeline';
import { useKeyboard } from '../hooks/useKeyboard';

export const OPTIONAL_COLS: { id: ColId; header: string; hint?: string; defaultOn: boolean }[] = [
  { id: 'date',     header: 'APPLIED',   defaultOn: true  },
  { id: 'location', header: 'LOCATION',  defaultOn: true  },
  { id: 'pay',      header: 'PAY',       defaultOn: true  },
  { id: 'rpt',      header: 'RPT',       hint: '✓/—', defaultOn: false },
  { id: 'pdf',      header: 'PDF',       hint: '✓/—', defaultOn: false },
  { id: 'last',     header: 'LAST',      defaultOn: false },
];

interface Props {
  cursor: number;
  visibleCols: VisibleCols;
  onMoveCursor: (delta: number) => void;
  onToggle: (id: ColId) => void;
  onClose: () => void;
}

export function ColumnPicker({ cursor, visibleCols, onMoveCursor, onToggle, onClose }: Props) {
  useKeyboard({
    k: () => onMoveCursor(-1),
    j: () => onMoveCursor(+1),
    ' ': () => onToggle(OPTIONAL_COLS[cursor].id),
    Escape: () => onClose(),
    C: () => onClose(),
  });

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-ctp-surface0 border border-ctp-overlay0 rounded-lg shadow-xl min-w-[240px]">
        <div className="px-4 py-2 border-b border-ctp-overlay0 text-ctp-blue font-bold text-sm">
          Columns  <span className="text-ctp-overlay1 font-normal">SPACE toggle · Esc close</span>
        </div>
        <ul className="py-1">
          {OPTIONAL_COLS.map((col, i) => (
            <li
              key={col.id}
              onClick={() => onToggle(col.id)}
              className={`px-4 py-1.5 text-sm cursor-pointer flex items-center gap-3 ${
                i === cursor
                  ? 'bg-ctp-overlay0 text-ctp-text'
                  : 'text-ctp-subtext1 hover:bg-ctp-surface1'
              }`}
            >
              <span className={visibleCols[col.id] ? 'text-ctp-green' : 'text-ctp-overlay1'}>
                {visibleCols[col.id] ? '[✓]' : '[ ]'}
              </span>
              <span>{col.header}</span>
              {col.hint && <span className="text-ctp-overlay1 text-xs">{col.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
