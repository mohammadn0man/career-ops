import { useEffect, useRef } from 'react';

type KeyHandler = (e: KeyboardEvent) => void;
type HandlerMap = Record<string, KeyHandler | (() => void)>;

/**
 * Registers keyboard shortcuts. Ignores events from INPUT/TEXTAREA/SELECT
 * so shortcuts don't fire while the user is typing in a form field.
 *
 * Keys are normalized:
 *   ArrowDown  → 'j'  (or 'ArrowDown')
 *   ArrowUp    → 'k'  (or 'ArrowUp')
 *   ArrowLeft  → 'h'
 *   ArrowRight → 'l'
 *   Enter, Escape, PageUp, PageDown, Home, End, Tab
 *   Letter keys: case-sensitive ('c' vs 'C')
 *   Ctrl combos: 'ctrl+d', 'ctrl+u'
 */
export function useKeyboard(handlers: HandlerMap, active = true): void {
  // Use a ref so we don't re-register the listener on every render
  const handlersRef = useRef<HandlerMap>(handlers);
  handlersRef.current = handlers;

  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (!activeRef.current) return;

      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      let key = normalizeKey(e);
      if (!key) return;

      const fn = handlersRef.current[key];
      if (fn) {
        e.preventDefault();
        (fn as KeyHandler)(e);
      }
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []); // intentionally empty — handler updated via ref
}

function normalizeKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'd') return 'ctrl+d';
    if (k === 'u') return 'ctrl+u';
  }
  if (e.metaKey || e.altKey) return null;
  if (e.ctrlKey) return null;

  switch (e.key) {
    case 'ArrowDown':  return e.shiftKey ? null : 'j';
    case 'ArrowUp':    return e.shiftKey ? null : 'k';
    case 'ArrowLeft':  return e.shiftKey ? null : 'h';
    case 'ArrowRight': return e.shiftKey ? null : 'l';
    case 'Enter':      return 'Enter';
    case 'Escape':     return 'Escape';
    case 'PageDown':   return 'PageDown';
    case 'PageUp':     return 'PageUp';
    case 'Home':       return 'Home';
    case 'End':        return 'End';
    case 'Tab':        return 'Tab';
    case ' ':          return ' ';
    default:
      if (e.key.length === 1) return e.key; // letters/digits/symbols, case-sensitive
      return null;
  }
}
