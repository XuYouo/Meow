import { AppError } from '../../../system/errors/AppError.js';

export class AttemptLimiter {
  private readonly attempts = new Map<string, { count: number; until: number }>();

  constructor(private readonly now: () => number, private readonly maxAttempts = 5, private readonly windowMs = 15 * 60_000) {}

  attempt(key: string): void {
    const timestamp = this.now();
    for (const [address, value] of this.attempts) {
      if (value.until <= timestamp) this.attempts.delete(address);
    }
    const current = this.attempts.get(key) ?? { count: 0, until: timestamp + this.windowMs };
    if (current.count >= this.maxAttempts) throw new AppError(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.');
    // Bound memory without making a per-address limit evictable by an attacker.
    if (!this.attempts.has(key) && this.attempts.size >= 10_000) throw new AppError(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.');
    this.attempts.set(key, { ...current, count: current.count + 1 });
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}
