import { lookup, Resolver } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import ipaddr from 'ipaddr.js';
import { AppError } from '../errors/AppError.js';

export interface ExternalResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Readable;
  readonly url: string;
}
export interface ExternalRequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly redirects?: number;
}
export type ExternalRequest = (url: string, options?: ExternalRequestOptions) => Promise<ExternalResponse>;
export type ResolveAddresses = (hostname: string) => Promise<readonly { address: string; family: number }[]>;

/** Operator-selected DNS is useful when the system resolver returns proxy Fake-IP ranges. */
export const resolveConfiguredAddresses: ResolveAddresses = async (hostname) => {
  const servers = process.env.MEOW_DNS_SERVERS?.split(',').map((server) => server.trim()).filter(Boolean);
  if (!servers?.length) return lookup(hostname, { all: true, verbatim: true });
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  try { resolver.setServers(servers); } catch { throw new AppError(500, 'INVALID_DNS_CONFIG', '外部服务DNS配置无效。'); }
  const results = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
  return results.flatMap((result, index) => result.status === 'fulfilled' ? result.value.map((address) => ({ address, family: index === 0 ? 4 : 6 })) : []);
};

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);
  return parsed.range() === 'unicast';
}

export async function resolvePublicTarget(url: string, resolve: ResolveAddresses = resolveConfiguredAddresses) {
  let target: URL;
  try { target = new URL(url); } catch { throw new AppError(400, 'INVALID_EXTERNAL_URL', '外部地址无效。'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.hash || target.href.length > 4096) {
    throw new AppError(400, 'UNSAFE_EXTERNAL_URL', '外部地址必须使用不含凭据的 HTTPS。');
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([
    resolve(hostname),
    new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new AppError(504, 'EXTERNAL_TIMEOUT', '外部地址解析超时。')), 5000); }),
  ]).catch((error: unknown) => {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'EXTERNAL_DNS_FAILED', '外部服务地址解析失败。');
  }).finally(() => { if (deadline) clearTimeout(deadline); });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new AppError(400, 'UNSAFE_EXTERNAL_URL', '禁止访问本机、内网或保留地址。');
  }
  const selected = addresses[0];
  if (!selected) throw new AppError(502, 'EXTERNAL_DNS_FAILED', '外部服务地址解析失败。');
  return { target, hostname, address: selected.address, family: selected.family };
}

export const safeRequest: ExternalRequest = async (url, options = {}) => {
  let currentUrl = url;
  let headers = { ...options.headers };
  for (let hop = 0; hop <= (options.redirects ?? 3); hop++) {
    options.signal?.throwIfAborted();
    const { target, hostname, address, family } = await resolvePublicTarget(currentUrl);
    const response = await new Promise<ExternalResponse>((resolve, reject) => {
      const request = https.request({
        hostname: address,
        family,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: options.method ?? 'GET',
        headers: { ...headers, Host: target.host, 'User-Agent': 'Meow/2', 'Accept-Encoding': 'identity' },
        servername: isIP(hostname) ? undefined : hostname,
        checkServerIdentity: (_serverName, certificate) => checkServerIdentity(hostname, certificate),
        signal: options.signal,
        agent: false,
      }, (incoming) => {
        const clear = () => clearTimeout(deadline);
        incoming.once('end', clear);
        incoming.once('close', clear);
        resolve({ status: incoming.statusCode ?? 502, headers: incoming.headers, body: incoming, url: currentUrl });
      });
      const deadline = setTimeout(() => request.destroy(new AppError(504, 'EXTERNAL_TIMEOUT', '外部服务响应超时。')), 45_000);
      deadline.unref();
      request.once('error', (error) => { clearTimeout(deadline); reject(error); });
      request.end(options.body);
    }).catch((error: unknown) => {
      if (error instanceof AppError || options.signal?.aborted) throw error;
      throw new AppError(502, 'EXTERNAL_UNAVAILABLE', '外部服务暂时不可用。');
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.body.destroy();
      const location = response.headers.location;
      if (!location || hop === (options.redirects ?? 3) || options.method === 'POST') {
        throw new AppError(502, 'EXTERNAL_REDIRECT', '外部服务重定向超出允许范围。');
      }
      let nextUrl: string;
      try { nextUrl = new URL(location, currentUrl).href; }
      catch { throw new AppError(502, 'EXTERNAL_REDIRECT', '外部服务返回了无效的重定向地址。'); }
      if (new URL(nextUrl).origin !== new URL(currentUrl).origin) headers = {};
      currentUrl = nextUrl;
      continue;
    }
    return response;
  }
  throw new AppError(502, 'EXTERNAL_REDIRECT', '外部服务重定向超出允许范围。');
};

export async function readLimited(response: ExternalResponse, maxBytes: number): Promise<Buffer> {
  const buffers: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > maxBytes) throw new AppError(502, 'EXTERNAL_TOO_LARGE', '外部响应超过大小限制。');
      buffers.push(bytes);
    }
  } catch (error) {
    response.body.destroy();
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'EXTERNAL_UNAVAILABLE', '外部响应中断。');
  }
  return Buffer.concat(buffers);
}

export async function readExternalJson(response: ExternalResponse): Promise<unknown> {
  if (response.status < 200 || response.status >= 300) {
    response.body.destroy();
    throw new AppError(502, 'EXTERNAL_UNAVAILABLE', '外部服务请求未成功。');
  }
  const body = await readLimited(response, 2 * 1024 * 1024);
  try { return JSON.parse(body.toString('utf8')) as unknown; } catch { throw new AppError(502, 'INVALID_EXTERNAL_RESPONSE', '外部服务返回了无效内容。'); }
}
