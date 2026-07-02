import { STATUS_OPTIONS } from '../lib/pipeline';
import { useKeyboard } from '../hooks/useKeyboard';

interface Props {
  cursor: number;
  onMoveCursor: (delta: number) => void;
  onConfirm: (status: string) => void;
  onClose: () => void;
}

export function StatusPicker({ cursor, onMoveCursor, onConfirm, onClose }: Props) {
  useKeyboard({
    k: () => onMoveCursor(-1),
    j: () => onMoveCursor(+1),
    Enter: () => onConfirm(STATUS_OPTIONS[cursor]),
    Escape: () => onClose(),
    q: () => onClose(),
  });

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-ctp-surface0 border border-ctp-overlay0 rounded-lg shadow-xl min-w-[220px]">
        <div className="px-4 py-2 border-b border-ctp-overlay0 text-ctp-blue font-bold text-sm">
          Change status
        </div>
        <ul className="py-1">
          {STATUS_OPTIONS.map((opt, i) => (
            <li
              key={opt}
              onClick={() => onConfirm(opt)}
              className={`px-4 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                i === cursor
                  ? 'bg-ctp-overlay0 text-ctp-text font-bold'
                  : 'text-ctp-subtext1 hover:bg-ctp-surface1'
              }`}
            >
              <span className="w-4 text-ctp-blue">{i === cursor ? '▶' : ' '}</span>
              {opt}
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-ctp-overlay0 text-ctp-overlay1 text-xs">
          ↑↓ navigate · Enter confirm · Esc cancel
        </div>
      </div>
    </div>
  );
}
