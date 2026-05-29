import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CacheManager } from "../src/cache";

describe("CacheManager", () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager({
      refreshFrequencyMs: 1000,
      maxSize: 5,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("set / get", () => {
    it("stores and retrieves a value", () => {
      cache.set("key-1", { name: "Buddy" });
      expect(cache.get("key-1")).toEqual({ name: "Buddy" });
    });

    it("returns null for missing key", () => {
      expect(cache.get("missing")).toBeNull();
    });

    it("returns null for expired + stale entry", () => {
      vi.useFakeTimers();
      cache.set("key-1", "value");
      // Default stale = refreshFrequencyMs * 3 = 3000ms
      vi.advanceTimersByTime(4000);
      expect(cache.get("key-1")).toBeNull();
      vi.useRealTimers();
    });

    it("returns value within fresh window", () => {
      vi.useFakeTimers();
      cache.set("key-1", "value");
      vi.advanceTimersByTime(500); // Within 1000ms fresh window
      expect(cache.get("key-1")).toBe("value");
      vi.useRealTimers();
    });
  });

  describe("resolve", () => {
    it("calls fetcher on cache miss", async () => {
      const fetcher = vi.fn().mockResolvedValue({ id: 1 });
      const result = await cache.resolve("key", fetcher);

      expect(fetcher).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1 });
    });

    it("returns cached value on cache hit", async () => {
      const fetcher = vi.fn().mockResolvedValue({ id: 1 });

      await cache.resolve("key", fetcher);
      const result = await cache.resolve("key", fetcher);

      expect(fetcher).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1 });
    });

    it("refetches when forceRefresh is true", async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2 });

      await cache.resolve("key", fetcher);
      const result = await cache.resolve("key", fetcher, {
        forceRefresh: true,
      });

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 2 });
    });

    it("returns stale value and revalidates in background", async () => {
      vi.useFakeTimers();
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce("fresh")
        .mockResolvedValueOnce("refreshed");

      await cache.resolve("key", fetcher);
      // Move past fresh window but within stale window
      vi.advanceTimersByTime(1500);
      const result = await cache.resolve("key", fetcher);

      expect(result).toBe("fresh"); // Returns stale value immediately
      expect(fetcher).toHaveBeenCalledTimes(2); // But triggers background refresh
      vi.useRealTimers();
    });

    it("falls back to stale value when background refresh fails", async () => {
      vi.useFakeTimers();
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce("original")
        .mockRejectedValueOnce(new Error("network error"));

      await cache.resolve("key", fetcher);
      vi.advanceTimersByTime(1500);

      // Returns stale value while background refresh fails gracefully
      const result = await cache.resolve("key", fetcher);
      expect(result).toBe("original");
      expect(fetcher).toHaveBeenCalledTimes(2);

      // Let the background promise settle
      await vi.advanceTimersByTimeAsync(0);
      vi.useRealTimers();
    });
  });

  describe("peek", () => {
    it("returns value regardless of expiry", () => {
      vi.useFakeTimers();
      cache.set("key-1", "value");
      // Move past stale window
      vi.advanceTimersByTime(10000);
      // peek returns the value even though it's expired
      expect(cache.peek("key-1")).toBe("value");
      // Regular get returns null (and deletes the entry)
      expect(cache.get("key-1")).toBeNull();
      vi.useRealTimers();
    });

    it("returns null for missing key", () => {
      expect(cache.peek("missing")).toBeNull();
    });

    it("returns value within fresh window", () => {
      cache.set("key-1", { name: "Buddy" });
      expect(cache.peek("key-1")).toEqual({ name: "Buddy" });
    });
  });

  describe("delete / clear", () => {
    it("deletes a specific key", () => {
      cache.set("a", 1);
      cache.set("b", 2);
      cache.delete("a");

      expect(cache.get("a")).toBeNull();
      expect(cache.get("b")).toBe(2);
    });

    it("clears all entries", () => {
      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();

      expect(cache.size()).toBe(0);
    });
  });

  describe("clearPattern", () => {
    it("clears entries matching a string pattern", () => {
      cache.set("pets:list:a", 1);
      cache.set("pets:list:b", 2);
      cache.set("pets:get:1", 3);

      cache.clearPattern("pets:list:");

      expect(cache.get("pets:list:a")).toBeNull();
      expect(cache.get("pets:list:b")).toBeNull();
      expect(cache.get("pets:get:1")).toBe(3);
    });

    it("treats string patterns as literal substrings instead of regexes", () => {
      cache.set("pets:list:a", 1);
      cache.set("petsXlistXb", 2);

      cache.clearPattern("pets:list:");

      expect(cache.get("pets:list:a")).toBeNull();
      expect(cache.get("petsXlistXb")).toBe(2);
    });

    it("clears entries matching a RegExp", () => {
      cache.set("pets:list:a", 1);
      cache.set("pets:get:1", 2);
      cache.set("users:list:a", 3);

      cache.clearPattern(/^pets:/);

      expect(cache.get("pets:list:a")).toBeNull();
      expect(cache.get("pets:get:1")).toBeNull();
      expect(cache.get("users:list:a")).toBe(3);
    });
  });

  describe("eviction", () => {
    it("evicts oldest entries when maxSize exceeded", () => {
      for (let i = 0; i < 7; i++) {
        cache.set(`key-${i}`, i);
      }
      // maxSize is 5, so oldest should be evicted
      expect(cache.size()).toBe(5);
    });

    it("treats negative maxSize as zero capacity", () => {
      const zeroCapacityCache = new CacheManager({ maxSize: -1 });

      zeroCapacityCache.set("key", "value");

      expect(zeroCapacityCache.stats().maxSize).toBe(0);
      expect(zeroCapacityCache.peek("key")).toBeNull();
    });
  });

  describe("stats", () => {
    it("tracks hits and misses", async () => {
      const fetcher = vi.fn().mockResolvedValue("val");

      await cache.resolve("key", fetcher); // miss
      await cache.resolve("key", fetcher); // hit

      const stats = cache.stats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(5);
    });

    it("does not keep entries when the cache policy disables storage", () => {
      cache.set("key", "value", {
        refreshFrequencyMs: 0,
        staleWhileRevalidateMs: 0,
      });

      expect(cache.get("key")).toBeNull();
      expect(cache.peek("key")).toBeNull();
    });

    it("falls back to default TTLs for invalid constructor settings", () => {
      const invalidSettingsCache = new CacheManager({
        refreshFrequencyMs: Number.NaN,
        staleWhileRevalidateMs: Number.NaN,
      });

      invalidSettingsCache.set("key", "value");

      expect(invalidSettingsCache.peek("key")).toBe("value");
    });
  });
});
