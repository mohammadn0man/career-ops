import { useKeyboard } from '../hooks/useKeyboard';

interface Props {
  choices: string[];
  cursor: number;
  onMoveCursor: (delta: number) => void;
  onConfirm: (path: string) => void;
  onClose: () => void;
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function PdfPicker({ choices, cursor, onMoveCursor, onConfirm, onClose }: Props) {
  useKeyboard({
    k: () => onMoveCursor(-1),
    j: () => onMoveCursor(+1),
    Enter: () => choices[cursor] && onConfirm(choices[cursor]),
    d: () => choices[cursor] && onConfirm(choices[cursor]),
    Escape: () => onClose(),
    q: () => onClose(),
  });

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-ctp-surface0 border border-ctp-overlay0 rounded-lg shadow-xl min-w-[320px] max-w-[520px]">
        <div className="px-4 py-2 border-b border-ctp-overlay0 text-ctp-blue font-bold text-sm">
          Open CV PDF
        </div>
        <ul className="py-1">
          {choices.map((choice, i) => (
            <li
              key={choice}
              onClick={() => onConfirm(choice)}
              className={`px-4 py-1.5 text-sm cursor-pointer truncate flex items-center gap-2 ${
                i === cursor
                  ? 'bg-ctp-overlay0 text-ctp-text font-bold'
                  : 'text-ctp-subtext1 hover:bg-ctp-surface1'
              }`}
            >
              <span className="text-ctp-blue w-4">{i === cursor ? '▶' : ' '}</span>
              <span className="truncate">{basename(choice)}</span>
            </li>
          ))}
          {choices.length === 0 && (
            <li className="px-4 py-2 text-sm text-ctp-overlay1">No PDFs found</li>
          )}
        </ul>
        <div className="px-4 py-2 border-t border-ctp-overlay0 text-ctp-overlay1 text-xs">
          ↑↓ navigate · Enter/d open · Esc cancel
        </div>
      </div>
    </div>
  );
}
