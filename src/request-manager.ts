import type { KyInstance } from "ky";

import type {
  CacheManager,
  CachePolicy,
  CacheResolveResult,
  CacheSnapshot,
} from "./cache";
import { PawPlacerApiError } from "./errors";
import type { ApiError, ApiResponseMeta, RateLimitInfo } from "./types";

export interface RequestCacheOptions extends CachePolicy {
  key?: string;
  enabled?: boolean;
  refreshFrequencyMinutes?: number;
}

export type KyRequestOptions = NonNullable<Parameters<KyInstance["get"]>[1]>;

export interface RequestOptions extends KyRequestOptions {
  memoize?: RequestCacheOptions | false;
  as?: "json" | "text" | "blob" | "response";
}

type RequestMethod = "get" | "post" | "put" | "patch" | "delete";

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");

  if (!limit || !remaining || !reset) {
    return undefined;
  }

  const parsedLimit = Number.parseInt(limit, 10);
  const parsedRemaining = Number.parseInt(remaining, 10);
  const parsedReset = Number.parseInt(reset, 10);
  if (
    !Number.isFinite(parsedLimit) ||
    !Number.isFinite(parsedRemaining) ||
    !Number.isFinite(parsedReset)
  ) {
    return undefined;
  }

  const parsed: RateLimitInfo = {
    limit: parsedLimit,
    remaining: parsedRemaining,
    reset: parsedReset,
  };

  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const parsedRetryAfter = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(parsedRetryAfter) && parsedRetryAfter >= 0) {
      parsed.retryAfter = parsedRetryAfter;
    }
  }

  return parsed;
}

function parseResponseMeta(headers: Headers): ApiResponseMeta {
  const meta: ApiResponseMeta = {};

  const requestId = headers.get("x-request-id");
  if (requestId) meta.requestId = requestId;

  const apiVersion = headers.get("x-api-version");
  if (apiVersion) meta.apiVersion = apiVersion;

  const generatedAt = headers.get("x-generated-at");
  if (generatedAt) meta.generatedAt = generatedAt;

  const rateLimit = parseRateLimitHeaders(headers);
  if (rateLimit) meta.rateLimit = rateLimit;

  const idempotencyReplay = headers.get("idempotency-replay");
  if (idempotencyReplay?.toLowerCase() === "true") {
    meta.idempotencyReplay = true;
  }

  return meta;
}

function parseCacheControlSeconds(
  cacheControl: string | null,
  directive: "max-age" | "stale-while-revalidate",
): number | undefined {
  if (!cacheControl) {
    return undefined;
  }

  const segment = cacheControl
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${directive}=`));

  if (!segment) {
    return undefined;
  }

  const rawValue = segment.split("=")[1]?.trim();
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function parseResponseCachePolicy(headers: Headers): CachePolicy | undefined {
  const cacheControl = headers.get("cache-control");
  if (!cacheControl) {
    return undefined;
  }

  const normalizedCacheControl = cacheControl.toLowerCase();
  if (
    normalizedCacheControl.includes("no-store") ||
    normalizedCacheControl.includes("no-cache") ||
    normalizedCacheControl.includes("max-age=0")
  ) {
    return {
      refreshFrequencyMs: 0,
      staleWhileRevalidateMs: 0,
    };
  }

  const maxAgeSeconds = parseCacheControlSeconds(cacheControl, "max-age");
  const staleWhileRevalidateSeconds = parseCacheControlSeconds(
    cacheControl,
    "stale-while-revalidate",
  );

  if (
    maxAgeSeconds === undefined &&
    staleWhileRevalidateSeconds === undefined
  ) {
    return undefined;
  }

  return {
    refreshFrequencyMs:
      maxAgeSeconds !== undefined ? maxAgeSeconds * 1000 : undefined,
    staleWhileRevalidateMs:
      staleWhileRevalidateSeconds !== undefined
        ? (maxAgeSeconds ?? 0) * 1000 + staleWhileRevalidateSeconds * 1000
        : undefined,
  };
}

function isNotModifiedResponse(
  error: unknown,
): error is { response: Response } {
  if (error === null || typeof error !== "object") return false;
  const resp = (error as Record<string, unknown>).response;
  if (resp === null || typeof resp !== "object") return false;
  return (resp as Record<string, unknown>).status === 304;
}

function isMemoizationDisabled(memoize: RequestOptions["memoize"]): boolean {
  return (
    memoize === false ||
    (typeof memoize === "object" && memoize?.enabled === false)
  );
}

function getErrorResponse(error: unknown): Response | null {
  if (error === null || typeof error !== "object") {
    return null;
  }

  const response = (error as Record<string, unknown>).response;
  if (response === null || typeof response !== "object") {
    return null;
  }

  if (!("headers" in (response as Record<string, unknown>))) {
    return null;
  }

  return response as Response;
}

function getApiError(error: unknown): ApiError | null {
  if (error === null || typeof error !== "object") {
    return null;
  }

  const apiError = (error as Record<string, unknown>).apiError;
  if (apiError === null || typeof apiError !== "object") {
    return null;
  }

  return apiError as ApiError;
}

function mergeHeaders(
  options: KyRequestOptions,
  extra: Record<string, string>,
): KyRequestOptions {
  const existing = options.headers;
  if (!existing) {
    return { ...options, headers: { ...extra } };
  }

  const cloned = new Headers(existing as HeadersInit);
  for (const [key, value] of Object.entries(extra)) {
    cloned.set(key, value);
  }
  return { ...options, headers: cloned };
}

export class RequestManager {
  private ky: KyInstance;
  private cache: CacheManager | null;
  private inFlight = new Map<string, Promise<unknown>>();
  private _lastResponseMeta: ApiResponseMeta = {};
  private etags = new Map<string, string>();
  private etagBodies = new Map<string, unknown>();

  constructor(kyInstance: KyInstance, cache: CacheManager | null) {
    this.ky = kyInstance;
    this.cache = cache;
  }

  get lastResponseMeta(): ApiResponseMeta {
    return this._lastResponseMeta;
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.execute<T>("get", path, options);
  }

  async post<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.execute<T>("post", path, options);
  }

  async put<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.execute<T>("put", path, options);
  }

  async patch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.execute<T>("patch", path, options);
  }

  async delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.execute<T>("delete", path, options);
  }

  invalidate(key: string): void {
    this.cache?.delete(key);
    this.etags.delete(key);
    this.etagBodies.delete(key);
  }

  invalidateMatching(pattern: string | RegExp): void {
    this.cache?.clearPattern(pattern);
    const matcher =
      typeof pattern === "string"
        ? (key: string) => key.includes(pattern)
        : (key: string) => pattern.test(key);
    for (const key of this.etags.keys()) {
      if (matcher(key)) {
        this.etags.delete(key);
      }
    }
    for (const key of this.etagBodies.keys()) {
      if (matcher(key)) {
        this.etagBodies.delete(key);
      }
    }
  }

  clearEtags(): void {
    this.etags.clear();
    this.etagBodies.clear();
  }

  stats(): CacheSnapshot | null {
    if (!this.cache) {
      return null;
    }
    return this.cache.stats();
  }

  private async execute<T>(
    method: RequestMethod,
    path: string,
    options: RequestOptions,
  ): Promise<T> {
    const { memoize, as, ...rest } = options;
    const memoizationDisabled = isMemoizationDisabled(memoize);
    const cacheOptions = memoizationDisabled
      ? null
      : this.resolveCacheOptions(method, path, memoize, rest);
    const parser = as ?? "json";

    if (method === "get" && cacheOptions && this.cache) {
      return this.cache.resolve<T>(
        cacheOptions.key,
        () => this.dispatch<T>("get", path, rest, parser, cacheOptions.key),
        {
          refreshFrequencyMs: cacheOptions.refreshFrequencyMs,
          staleWhileRevalidateMs: cacheOptions.staleWhileRevalidateMs,
          forceRefresh: cacheOptions.forceRefresh,
        },
      );
    }

    const etagKey =
      method === "get" && !memoizationDisabled && (!this.cache || !cacheOptions)
        ? (cacheOptions?.key ?? this.buildCacheKey(method, path, rest))
        : undefined;

    const dedupeKey = this.buildDedupeKey(method, path, rest);
    if (dedupeKey) {
      const existing = this.inFlight.get(dedupeKey) as Promise<T> | undefined;
      if (existing) {
        return existing;
      }
      const request = this.dispatch<T>(
        method,
        path,
        rest,
        parser,
        etagKey,
      ).then((result) => this.extractDispatchValue(result));
      this.inFlight.set(dedupeKey, request);
      try {
        return await request;
      } finally {
        this.inFlight.delete(dedupeKey);
      }
    }

    const result = await this.dispatch<T>(method, path, rest, parser, etagKey);
    return this.extractDispatchValue(result);
  }

  private async dispatch<T>(
    method: RequestMethod,
    path: string,
    options: KyRequestOptions,
    parser: NonNullable<RequestOptions["as"]>,
    cacheKey?: string,
  ): Promise<T | CacheResolveResult<T>> {
    let effectiveOptions = options;
    if (method === "get" && cacheKey) {
      const etag = this.etags.get(cacheKey);
      if (etag) {
        effectiveOptions = mergeHeaders(options, { "If-None-Match": etag });
      }
    }

    const kyCall = (() => {
      switch (method) {
        case "get":
          return this.ky.get(path, effectiveOptions);
        case "post":
          return this.ky.post(path, effectiveOptions);
        case "put":
          return this.ky.put(path, effectiveOptions);
        case "patch":
          return this.ky.patch(path, effectiveOptions);
        case "delete":
          return this.ky.delete(path, effectiveOptions);
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    })();

    let response: Awaited<typeof kyCall>;
    try {
      response = await kyCall;
    } catch (error) {
      const errorResponse = getErrorResponse(error);
      if (errorResponse) {
        this._lastResponseMeta = parseResponseMeta(errorResponse.headers);
      }

      if (isNotModifiedResponse(error) && cacheKey) {
        const cached =
          this.cache?.peek<T>(cacheKey) ??
          (this.etagBodies.get(cacheKey) as T | undefined) ??
          null;
        if (cached !== null) {
          return cached;
        }
      }

      const apiError = getApiError(error);
      if (apiError) {
        throw new PawPlacerApiError(apiError);
      }

      throw error;
    }

    this._lastResponseMeta = parseResponseMeta(response.headers);

    if (method === "get" && cacheKey) {
      const etag = response.headers.get("etag");
      if (etag) {
        this.etags.set(cacheKey, etag);
      }
    }

    if (parser === "json") {
      const body = await response.json<T>();
      if (method === "get" && cacheKey && !this.cache) {
        this.etagBodies.set(cacheKey, body);
      }
      if (method === "get" && cacheKey && this.cache) {
        return {
          __cachePolicyResult: true,
          value: body,
          policy: parseResponseCachePolicy(response.headers),
        };
      }
      return body;
    }
    if (parser === "text") {
      return response.text() as unknown as Promise<T>;
    }
    if (parser === "blob") {
      return response.blob() as unknown as Promise<T>;
    }
    return response as unknown as Promise<T>;
  }

  private resolveCacheOptions(
    method: RequestMethod,
    path: string,
    memoize: RequestOptions["memoize"],
    options: KyRequestOptions,
  ) {
    if (method !== "get") {
      return null;
    }
    const policy = memoize && typeof memoize === "object" ? memoize : {};
    const key = policy.key ?? this.buildCacheKey(method, path, options);
    return {
      key,
      refreshFrequencyMs: this.resolveRefreshFrequencyMs(policy),
      staleWhileRevalidateMs: policy.staleWhileRevalidateMs,
      forceRefresh: policy.forceRefresh,
    };
  }

  private resolveRefreshFrequencyMs(
    policy: RequestCacheOptions,
  ): number | undefined {
    if (
      policy.refreshFrequencyMs !== undefined &&
      Number.isFinite(policy.refreshFrequencyMs)
    ) {
      return Math.max(policy.refreshFrequencyMs, 0);
    }
    if (
      policy.refreshFrequencyMinutes !== undefined &&
      Number.isFinite(policy.refreshFrequencyMinutes)
    ) {
      return Math.max(policy.refreshFrequencyMinutes, 0) * 60 * 1000;
    }
    return undefined;
  }

  private extractDispatchValue<T>(result: T | CacheResolveResult<T>): T {
    if (
      result !== null &&
      typeof result === "object" &&
      "__cachePolicyResult" in result
    ) {
      return (result as CacheResolveResult<T>).value;
    }

    return result as T;
  }

  private buildCacheKey(
    method: RequestMethod,
    path: string,
    options: KyRequestOptions,
  ): string {
    const query = this.serializeSearchParams(options.searchParams);
    return `${method.toUpperCase()}:${path}${query ? `?${query}` : ""}`;
  }

  private buildDedupeKey(
    method: RequestMethod,
    path: string,
    options: KyRequestOptions,
  ): string | null {
    if (method !== "get") {
      return null;
    }
    return this.buildCacheKey(method, path, options);
  }

  private serializeSearchParams(
    input: KyRequestOptions["searchParams"],
  ): string {
    if (!input) {
      return "";
    }
    if (typeof input === "string") {
      return input.startsWith("?") ? input.slice(1) : input;
    }
    if (input instanceof URLSearchParams) {
      return input.toString();
    }
    const params = new URLSearchParams();
    const append = (key: string, value: unknown) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          append(key, item);
        });
        return;
      }
      params.append(key, `${value}`);
    };

    if (Array.isArray(input)) {
      for (const [key, value] of input as Array<[string, unknown]>) {
        append(key, value);
      }
      return params.toString();
    }

    const entries = Object.entries(input as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );

    for (const [key, value] of entries) {
      append(key, value);
    }

    return params.toString();
  }
}
