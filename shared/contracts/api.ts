import { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiContract<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly input: Input;
  readonly output: Output;
}

export function defineContract<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny>(
  method: HttpMethod,
  path: string,
  input: Input,
  output: Output,
): ApiContract<Input, Output> {
  return Object.freeze({ method, path, input, output });
}

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }).strict(),
}).strict();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
