import { z } from 'zod';

export const EMOJI_CATEGORIES = [{ key: 'bili', label: 'bili', type: 'image', basePath: '/emoji/bili', manifest: '/emoji/bili/manifest.json', extensions: ['png', 'webp', 'gif'] }];
export interface EmojiItem { name: string; file: string }
export function getEmojiCategory(key: string) { return EMOJI_CATEGORIES.find((category) => category.key === key); }
export function buildEmojiUrl(categoryKey: string, name: string, extension = 'png') {
  const category = getEmojiCategory(categoryKey);
  if (!category || !/^[a-z0-9_-]+$/i.test(name) || !['png', 'webp', 'gif'].includes(extension)) return '';
  return `${category.basePath}/${name}.${extension}`;
}
const itemSchema = z.union([z.string().regex(/^[a-z0-9_-]+$/i), z.object({ name: z.string().regex(/^[a-z0-9_-]+$/i), file: z.string().regex(/^[a-z0-9_-]+\.(png|webp|gif)$/i).optional() })]);
export async function loadEmojiItems(categoryKey: string): Promise<EmojiItem[]> {
  const category = getEmojiCategory(categoryKey); if (!category) return [];
  const response = await fetch(category.manifest, { cache: 'force-cache' });
  if (!response.ok) throw new Error('表情清单暂时无法读取。');
  return itemSchema.array().parse(await response.json()).map((item) => typeof item === 'string' ? { name: item, file: `${item}.png` } : { name: item.name, file: item.file ?? `${item.name}.png` });
}
