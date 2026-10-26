export interface Track {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly source: { readonly kind: 'media'; readonly mediaId: string } | { readonly kind: 'external'; readonly url: string };
  readonly coverMediaId: string | null;
  readonly lyricsMediaId: string | null;
  readonly lyrics: string;
  readonly danmaku: readonly { readonly at: number; readonly text: string }[];
  readonly duration: number | null;
  readonly revision: number;
  readonly position: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
