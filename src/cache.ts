const DEFAULT_REFRESH_FREQUENCY_MS = 180 * 60 * 1000; // 3 hours
const STALE_BUFFER_MULTIPLIER = 3;
const DEFAULT_MAX_SIZE = 1000;

function normalizeNonNegativeNumber(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(value, 0)
    : fallback;
}

function normalizeMaxSize(value: number | undefined): number {
  return Math.floor(normalizeNonNegativeNumber(value, DEFAULT_MAX_SIZE));
}

export interface CacheSettings {
  refreshFrequencyMs: number;
  staleWhileRevalidateMs: number;
  maxSize: number;
}

export interface CachePolicy {
  refreshFrequencyMs?: number;
  staleWhileRevalidateMs?: number;
  forceRefresh?: boolean;
}

export interface CacheResolveResult<T> {
  __cachePolicyResult: true;
  value: T;
  policy?: CachePolicy;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  refreshes: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleAt: number;
  pending?: Promise<T>;
}

interface FallbackValue<T> {
  hasValue: boolean;
  value: T;
}

export interface CacheSnapshot extends CacheMetrics {
  size: number;
  maxSize: number;
}

export class CacheManager {
  private store = new Map<string, CacheEntry<unknown>>();
  private settings: CacheSettings;
  private metrics: CacheMetrics = { hits: 0, misses: 0, refreshes: 0 };

  constructor(settings?: Partial<CacheSettings>) {
    const refreshFrequencyMs = normalizeNonNegativeNumber(
      settings?.refreshFrequencyMs,
      DEFAULT_REFRESH_FREQUENCY_MS,
    );
    const staleWhileRevalidateMs = normalizeNonNegativeNumber(
      settings?.staleWhileRevalidateMs,
      refreshFrequencyMs * STALE_BUFFER_MULTIPLIER,
    );
    this.settings = {
      refreshFrequencyMs,
      staleWhileRevalidateMs,
      maxSize: normalizeMaxSize(settings?.maxSize),
    };
  }

  async resolve<T>(
    key: string,
    fetcher: () => Promise<T | CacheResolveResult<T>>,
    policy?: CachePolicy,
  ): Promise<T> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();
    const refreshFrequencyMs = this.resolveRefreshFrequency(policy);
    const staleWhileRevalidateMs = this.resolveStaleWhileRevalidate(
      policy,
      refreshFrequencyMs,
    );

    if (entry && !policy?.forceRefresh) {
      if (entry.pending) {
        this.metrics.hits += 1;
        return entry.pending;
      }
      if (now < entry.expiresAt) {
        this.metrics.hits += 1;
        return entry.value;
      }
      if (now < entry.staleAt) {
        this.metrics.hits += 1;
        entry.pending = this.runFetch(
          key,
          fetcher,
          refreshFrequencyMs,
          staleWhileRevalidateMs,
          {
            hasValue: true,
            value: entry.value,
          },
        );
        return entry.value;
      }
    }

    this.metrics.misses += 1;
    const fallback = entry
      ? {
          hasValue: true,
          value: entry.value,
        }
      : undefined;
    return this.runFetch(
      key,
      fetcher,
      refreshFrequencyMs,
      staleWhileRevalidateMs,
      fallback,
    );
  }

  set<T>(key: string, value: T, policy?: CachePolicy): void {
    const refreshFrequencyMs = this.resolveRefreshFrequency(policy);
    const staleWhileRevalidateMs = this.resolveStaleWhileRevalidate(
      policy,
      refreshFrequencyMs,
    );
    if (refreshFrequencyMs <= 0 && staleWhileRevalidateMs <= 0) {
      this.store.delete(key);
      return;
    }
    if (this.settings.maxSize <= 0) {
      this.store.delete(key);
      return;
    }
    this.store.delete(key);
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + refreshFrequencyMs,
      staleAt: now + staleWhileRevalidateMs,
    });
    this.evictIfNeeded();
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }
    const now = Date.now();
    if (entry.pending) {
      return null;
    }
    if (now > entry.staleAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  peek<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    return entry ? entry.value : null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  clearPattern(pattern: string | RegExp): void {
    for (const key of this.store.keys()) {
      if (
        pattern instanceof RegExp ? pattern.test(key) : key.includes(pattern)
      ) {
        this.store.delete(key);
      }
    }
  }

  size(): number {
    return this.store.size;
  }

  stats(): CacheSnapshot {
    return {
      ...this.metrics,
      size: this.store.size,
      maxSize: this.settings.maxSize,
    };
  }

  private runFetch<T>(
    key: string,
    fetcher: () => Promise<T | CacheResolveResult<T>>,
    refreshFrequencyMs: number,
    staleWhileRevalidateMs: number,
    fallback?: FallbackValue<T>,
  ): Promise<T> {
    if (fallback?.hasValue) {
      this.metrics.refreshes += 1;
    }
    const pending = fetcher()
      .then((result) => {
        const normalized = this.normalizeFetcherResult(result);
        this.set(key, normalized.value, {
          refreshFrequencyMs:
            normalized.policy?.refreshFrequencyMs ?? refreshFrequencyMs,
          staleWhileRevalidateMs:
            normalized.policy?.staleWhileRevalidateMs ?? staleWhileRevalidateMs,
        });
        return normalized.value;
      })
      .catch((error) => {
        if (fallback?.hasValue) {
          this.set(key, fallback.value, {
            refreshFrequencyMs: 0,
            staleWhileRevalidateMs,
          });
          return fallback.value;
        }
        this.store.delete(key);
        throw error;
      })
      .finally(() => {
        const entry = this.store.get(key);
        if (entry) {
          entry.pending = undefined;
        }
      });
    if (!this.store.has(key)) {
      const now = Date.now();
      this.store.set(key, {
        value: fallback?.value as T,
        expiresAt: now,
        staleAt: now + staleWhileRevalidateMs,
        pending,
      });
    } else {
      const entry = this.store.get(key) as CacheEntry<T>;
      entry.pending = pending;
    }
    return pending;
  }

  private resolveRefreshFrequency(policy?: CachePolicy): number {
    const value = policy?.refreshFrequencyMs;
    if (value === undefined) {
      return this.settings.refreshFrequencyMs;
    }
    return normalizeNonNegativeNumber(value, this.settings.refreshFrequencyMs);
  }

  private resolveStaleWhileRevalidate(
    policy: CachePolicy | undefined,
    refreshFrequencyMs: number,
  ): number {
    const value = policy?.staleWhileRevalidateMs;
    if (value !== undefined) {
      return normalizeNonNegativeNumber(value, refreshFrequencyMs);
    }
    if (policy?.refreshFrequencyMs !== undefined) {
      return refreshFrequencyMs * STALE_BUFFER_MULTIPLIER;
    }
    return this.settings.staleWhileRevalidateMs;
  }

  private normalizeFetcherResult<T>(
    result: T | CacheResolveResult<T>,
  ): CacheResolveResult<T> {
    if (
      result !== null &&
      typeof result === "object" &&
      "__cachePolicyResult" in result
    ) {
      return result as CacheResolveResult<T>;
    }

    return {
      __cachePolicyResult: true,
      value: result as T,
    };
  }

  private evictIfNeeded(): void {
    if (this.store.size <= this.settings.maxSize) {
      return;
    }
    const keys = this.store.keys();
    while (this.store.size > this.settings.maxSize) {
      const key = keys.next().value as string | undefined;
      if (!key) {
        break;
      }
      const entry = this.store.get(key);
      if (entry?.pending) {
        this.store.set(key, entry);
        continue;
      }
      this.store.delete(key);
    }
  }
}
