const listeners = new Set<() => void>();

// This event carries no business data. It invalidates the display authority of
// all private features as soon as any transport observes an expired session.
export function notifySessionExpired(): void {
  for (const listener of listeners) listener();
}

export function subscribeSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
