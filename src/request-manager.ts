import { HTTPError, type Options as KyOptions } from "ky";

import type { CacheManager, FetchResult, Freshness } from "./cache";
import { PawPlacerApiError } from "./errors";
import type { ApiResponseMeta, RateLimitInfo } from "./types";

export interface GetOptions {
  searchParams?: URLSearchParams;
  /** Cache key; defaults to the path plus query string. */
  cacheKey?: string;
  /** Skip the cache and fetch from the API. */
  forceRefresh?: boolean;
}

export interface WriteOptions {
  json: unknown;
  searchParams?: URLSearchParams;
  /** `false` sends no key. Defaults to a random UUID. */
  idempotencyKey?: string | false;
  /** Retry on 5xx/429/timeouts. Defaults to true when an idempotency key is sent. */
  retry?: boolean;
}

function parseInteger(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const limit = parseInteger(headers.get("x-ratelimit-limit"));
  const remaining = parseInteger(headers.get("x-ratelimit-remaining"));
  const reset = parseInteger(headers.get("x-ratelimit-reset"));
  // The API sends `X-RateLimit-Remaining: -1` when it couldn't determine usage.
  if (
    limit === undefined ||
    remaining === undefined ||
    remaining < 0 ||
    reset === undefined
  ) {
    return undefined;
  }
  const rateLimit: RateLimitInfo = { limit, remaining, reset };
  const retryAfter = parseInteger(headers.get("retry-after"));
  if (retryAfter !== undefined && retryAfter >= 0) {
    rateLimit.retryAfter = retryAfter;
  }
  return rateLimit;
}

function parseResponseMeta(headers: Headers): ApiResponseMeta {
  const meta: ApiResponseMeta = {};
  const requestId = headers.get("x-request-id");
  if (requestId) meta.requestId = requestId;
  const apiVersion = headers.get("x-api-version");
  if (apiVersion) meta.apiVersion = apiVersion;
  const generatedAt = headers.get("x-generated-at");
  if (generatedAt) meta.generatedAt = generatedAt;
  const rateLimit = parseRateLimit(headers);
  if (rateLimit) meta.rateLimit = rateLimit;
  if (headers.get("idempotency-replay")?.toLowerCase() === "true") {
    meta.idempotencyReplay = true;
  }
  if (headers.get("x-pawplacer-sample-data")?.toLowerCase() === "true") {
    meta.sampleData = true;
  }
  return meta;
}

/** Reads `max-age` and `stale-while-revalidate` from Cache-Control. */
export function parseCacheControl(
  value: string | null,
): Partial<Freshness> | undefined {
  if (!value) return undefined;
  const directives = new Map<string, string | undefined>();
  for (const part of value.toLowerCase().split(",")) {
    const [name, arg] = part.trim().split("=");
    if (name) directives.set(name, arg?.trim());
  }
  if (directives.has("no-store") || directives.has("no-cache")) {
    return { maxAgeMs: 0, staleWhileRevalidateMs: 0 };
  }
  const seconds = (name: string) => {
    const parsed = parseInteger(directives.get(name) ?? null);
    return parsed !== undefined && parsed >= 0 ? parsed * 1000 : undefined;
  };
  const freshness: Partial<Freshness> = {};
  const maxAgeMs = seconds("max-age");
  const staleWhileRevalidateMs = seconds("stale-while-revalidate");
  if (maxAgeMs !== undefined) freshness.maxAgeMs = maxAgeMs;
  if (staleWhileRevalidateMs !== undefined) {
    freshness.staleWhileRevalidateMs = staleWhileRevalidateMs;
  }
  return Object.keys(freshness).length > 0 ? freshness : undefined;
}

/**
 * A ky instance, typed structurally so ky's ESM-only types stay out of the
 * published declarations (CommonJS consumers can't import them).
 */
type HttpClient = (path: string, options: object) => Promise<Response>;

/** Sends requests through ky, records response metadata, and applies the cache to GETs. */
export class RequestManager {
  private _lastResponseMeta: ApiResponseMeta = {};
  private ky: HttpClient;
  private cache: CacheManager | null;

  constructor(ky: HttpClient, cache: CacheManager | null) {
    this.ky = ky;
    this.cache = cache;
  }

  get lastResponseMeta(): ApiResponseMeta {
    return this._lastResponseMeta;
  }

  async get<T>(path: string, options: GetOptions = {}): Promise<T> {
    const { searchParams, forceRefresh } = options;
    if (!this.cache) {
      const result = await this.fetchJson<T>(path, { searchParams });
      return (result as { value: T }).value;
    }
    const query = searchParams?.toString();
    const key = options.cacheKey ?? (query ? `${path}?${query}` : path);
    return this.cache.resolve<T>(
      key,
      (etag) =>
        this.fetchJson<T>(path, {
          searchParams,
          // Omit `headers` entirely when unused: ky treats `headers: undefined` as
          // "drop the instance headers", which would remove the API key.
          ...(etag ? { headers: { "If-None-Match": etag } } : {}),
        }),
      { forceRefresh },
    );
  }

  async post<T>(path: string, options: WriteOptions): Promise<T> {
    return this.write<T>("post", path, options);
  }

  async patch<T>(path: string, options: WriteOptions): Promise<T> {
    return this.write<T>("patch", path, options);
  }

  invalidate(pattern: string | RegExp): void {
    this.cache?.deleteMatching(pattern);
  }

  clearCache(): void {
    this.cache?.clear();
  }

  private async write<T>(
    method: "post" | "patch",
    path: string,
    { json, searchParams, idempotencyKey, retry }: WriteOptions,
  ): Promise<T> {
    const key =
      idempotencyKey === false
        ? undefined
        : (idempotencyKey ?? globalThis.crypto.randomUUID());
    const shouldRetry = retry ?? key !== undefined;
    const response = await this.send(method, path, {
      json,
      searchParams,
      ...(key ? { headers: { "Idempotency-Key": key } } : {}),
      // GET is the only method retried by default; writes opt in per request.
      ...(shouldRetry ? { retry: { methods: [method] } } : {}),
    });
    return (await response.json()) as T;
  }

  private async fetchJson<T>(
    path: string,
    options: KyOptions,
  ): Promise<FetchResult<T>> {
    try {
      const response = await this.send("get", path, options);
      return {
        notModified: false,
        value: (await response.json()) as T,
        etag: response.headers.get("etag") ?? undefined,
        freshness: parseCacheControl(response.headers.get("cache-control")),
      };
    } catch (error) {
      if (error instanceof NotModified) {
        return { notModified: true, freshness: error.freshness };
      }
      throw error;
    }
  }

  private async send(
    method: "get" | "post" | "patch",
    path: string,
    options: KyOptions,
  ): Promise<Response> {
    try {
      const response = await this.ky(path, { ...options, method });
      this._lastResponseMeta = parseResponseMeta(response.headers);
      return response;
    } catch (error) {
      if (!(error instanceof HTTPError)) throw error;
      const { response } = error;
      this._lastResponseMeta = parseResponseMeta(response.headers);
      if (response.status === 304) {
        throw new NotModified(
          parseCacheControl(response.headers.get("cache-control")),
        );
      }
      // ky 2 consumes the error body into `error.data` before rejecting.
      throw PawPlacerApiError.from(
        error.data,
        response.status,
        response.headers,
        error,
      );
    }
  }
}

class NotModified extends Error {
  constructor(readonly freshness?: Partial<Freshness>) {
    super("Not Modified");
  }
}
