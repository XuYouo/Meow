export type Principal =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'owner'; readonly id: 'owner'; readonly sessionId: string };

export const anonymous: Principal = { kind: 'anonymous' };
