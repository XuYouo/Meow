export interface ReviewResult {
  readonly memoId: string;
  readonly day: string;
  readonly timezone: string;
  readonly result: 'PASS' | 'FAIL' | null;
  readonly revision: number;
  readonly updatedAt: string;
}
