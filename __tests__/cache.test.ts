import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CacheManager, type FetchResult } from "../src/cache";
import { parseCacheControl } from "../src/request-manager";

const fresh = <T>(value: T, extra: Partial<FetchResult<T>> = {}) =>
  ({ notModified: false, value, ...extra }) as FetchResult<T>;

const FRESHNESS = { maxAgeMs: 1000, staleWhileRevalidateMs: 5000 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CacheManager", () => {
  it("serves fresh entries without fetching", async () => {
    const cache = new CacheManager({ defaultFreshness: FRESHNESS });
    const fetcher = vi.fn().mockResolvedValue(fresh("a"));

    await cache.resolve("k", fetcher);
    const value = await cache.resolve("k", fetcher);

    expect(value).toBe("a");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
  });

  it("serves stale entries while revalidating in the background", async () => {
    const cache = new CacheManager({ defaultFreshness: FRESHNESS });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fresh("a"))
      .mockResolvedValueOnce(fresh("b"));

    await cache.resolve("k", fetcher);
    vi.advanceTimersByTime(2000);
    const stale = await cache.resolve("k", fetcher);
    await vi.runAllTimersAsync();
    const updated = await cache.resolve("k", fetcher);

    expect(stale).toBe("a");
    expect(updated).toBe("b");
    expect(cache.stats().refreshes).toBe(1);
  });

  it("fetches in the foreground once the stale window has passed", async () => {
    const cache = new CacheManager({ defaultFreshness: FRESHNESS });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fresh("a"))
      .mockResolvedValueOnce(fresh("b"));

    await cache.resolve("k", fetcher);
    vi.advanceTimersByTime(7000);

    expect(await cache.resolve("k", fetcher)).toBe("b");
  });

  it("keeps serving the old value when a refresh fails", async () => {
    const cache = new CacheManager({ defaultFreshness: FRESHNESS });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fresh("a"))
      .mockRejectedValue(new Error("down"));

    await cache.resolve("k", fetcher);
    vi.advanceTimersByTime(7000);

    expect(await cache.resolve("k", fetcher)).toBe("a");
  });

  it("throws fetch errors when there is no value, and on forceRefresh", async () => {
    const cache = new CacheManager({ defaultFreshness: FRESHNESS });

    await expect(
      cache.resolve("k", () => Promise.reject(new Error("down"))),
    ).rejects.toThrow("down");
    expect(cache.stats().size).toBe(0);

    await cache.resolve("k", () => Promise.resolve(fresh("a")));
    await expect(
      cache.resolve("k", () => Promise.reject(new Error("down")), {
        forceRefresh: true,
      }),
    ).rejects.toThrow("down");
  });

  it("shares one in-flight fetch between concurrent callers", async () => {
    const cache = new CacheManager();
    const fetcher = vi.fn().mockResolvedValue(fresh("a"));

    const results = await Promise.all([
      cache.resolve("k", fetcher),
      cache.resolve("k", fetcher),
    ]);

    expect(results).toEqual(["a", "a"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("revalidates with the stored ETag and keeps the value on 304", async () => {
    const cache = new CacheManager({ defaultFreshness: FRESHNESS });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fresh("a", { etag: '"v1"' }))
      .mockResolvedValueOnce({ notModified: true });

    await cache.resolve("k", fetcher);
    vi.advanceTimersByTime(7000);
    const value = await cache.resolve("k", fetcher);

    expect(fetcher).toHaveBeenLastCalledWith('"v1"');
    expect(value).toBe("a");
  });

  it("uses response freshness, unless maxAgeOverrideMs is set", async () => {
    const fromResponse = fresh("a", {
      freshness: { maxAgeMs: 0, staleWhileRevalidateMs: 0 },
    });

    const following = new CacheManager();
    await following.resolve("k", () => Promise.resolve(fromResponse));
    expect(following.stats().size).toBe(0);

    const overridden = new CacheManager({ maxAgeOverrideMs: 60_000 });
    const fetcher = vi.fn().mockResolvedValue(fromResponse);
    await overridden.resolve("k", fetcher);
    await overridden.resolve("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not store results for keys invalidated mid-request", async () => {
    const cache = new CacheManager();
    let release: (value: FetchResult<string>) => void = () => {};
    const pending = cache.resolve(
      "k",
      () => new Promise<FetchResult<string>>((resolve) => (release = resolve)),
    );

    cache.delete("k");
    release(fresh("old"));
    await pending;

    expect(cache.stats().size).toBe(0);
  });

  it("evicts the least recently used entry past maxSize", async () => {
    const cache = new CacheManager({ maxSize: 2 });
    const load = (key: string) =>
      cache.resolve(key, () => Promise.resolve(fresh(key)));
    const fetcher = vi.fn().mockResolvedValue(fresh("reloaded"));

    await load("a");
    await load("b");
    await load("a"); // touch a
    await load("c"); // evicts b

    expect(cache.stats().size).toBe(2);
    expect(await cache.resolve("a", fetcher)).toBe("a");
    expect(await cache.resolve("b", fetcher)).toBe("reloaded");
  });

  it("deleteMatching supports substrings and regexes", async () => {
    const cache = new CacheManager();
    for (const key of ["pets:list:a", "pets:get:1", "people:list:b"]) {
      await cache.resolve(key, () => Promise.resolve(fresh(key)));
    }

    cache.deleteMatching("pets:list:");
    expect(cache.stats().size).toBe(2);
    cache.deleteMatching(/^people:/);
    expect(cache.stats().size).toBe(1);
    cache.clear();
    expect(cache.stats().size).toBe(0);
  });
});

describe("parseCacheControl", () => {
  it.each([
    [null, undefined],
    ["public", undefined],
    [
      "private, max-age=60, stale-while-revalidate=300",
      { maxAgeMs: 60_000, staleWhileRevalidateMs: 300_000 },
    ],
    ["max-age=0", { maxAgeMs: 0 }],
    ["no-store", { maxAgeMs: 0, staleWhileRevalidateMs: 0 }],
    ["No-Cache", { maxAgeMs: 0, staleWhileRevalidateMs: 0 }],
    ["max-age=abc", undefined],
  ])("%s", (header, expected) => {
    expect(parseCacheControl(header)).toEqual(expected);
  });
});
