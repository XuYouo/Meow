export interface Session {
  readonly id: string;
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}
