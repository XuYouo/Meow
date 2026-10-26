import type { Preferences } from '../objects/Preferences.js';

export function defaultPreferences(): Preferences {
  return {
    revision: 0, updatedAt: '1970-01-01T00:00:00.000Z', title: 'Meow', theme: 'system', accentColor: '#818CF8',
    font: { family: 'system', size: 16, lineHeight: 1.6 },
    background: { mode: 'none', color: '#f7f7fa', mediaId: null, fit: 'cover', opacity: 0.15, brightness: 50, blur: 10, useRandom: false },
    avatarMediaId: null, hitokotoEnabled: true, hitokotoTypes: ['a', 'b', 'c', 'd', 'i', 'j', 'k'], aiEnabled: false, aiModel: '', musicEnabled: true, reviewTimezone: 'Asia/Shanghai',
  };
}
