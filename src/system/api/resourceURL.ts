import { z } from 'zod';
import type { ApiContract } from '../../../shared/contracts/api';

/** Browser media elements use the same origin and cookie as the JSON sender. */
export function resourceURL<I extends z.ZodTypeAny,O extends z.ZodTypeAny>(contract: ApiContract<I,O>,input: z.input<I>): string {
  if (contract.method!=='GET') throw new Error('A browser resource must use GET.');
  const remaining=z.record(z.string(),z.unknown()).parse(contract.input.parse(input));
  const path=contract.path.replace(/:([^/]+)/g,(_match,key: string) => {
    const value=remaining[key];
    if (typeof value!=='string'&&typeof value!=='number') throw new Error('Invalid resource identifier.');
    delete remaining[key];return encodeURIComponent(String(value));
  });
  const query=new URLSearchParams();
  for (const [key,value] of Object.entries(remaining)) if (value!==undefined&&value!==null) query.set(key,String(value));
  return `${path}${query.size?`?${query}`:''}`;
}
