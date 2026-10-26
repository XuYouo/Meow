export interface Preferences {
  readonly revision: number;
  readonly updatedAt: string;
  readonly title: string;
  readonly theme: 'system' | 'light' | 'dark';
  readonly accentColor: string;
  readonly font: { readonly family: 'system' | 'serif' | 'mono' | 'jinghua' | 'lxgw' | 'kongshan'; readonly size: number; readonly lineHeight: number };
  readonly background: { readonly mode: 'none' | 'color' | 'image'; readonly color: string; readonly mediaId: string | null; readonly fit: 'cover' | 'contain'; readonly opacity: number; readonly brightness: number; readonly blur: number; readonly useRandom: boolean };
  readonly avatarMediaId: string | null;
  readonly hitokotoEnabled: boolean;
  readonly hitokotoTypes: readonly ('a' | 'b' | 'c' | 'd' | 'i' | 'j' | 'k')[];
  readonly aiEnabled: boolean;
  readonly aiModel: string;
  readonly musicEnabled: boolean;
  readonly reviewTimezone: string;
}
