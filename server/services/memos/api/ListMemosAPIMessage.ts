import type { z } from 'zod';
import { ListMemosInputSchema } from '../../../../shared/contracts/memos/index.js';
import { listMemoRows } from '../tables/memos/table.js';
import { projectMemo } from '../utils/projectMemo.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

export function plan(input: z.infer<typeof ListMemosInputSchema>, deps: MemoDependencies) {
  const publicOnly = deps.principal.kind !== 'owner';
  const { rows,total } = listMemoRows(deps.db,{ ...input,publicOnly });
  const next = input.offset+rows.length;
  return { items: rows.map((row) => projectMemo(deps.db,row,publicOnly)),total,offset: input.offset,limit: input.limit,nextOffset: next < total ? next : null };
}
