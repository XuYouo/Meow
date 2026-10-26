const modifiers = ['Ctrl', 'Alt', 'Shift'] as const;
const namedKeys = new Set(['Tab', 'Enter', 'Escape', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Plus', ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)]);

export function normalizeShortcut(value: string): string | null {
  const parts = value.trim().split('+');
  const key = parts.pop();
  if (!key || parts.some((part) => !modifiers.some((modifier) => modifier === part)) || new Set(parts).size !== parts.length) return null;
  if (key.length !== 1 && !namedKeys.has(key)) return null;
  const normalized = key.length === 1 ? key.toUpperCase() : key;
  return [...modifiers.filter((modifier) => parts.includes(modifier)), normalized].join('+');
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'Dead', 'Process', 'Unidentified'].includes(event.key)) return null;
  const key = event.key === ' ' ? 'Space' : event.key === '+' ? 'Plus' : event.key;
  return normalizeShortcut([...(event.ctrlKey || event.metaKey ? ['Ctrl'] : []), ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), key].join('+'));
}

export function matchesShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>, binding: string | null): boolean {
  if (!binding) return false;
  const normalized = normalizeShortcut(binding);
  if (!normalized) return false;
  // The original app treats Ctrl and Command as the same cross-platform primary modifier.
  return shortcutFromEvent(event) === normalized;
}
