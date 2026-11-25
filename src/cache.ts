/** How long a response stays fresh, then how much longer it may be served stale. */
export interface Freshness {
  /** Serve from cache without a request for this long. */
  maxAgeMs: number;
  /** After `maxAgeMs`, serve the cached value for this much longer while revalidating in the background. */
  staleWhileRevalidateMs: number;
}

/** Result of a fetch performed on behalf of the cache. */
export type FetchResult<T> =
  | { notModified: false; value: T; etag?: string; freshness?: Partial<Freshness> }
  | { notModified: true; freshness?: Partial<Freshness> };

export interface CacheSnapshot {
  hits: number;
  misses: number;
  /** Background revalidations started for stale entries. */
  refreshes: number;
  size: number;
  maxSize: number;
}

interface CacheEntry<T> {
  hasValue: boolean;
  value: T | undefined;
  etag?: string;
  freshUntil: number;
  staleUntil: number;
  pending?: Promise<T>;
}

export interface CacheOptions {
  maxSize?: number;
  /** Used when the API response has no Cache-Control header. */
  defaultFreshness?: Freshness;
  /** When set, replaces the API's `max-age` for every entry. */
  maxAgeOverrideMs?: number;
}

// Mirrors the API's current `Cache-Control: max-age=60, stale-while-revalidate=300`.
const DEFAULT_FRESHNESS: Freshness = {
  maxAgeMs: 60_000,
  staleWhileRevalidateMs: 300_000,
};
const DEFAULT_MAX_SIZE = 1000;

function nonNegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(value, 0)
    : undefined;
}

/**
 * In-memory, per-process response cache with stale-while-revalidate,
 * ETag revalidation, stale-if-error, and request de-duplication.
 */
export class CacheManager {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;
  private readonly defaultFreshness: Freshness;
  private readonly maxAgeOverrideMs?: number;
  private metrics = { hits: 0, misses: 0, refreshes: 0 };

  constructor(options: CacheOptions = {}) {
    this.maxSize = Math.floor(nonNegative(options.maxSize) ?? DEFAULT_MAX_SIZE);
    this.defaultFreshness = options.defaultFreshness ?? DEFAULT_FRESHNESS;
    this.maxAgeOverrideMs = nonNegative(options.maxAgeOverrideMs);
  }

  async resolve<T>(
    key: string,
    fetcher: (etag: string | undefined) => Promise<FetchResult<T>>,
    options: { forceRefresh?: boolean } = {},
  ): Promise<T> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (entry && !options.forceRefresh) {
      if (entry.hasValue && now < entry.freshUntil) {
        this.metrics.hits += 1;
        this.touch(key, entry);
        return entry.value as T;
      }
      if (entry.hasValue && now < entry.staleUntil) {
        this.metrics.hits += 1;
        if (!entry.pending) {
          this.metrics.refreshes += 1;
          // Background refresh: failures keep serving the stale value.
          this.refresh(key, entry, fetcher).catch(() => {});
        }
        return entry.value as T;
      }
      if (entry.pending) {
        this.metrics.hits += 1;
        return entry.pending;
      }
    }

    this.metrics.misses += 1;
    const target = entry ?? this.createPlaceholder<T>(key);
    if (target.pending && options.forceRefresh !== true) {
      return target.pending;
    }
    return this.refresh(key, target, fetcher, {
      serveStaleOnError: !options.forceRefresh,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Removes keys containing `pattern` (string) or matching it (RegExp). */
  deleteMatching(pattern: string | RegExp): void {
    for (const key of this.store.keys()) {
      if (typeof pattern === "string" ? key.includes(pattern) : pattern.test(key)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  stats(): CacheSnapshot {
    return { ...this.metrics, size: this.store.size, maxSize: this.maxSize };
  }

  private createPlaceholder<T>(key: string): CacheEntry<T> {
    const entry: CacheEntry<T> = {
      hasValue: false,
      value: undefined,
      freshUntil: 0,
      staleUntil: 0,
    };
    this.store.set(key, entry);
    return entry;
  }

  private refresh<T>(
    key: string,
    entry: CacheEntry<T>,
    fetcher: (etag: string | undefined) => Promise<FetchResult<T>>,
    { serveStaleOnError = true }: { serveStaleOnError?: boolean } = {},
  ): Promise<T> {
    const pending = fetcher(entry.hasValue ? entry.etag : undefined)
      .then((result) => {
        // Skip writes for entries invalidated while the request was in flight.
        const current = this.store.get(key) === entry;
        if (result.notModified) {
          if (!entry.hasValue) {
            throw new Error(`Received 304 Not Modified without a cached value for ${key}`);
          }
        } else {
          entry.value = result.value;
          entry.hasValue = true;
          entry.etag = result.etag;
        }
        const { maxAgeMs, staleWhileRevalidateMs } = this.freshness(result.freshness);
        const now = Date.now();
        entry.freshUntil = now + maxAgeMs;
        entry.staleUntil = now + maxAgeMs + staleWhileRevalidateMs;
        if (current) {
          if (maxAgeMs + staleWhileRevalidateMs <= 0 || this.maxSize === 0) {
            this.store.delete(key);
          } else {
            this.touch(key, entry);
            this.evictIfNeeded();
          }
        }
        return entry.value as T;
      })
      .catch((error: unknown) => {
        if (serveStaleOnError && entry.hasValue) {
          return entry.value as T;
        }
        if (!entry.hasValue && this.store.get(key) === entry) {
          this.store.delete(key);
        }
        throw error;
      })
      .finally(() => {
        if (entry.pending === pending) entry.pending = undefined;
      });
    entry.pending = pending;
    return pending;
  }

  private freshness(fromResponse?: Partial<Freshness>): Freshness {
    return {
      maxAgeMs:
        this.maxAgeOverrideMs ??
        nonNegative(fromResponse?.maxAgeMs) ??
        this.defaultFreshness.maxAgeMs,
      staleWhileRevalidateMs:
        nonNegative(fromResponse?.staleWhileRevalidateMs) ??
        this.defaultFreshness.staleWhileRevalidateMs,
    };
  }

  /** Moves a key to the end of the Map so eviction drops least-recently-used entries first. */
  private touch(key: string, entry: CacheEntry<unknown>): void {
    this.store.delete(key);
    this.store.set(key, entry);
  }

  private evictIfNeeded(): void {
    for (const [key, entry] of this.store) {
      if (this.store.size <= this.maxSize) return;
      if (!entry.pending) this.store.delete(key);
    }
  }
}
