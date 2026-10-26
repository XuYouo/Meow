import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import type { ServerConfig } from '../config.js';

export interface ErrorDiagnostic {
  readonly event: 'request_error';
  readonly requestId: string;
  readonly status: number;
  readonly code: string;
}

export function requestSecurity(config: ServerConfig): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data: https:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
    if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.path.startsWith('/api/')) {
      if (request.get('X-Meow-Request') !== '1') return next(new AppError(403, 'CSRF_REJECTED', 'Request verification failed.'));
      const origin = request.get('Origin');
      const expectedOrigin = `${request.protocol}://${request.get('host') || ''}`;
      if (origin && origin !== expectedOrigin && origin !== config.publicOrigin) {
        return next(new AppError(403, 'CSRF_REJECTED', 'Request origin is not allowed.'));
      }
    }
    next();
  };
}

export function errorHandler(log: (diagnostic: ErrorDiagnostic) => void): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An internal error occurred.';
    let details: unknown;
    if (error instanceof AppError) {
      ({ status, code, message } = error);
      if (['REVISION_CONFLICT', 'MEMO_DELETED', 'CANVAS_CONFLICT', 'PREFERENCES_CONFLICT', 'REVIEW_CONFLICT', 'MUSIC_CONFLICT'].includes(code)) details = error.details;
    } else if (error instanceof ZodError) {
      status = 400;
      code = 'INVALID_INPUT';
      message = 'The request does not match the API contract.';
    } else if (error instanceof SyntaxError && 'body' in error) {
      status = 400;
      code = 'INVALID_JSON';
      message = 'The request body is not valid JSON.';
    } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'The request is too large.';
    }
    const requestId: unknown = response.locals.requestId;
    const safeRequestId = typeof requestId === 'string' ? requestId : randomUUID();
    log({ event: 'request_error', requestId: safeRequestId, status, code });
    if (!response.headersSent) response.status(status).json({ error: { code, message, requestId: safeRequestId, ...(details === undefined ? {} : { details }) } });
    else response.end();
  };
}
