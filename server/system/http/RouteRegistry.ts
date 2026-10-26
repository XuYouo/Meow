import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { ApiContract } from '../../../shared/contracts/api.js';
import type { Principal } from '../auth/Principal.js';
import type { UnitOfWork } from '../database/UnitOfWork.js';
import { AppError } from '../errors/AppError.js';

export interface RouteContext {
  readonly principal: Principal;
  readonly requestId: string;
  readonly request: Request;
  readonly response: Response;
}

export interface RegisteredRoute<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  readonly contract: ApiContract<I, O>;
  readonly access: 'public' | 'owner';
  /** False only for network/file work; wrap each database change in a short unit.run. */
  readonly transactional?: boolean;
  readonly handler: (input: z.infer<I>, context: RouteContext) => z.infer<O> | Promise<z.infer<O>>;
}

export class RouteRegistry {
  private readonly registrations = new Set<string>();

  constructor(
    private readonly app: Express,
    private readonly unitOfWork: UnitOfWork,
    private readonly resolvePrincipal: (request: Request) => Principal,
  ) {}

  register<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(route: RegisteredRoute<I, O>): void {
    const parseOutput = (output: unknown): z.infer<O> => {
      const result = route.contract.output.safeParse(output);
      if (!result.success) throw new AppError(500, 'INVALID_RESPONSE', 'An internal error occurred.');
      return result.data;
    };
    if (route.access !== 'public' && route.access !== 'owner') throw new Error('Every API route must explicitly declare access.');
    const routeKey = `${route.contract.method} ${route.contract.path.replace(/:[^/]+/g, ':parameter')}`;
    if (this.registrations.has(routeKey)) throw new Error(`Duplicate API registration: ${routeKey}`);
    this.registrations.add(routeKey);
    const dispatch = (request: Request, response: Response, next: (error?: unknown) => void) => {
      try {
        const invoke = () => {
          const principal = this.resolvePrincipal(request);
          if (route.access === 'owner' && principal.kind !== 'owner') throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');
          const body: unknown = request.body;
          if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body))) {
            throw new AppError(400, 'INVALID_INPUT', 'The request body must be a JSON object.');
          }
          const input = route.contract.input.parse({ ...request.query, ...(body ?? {}), ...request.params });
          const requestId: unknown = response.locals.requestId;
          if (typeof requestId !== 'string') throw new Error('Missing request identifier.');
          const output = route.handler(input, { principal, requestId, request, response });
          return output instanceof Promise ? output.then(parseOutput) : parseOutput(output);
        };
        const result = route.transactional === false ? invoke() : this.unitOfWork.run(invoke);
        Promise.resolve(result)
          .then((output) => {
            if (!response.headersSent) response.json(output);
          })
          .catch(next);
      } catch (error) {
        next(error);
      }
    };
    switch (route.contract.method) {
      case 'GET': this.app.get(route.contract.path, dispatch); break;
      case 'POST': this.app.post(route.contract.path, dispatch); break;
      case 'PATCH': this.app.patch(route.contract.path, dispatch); break;
      case 'DELETE': this.app.delete(route.contract.path, dispatch); break;
    }
  }
}
