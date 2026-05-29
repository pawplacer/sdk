import { beforeEach, describe, expect, it, vi } from "vitest";

import { CacheManager } from "../src/cache";
import { PawPlacerApiError } from "../src/errors";
import { RequestManager } from "../src/request-manager";

function createMockKy() {
  const mock = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const createChain = (resolveWith: unknown) => {
    const mockHeaders = new Headers();
    const responseObj = {
      headers: mockHeaders,
      json: vi.fn().mockResolvedValue(resolveWith),
      text: vi.fn().mockResolvedValue(String(resolveWith)),
      blob: vi.fn().mockResolvedValue(resolveWith),
    };
    // Ky returns a Response-like thenable: awaitable and has .json()/.text()/.blob()
    return Object.assign(Promise.resolve(responseObj), responseObj);
  };

  return { mock, createChain };
}

describe("RequestManager", () => {
  let kyMock: ReturnType<typeof createMockKy>["mock"];
  let createChain: ReturnType<typeof createMockKy>["createChain"];

  beforeEach(() => {
    const ky = createMockKy();
    kyMock = ky.mock;
    createChain = ky.createChain;
  });

  describe("get", () => {
    it("calls ky.get and parses JSON by default", async () => {
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, null);
      const result = await rm.get("api/pets");

      expect(kyMock.get).toHaveBeenCalledWith("api/pets", {});
      expect(chain.json).toHaveBeenCalled();
      expect(result).toEqual({ id: 1 });
    });

    it("uses cache when cache is enabled", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      // First call — cache miss
      await rm.get("api/pets", { memoize: { key: "test" } });
      expect(kyMock.get).toHaveBeenCalledTimes(1);

      // Second call — cache hit
      await rm.get("api/pets", { memoize: { key: "test" } });
      expect(kyMock.get).toHaveBeenCalledTimes(1);
    });

    it("skips cache when memoize is false", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      await rm.get("api/pets", { memoize: false });
      await rm.get("api/pets", { memoize: false });

      expect(kyMock.get).toHaveBeenCalledTimes(2);
    });

    it("skips cache when memoize.enabled is false", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      await rm.get("api/pets", { memoize: { enabled: false } });
      await rm.get("api/pets", { memoize: { enabled: false } });

      expect(kyMock.get).toHaveBeenCalledTimes(2);
    });

    it("uses stable cache keys for object search params", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      await rm.get("api/pets", { searchParams: { b: 2, a: 1 } });
      await rm.get("api/pets", { searchParams: { a: 1, b: 2 } });

      expect(kyMock.get).toHaveBeenCalledTimes(1);
    });

    it("normalizes leading question marks in string search params", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      await rm.get("api/pets", { searchParams: "?status=available" });
      await rm.get("api/pets", { searchParams: "status=available" });

      expect(kyMock.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("post", () => {
    it("calls ky.post and parses JSON", async () => {
      const chain = createChain({ id: "new" });
      kyMock.post.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, null);
      const result = await rm.post("api/pets", {
        json: { name: "Buddy" },
      } as never);

      expect(kyMock.post).toHaveBeenCalled();
      expect(result).toEqual({ id: "new" });
    });

    it("does not cache POST requests", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: "new" });
      kyMock.post.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      await rm.post("api/pets", { json: { name: "Buddy" } } as never);
      await rm.post("api/pets", { json: { name: "Max" } } as never);

      expect(kyMock.post).toHaveBeenCalledTimes(2);
    });
  });

  describe("invalidation", () => {
    it("invalidate deletes specific cache key", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      await rm.get("api/pets", { memoize: { key: "test" } });
      rm.invalidate("test");

      await rm.get("api/pets", { memoize: { key: "test" } });
      expect(kyMock.get).toHaveBeenCalledTimes(2);
    });

    it("invalidateMatching clears by pattern", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const chain = createChain({ id: 1 });
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, cache);

      await rm.get("api/pets", { memoize: { key: "pets:list:a" } });
      await rm.get("api/pets/1", { memoize: { key: "pets:get:1" } });
      rm.invalidateMatching("pets:list:");

      await rm.get("api/pets", { memoize: { key: "pets:list:a" } });
      // pets:list:a was invalidated, so re-fetched (3 total)
      expect(kyMock.get).toHaveBeenCalledTimes(3);
    });

    it("invalidate is no-op without cache", () => {
      const rm = new RequestManager(kyMock as never, null);
      expect(() => rm.invalidate("test")).not.toThrow();
    });
  });

  describe("stats", () => {
    it("returns null without cache", () => {
      const rm = new RequestManager(kyMock as never, null);
      expect(rm.stats()).toBeNull();
    });

    it("returns cache stats when cache exists", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });
      const rm = new RequestManager(kyMock as never, cache);
      const stats = rm.stats();

      expect(stats).toMatchObject({ hits: 0, misses: 0, size: 0 });
    });
  });

  describe("etag / conditional requests", () => {
    it("stores etag from successful GET and sends If-None-Match on next request", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });

      // First request returns ETag
      const headers1 = new Headers({ etag: '"abc123"' });
      const response1 = {
        headers: headers1,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(response1), response1),
      );

      const rm = new RequestManager(kyMock as never, cache);
      await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });

      // Second request should include If-None-Match
      const headers2 = new Headers({ etag: '"abc123"' });
      const response2 = {
        headers: headers2,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(response2), response2),
      );

      await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });

      const secondCallOptions = kyMock.get.mock.calls[1]![1] as Record<
        string,
        unknown
      >;
      const sentHeaders = secondCallOptions.headers as Record<string, string>;
      expect(sentHeaders["If-None-Match"]).toBe('"abc123"');
    });

    it("preserves existing request headers when adding If-None-Match", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });

      const response1 = {
        headers: new Headers({ etag: '"abc123"' }),
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      const response2 = {
        headers: new Headers({ etag: '"abc123"' }),
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      kyMock.get
        .mockReturnValueOnce(
          Object.assign(Promise.resolve(response1), response1),
        )
        .mockReturnValueOnce(
          Object.assign(Promise.resolve(response2), response2),
        );

      const rm = new RequestManager(kyMock as never, cache);
      await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });
      await rm.get("api/pets", {
        headers: new Headers({ "x-custom": "present" }),
        memoize: { key: "test-key", forceRefresh: true },
      });

      const secondCallOptions = kyMock.get.mock.calls[1]![1] as Record<
        string,
        unknown
      >;
      const sentHeaders = secondCallOptions.headers as Headers;
      expect(sentHeaders.get("x-custom")).toBe("present");
      expect(sentHeaders.get("if-none-match")).toBe('"abc123"');
    });

    it("returns cached data on 304 Not Modified", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });

      // First request succeeds with ETag
      const headers1 = new Headers({ etag: '"abc123"' });
      const response1 = {
        headers: headers1,
        json: vi.fn().mockResolvedValue({ id: 1, name: "Buddy" }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(response1), response1),
      );

      const rm = new RequestManager(kyMock as never, cache);
      const first = await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });
      expect(first).toEqual({ id: 1, name: "Buddy" });

      // Second request gets 304
      const error304 = new Error("Not Modified") as Error & {
        response: { status: number; headers: Headers };
      };
      error304.response = {
        status: 304,
        headers: new Headers({ "x-request-id": "req-2" }),
      };
      const rejectedPromise = Promise.reject(error304);
      rejectedPromise.catch(() => {}); // prevent unhandled rejection from the base promise
      kyMock.get.mockReturnValueOnce(
        Object.assign(rejectedPromise, {
          json: vi.fn(),
          text: vi.fn(),
          blob: vi.fn(),
        }),
      );

      const second = await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });
      expect(second).toEqual({ id: 1, name: "Buddy" });
      expect(rm.lastResponseMeta.requestId).toBe("req-2");
    });

    it("replays cached ETag bodies on 304 when cache is disabled", async () => {
      const headers1 = new Headers({ etag: '"abc123"' });
      const response1 = {
        headers: headers1,
        json: vi.fn().mockResolvedValue({ id: 1, name: "Buddy" }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(response1), response1),
      );

      const rm = new RequestManager(kyMock as never, null);
      const first = await rm.get("api/pets");
      expect(first).toEqual({ id: 1, name: "Buddy" });

      const error304 = new Error("Not Modified") as Error & {
        response: { status: number; headers: Headers };
      };
      error304.response = {
        status: 304,
        headers: new Headers({ "x-request-id": "req-disabled-cache" }),
      };
      const rejectedPromise = Promise.reject(error304);
      rejectedPromise.catch(() => {});
      kyMock.get.mockReturnValueOnce(
        Object.assign(rejectedPromise, {
          json: vi.fn(),
          text: vi.fn(),
          blob: vi.fn(),
        }),
      );

      const second = await rm.get("api/pets");
      expect(second).toEqual({ id: 1, name: "Buddy" });
      expect(rm.lastResponseMeta.requestId).toBe("req-disabled-cache");
    });

    it.each([
      ["memoize is false", false],
      ["memoize.enabled is false", { enabled: false }],
    ] as const)(
      "does not send If-None-Match when %s with a cache",
      async (_label, memoize) => {
        const cache = new CacheManager({ refreshFrequencyMs: 60000 });
        const response1 = {
          headers: new Headers({ etag: '"abc123"' }),
          json: vi.fn().mockResolvedValue({ id: 1, name: "Buddy" }),
        };
        const response2 = {
          headers: new Headers({ etag: '"def456"' }),
          json: vi.fn().mockResolvedValue({ id: 2, name: "Max" }),
        };
        kyMock.get
          .mockReturnValueOnce(
            Object.assign(Promise.resolve(response1), response1),
          )
          .mockReturnValueOnce(
            Object.assign(Promise.resolve(response2), response2),
          );

        const rm = new RequestManager(kyMock as never, cache);
        await rm.get("api/pets", { memoize });
        await rm.get("api/pets", { memoize });

        const secondCallOptions = kyMock.get.mock.calls[1]![1] as Record<
          string,
          unknown
        >;
        expect(secondCallOptions.headers).toBeUndefined();
      },
    );

    it("honors Cache-Control max-age when memoizing GET responses", async () => {
      vi.useFakeTimers();

      const cache = new CacheManager({ refreshFrequencyMs: 60_000 });
      const headers = new Headers({
        "cache-control": "private, max-age=1, stale-while-revalidate=4",
      });
      const response = {
        headers,
        json: vi
          .fn()
          .mockResolvedValueOnce({ id: 1 })
          .mockResolvedValueOnce({ id: 2 }),
      };
      kyMock.get.mockImplementation(() =>
        Object.assign(Promise.resolve(response), response),
      );

      const rm = new RequestManager(kyMock as never, cache);
      await rm.get("api/pets", { memoize: { key: "pets:list" } });

      vi.advanceTimersByTime(1_500);
      const staleValue = await rm.get("api/pets", {
        memoize: { key: "pets:list" },
      });

      expect(staleValue).toEqual({ id: 1 });
      expect(kyMock.get).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(0);
      vi.useRealTimers();
    });

    it("does not store GET responses when Cache-Control disables caching", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60_000 });
      const firstResponse = {
        headers: new Headers({ "cache-control": "no-store" }),
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(firstResponse), firstResponse),
      );

      const rm = new RequestManager(kyMock as never, cache);
      await rm.get("api/pets", { memoize: { key: "pets:list" } });
      expect(cache.peek("pets:list")).toBeNull();

      const secondResponse = {
        headers: new Headers({ "cache-control": "no-store" }),
        json: vi.fn().mockResolvedValue({ id: 2 }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(secondResponse), secondResponse),
      );

      const second = await rm.get("api/pets", {
        memoize: { key: "pets:list" },
      });
      expect(second).toEqual({ id: 2 });
      expect(kyMock.get).toHaveBeenCalledTimes(2);
    });

    it("updates lastResponseMeta on non-304 HTTP errors before rethrowing", async () => {
      const error429 = new Error("rate limited") as Error & {
        response: { status: number; headers: Headers };
      };
      error429.response = {
        status: 429,
        headers: new Headers({
          "x-request-id": "req-rate-limit",
          "x-api-version": "1.2.0",
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1700000000",
          "retry-after": "30",
        }),
      };

      const rejectedPromise = Promise.reject(error429);
      rejectedPromise.catch(() => {});
      kyMock.get.mockReturnValueOnce(
        Object.assign(rejectedPromise, {
          json: vi.fn(),
          text: vi.fn(),
          blob: vi.fn(),
        }),
      );

      const rm = new RequestManager(kyMock as never, null);
      await expect(rm.get("api/pets")).rejects.toThrow("rate limited");
      expect(rm.lastResponseMeta).toMatchObject({
        requestId: "req-rate-limit",
        apiVersion: "1.2.0",
        rateLimit: {
          limit: 100,
          remaining: 0,
          reset: 1700000000,
          retryAfter: 30,
        },
      });
    });

    it("ignores invalid retry-after response metadata", async () => {
      const error429 = new Error("rate limited") as Error & {
        response: { status: number; headers: Headers };
      };
      error429.response = {
        status: 429,
        headers: new Headers({
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1700000000",
          "retry-after": "soon",
        }),
      };

      const rejectedPromise = Promise.reject(error429);
      rejectedPromise.catch(() => {});
      kyMock.get.mockReturnValueOnce(
        Object.assign(rejectedPromise, {
          json: vi.fn(),
          text: vi.fn(),
          blob: vi.fn(),
        }),
      );

      const rm = new RequestManager(kyMock as never, null);
      await expect(rm.get("api/pets")).rejects.toThrow("rate limited");
      expect(rm.lastResponseMeta.rateLimit).toEqual({
        limit: 100,
        remaining: 0,
        reset: 1700000000,
      });
    });

    it("rethrows structured non-2xx API failures as PawPlacerApiError", async () => {
      const error401 = new Error("Invalid API key") as Error & {
        apiError: {
          code: string;
          error: string;
          message: string;
          request_id: string;
          status: number;
        };
        response: { status: number; headers: Headers };
      };
      error401.apiError = {
        code: "invalid_api_key",
        error: "Invalid API key",
        message: "Invalid API key",
        request_id: "req-401",
        status: 401,
      };
      error401.response = {
        status: 401,
        headers: new Headers({
          "x-request-id": "req-401",
          "x-api-version": "1.2.0",
        }),
      };

      const rejectedPromise = Promise.reject(error401);
      rejectedPromise.catch(() => {});
      kyMock.get.mockReturnValueOnce(
        Object.assign(rejectedPromise, {
          json: vi.fn(),
          text: vi.fn(),
          blob: vi.fn(),
        }),
      );

      const rm = new RequestManager(kyMock as never, null);
      const request = rm.get("api/pets");
      await expect(request).rejects.toBeInstanceOf(PawPlacerApiError);
      await expect(request).rejects.toMatchObject({
        code: "invalid_api_key",
        requestId: "req-401",
        status: 401,
      });
    });

    it("captures idempotency replay metadata on successful responses", async () => {
      const response = {
        headers: new Headers({
          "x-request-id": "req-idempotent",
          "idempotency-replay": "TRUE",
        }),
        json: vi.fn().mockResolvedValue({ id: "pet-1" }),
      };
      kyMock.post.mockReturnValue(
        Object.assign(Promise.resolve(response), response),
      );

      const rm = new RequestManager(kyMock as never, null);
      const result = await rm.post("api/pets", { json: { name: "Buddy" } });

      expect(result).toEqual({ id: "pet-1" });
      expect(rm.lastResponseMeta).toMatchObject({
        requestId: "req-idempotent",
        idempotencyReplay: true,
      });
    });

    it("clears etags on invalidate", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });

      const headers1 = new Headers({ etag: '"abc123"' });
      const response1 = {
        headers: headers1,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      kyMock.get.mockReturnValue(
        Object.assign(Promise.resolve(response1), response1),
      );

      const rm = new RequestManager(kyMock as never, cache);
      await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });
      rm.invalidate("test-key");

      // After invalidation, next request should NOT send If-None-Match
      await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });

      const secondCallOptions = kyMock.get.mock.calls[1]![1] as Record<
        string,
        unknown
      >;
      expect(secondCallOptions.headers).toBeUndefined();
    });

    it("clears etags on clearEtags", async () => {
      const cache = new CacheManager({ refreshFrequencyMs: 60000 });

      const headers1 = new Headers({ etag: '"abc123"' });
      const response1 = {
        headers: headers1,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      kyMock.get.mockReturnValue(
        Object.assign(Promise.resolve(response1), response1),
      );

      const rm = new RequestManager(kyMock as never, cache);
      await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });
      rm.clearEtags();

      await rm.get("api/pets", {
        memoize: { key: "test-key", forceRefresh: true },
      });

      const secondCallOptions = kyMock.get.mock.calls[1]![1] as Record<
        string,
        unknown
      >;
      expect(secondCallOptions.headers).toBeUndefined();
    });

    it("clears ETag fallback bodies on invalidateMatching without cache", async () => {
      const headers1 = new Headers({ etag: '"abc123"' });
      const response1 = {
        headers: headers1,
        json: vi.fn().mockResolvedValue({ id: 1, name: "Buddy" }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(response1), response1),
      );

      const rm = new RequestManager(kyMock as never, null);
      await rm.get("api/pets");
      rm.invalidateMatching("api/pets");

      const response2 = {
        headers: new Headers({ etag: '"def456"' }),
        json: vi.fn().mockResolvedValue({ id: 2, name: "Max" }),
      };
      kyMock.get.mockReturnValueOnce(
        Object.assign(Promise.resolve(response2), response2),
      );

      const second = await rm.get("api/pets");
      expect(second).toEqual({ id: 2, name: "Max" });

      const secondCallOptions = kyMock.get.mock.calls[1]![1] as Record<
        string,
        unknown
      >;
      expect(secondCallOptions.headers).toBeUndefined();
    });
  });

  describe("in-flight deduplication", () => {
    it("deduplicates concurrent GET requests to same path", async () => {
      let resolveRequest: ((value: unknown) => void) | undefined;
      const pendingJsonPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });

      const mockHeaders = new Headers();
      const responseObj = {
        headers: mockHeaders,
        json: vi.fn().mockReturnValue(pendingJsonPromise),
        text: vi.fn(),
        blob: vi.fn(),
      };
      const chain = Object.assign(Promise.resolve(responseObj), responseObj);
      kyMock.get.mockReturnValue(chain);

      const rm = new RequestManager(kyMock as never, null);

      const p1 = rm.get("api/pets", { memoize: false });
      const p2 = rm.get("api/pets", { memoize: false });

      resolveRequest!({ pets: [] });
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(kyMock.get).toHaveBeenCalledTimes(1);
      expect(r1).toEqual(r2);
    });
  });
});
