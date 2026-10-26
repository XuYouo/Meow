import type { Memo } from '../../../objects/memos/Memo';

export interface MemoFilter { query: string; tag: string; date: string; pinned: boolean }

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function selectMemos(memos: readonly Memo[], filter: MemoFilter): Memo[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return memos.filter((memo) =>
    (!query || `${memo.content} ${memo.tags.join(' ')}`.toLocaleLowerCase().includes(query)) &&
    (!filter.tag || memo.tags.some((tag) => tag === filter.tag || tag.startsWith(`${filter.tag}/`))) &&
    (!filter.date || localDate(new Date(memo.createdAt)) === filter.date) &&
    (!filter.pinned || memo.isPinned),
  ).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function memoTags(memos: readonly Memo[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const memo of memos) for (const tag of new Set(memo.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag, 'zh-CN'));
}

export function contributionDays(memos: readonly Memo[], now: Date): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const memo of memos) {
    const day = localDate(new Date(memo.createdAt));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: 365 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 364 + index);
    const day = localDate(date);
    return { date: day, count: counts.get(day) ?? 0 };
  });
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(/[\s,，]+/u).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean))];
}
