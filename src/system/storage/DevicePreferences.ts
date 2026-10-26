import { z } from 'zod';
import { normalizeShortcut } from './KeyboardShortcut';

const shortcutSchema = z.string().min(1).max(80).refine((value) => normalizeShortcut(value) !== null, 'Invalid shortcut').nullable();
const keySchema = z.string().regex(/^[a-z0-9]$/i).nullable();
export const KeyboardShortcutsSchema = z.object({
  toggleSidebar: shortcutSchema,
  openAIDialog: shortcutSchema,
  openSettings: shortcutSchema,
  toggleCanvasMode: shortcutSchema,
  openDailyReview: shortcutSchema,
}).strict().superRefine((shortcuts, context) => {
  const active = Object.values(shortcuts).filter((value): value is string => value !== null).map(normalizeShortcut);
  if (new Set(active).size !== active.length) context.addIssue({ code: 'custom', message: 'Each action must use a different shortcut.' });
});
export type KeyboardShortcuts = z.infer<typeof KeyboardShortcutsSchema>;
export const defaultKeyboardShortcuts: KeyboardShortcuts = { toggleSidebar: 'Tab', openAIDialog: 'Ctrl+Space', openSettings: 'Ctrl+,', toggleCanvasMode: 'Ctrl+/', openDailyReview: 'Ctrl+\\' };
export const DevicePreferencesSchema = z.object({ newMemoKey: keySchema, searchKey: keySchema, submitShortcut: z.boolean(), showContext: z.boolean(), shortcuts: KeyboardShortcutsSchema.default(defaultKeyboardShortcuts), sidebarPins: z.object({ left: z.boolean(), right: z.boolean() }).default({ left: true, right: true }), guestTheme: z.enum(['light', 'dark']).nullable().default(null) });
export type DevicePreferences = z.infer<typeof DevicePreferencesSchema>;
export const defaultDevicePreferences: DevicePreferences = { newMemoKey: 'n', searchKey: 'k', submitShortcut: true, showContext: true, shortcuts: defaultKeyboardShortcuts, sidebarPins: { left: true, right: true }, guestTheme: null };
const listeners = new Map<string, Set<() => void>>();

export function readDevicePreferences(instanceId: string): DevicePreferences {
  try {
    const parsed = DevicePreferencesSchema.safeParse(JSON.parse(localStorage.getItem(`meow:v2:${instanceId}:device:preferences`) ?? 'null'));
    return parsed.success ? parsed.data : DevicePreferencesSchema.parse(defaultDevicePreferences);
  } catch { return DevicePreferencesSchema.parse(defaultDevicePreferences); }
}

export function saveDevicePreferences(instanceId: string, value: DevicePreferences): void {
  localStorage.setItem(`meow:v2:${instanceId}:device:preferences`, JSON.stringify(DevicePreferencesSchema.parse(value)));
  for (const listener of listeners.get(instanceId) ?? []) listener();
}

export function subscribeDevicePreferences(instanceId: string, listener: () => void): () => void {
  const group = listeners.get(instanceId) ?? new Set<() => void>();
  group.add(listener); listeners.set(instanceId, group);
  const storage = (event: StorageEvent) => { if (event.key === `meow:v2:${instanceId}:device:preferences`) listener(); };
  window.addEventListener('storage', storage);
  return () => { group.delete(listener); if (!group.size) listeners.delete(instanceId); window.removeEventListener('storage', storage); };
}
