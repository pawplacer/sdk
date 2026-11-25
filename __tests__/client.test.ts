import { afterEach, describe, expect, it, vi } from "vitest";

import { PawPlacerClient } from "../src/client";
import {
  PawPlacerApiError,
  PawPlacerResponseValidationError,
} from "../src/errors";
import { SDK_VERSION } from "../src/version";
import {
  MINIMAL_PET_INPUT,
  PET_ID,
  makePet,
  page,
  useStubServer,
} from "./helpers";

const stub = useStubServer();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("construction", () => {
  it("reads PAWPLACER_API_KEY when apiKey is omitted", async () => {
    vi.stubEnv("PAWPLACER_API_KEY", "  env-key  ");
    stub.handler = () => ({ body: page("pets", []) });

    await new PawPlacerClient({ apiUrl: stub.url }).pets.list();

    expect(stub.requests[0].headers["x-api-key"]).toBe("env-key");
  });

  it("throws when no API key is available", () => {
    vi.stubEnv("PAWPLACER_API_KEY", "");
    expect(() => new PawPlacerClient()).toThrow("PawPlacer API key is required");
    expect(() => new PawPlacerClient({ apiKey: "   " })).toThrow(
      "PawPlacer API key is required",
    );
  });

  it("refuses to run in a browser unless allowBrowser is set", () => {
    vi.stubGlobal("window", {});
    expect(() => new PawPlacerClient({ apiKey: "key" })).toThrow(
      "must run on the server",
    );
    expect(
      () => new PawPlacerClient({ apiKey: "key", allowBrowser: true }),
    ).not.toThrow();
  });

  it("sends auth, accept, and user-agent headers and strips trailing slashes", async () => {
    stub.handler = () => ({ body: page("pets", []) });

    await stub.client({ apiUrl: `${stub.url}///` }).pets.list();

    const { headers, path } = stub.requests[0];
    expect(path).toBe("/api/pets");
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers.accept).toBe("application/json");
    expect(headers["user-agent"]).toBe(`pawplacer-sdk/${SDK_VERSION}`);
  });
});

describe("errors", () => {
  it("throws PawPlacerApiError with the API's message, code, status, and request ID", async () => {
    stub.handler = () => ({
      status: 403,
      headers: { "x-request-id": "req_123" },
      body: {
        error: "Public API access is unavailable while sample data is active.",
        code: "sample_workspace_unavailable",
        request_id: "req_123",
      },
    });

    const error = await stub
      .client()
      .pets.list()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PawPlacerApiError);
    expect(error).toMatchObject({
      message: "Public API access is unavailable while sample data is active.",
      code: "sample_workspace_unavailable",
      status: 403,
      requestId: "req_123",
    });
  });

  it("keeps validation details from the error body", async () => {
    stub.handler = () => ({
      status: 400,
      body: {
        error: "Validation failed",
        code: "validation_failed",
        request_id: "req_1",
        details: [{ path: "name", message: "Required" }],
        docs: "https://pawplacer.com/docs/integrations/api-post",
      },
    });

    const error = (await stub
      .client()
      .pets.create(MINIMAL_PET_INPUT)
      .catch((e: unknown) => e)) as PawPlacerApiError;

    expect(error.code).toBe("validation_failed");
    expect(error.apiError.details).toEqual([
      { path: "name", message: "Required" },
    ]);
    expect(error.apiError.docs).toContain("api-post");
  });

  it("wraps non-JSON error responses, using the x-request-id header", async () => {
    stub.handler = () => ({
      status: 404,
      headers: { "content-type": "text/html", "x-request-id": "req_gw" },
    });

    const error = (await stub
      .client()
      .pets.get(PET_ID)
      .catch((e: unknown) => e)) as PawPlacerApiError;

    expect(error).toBeInstanceOf(PawPlacerApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe("http_404");
    expect(error.requestId).toBe("req_gw");
  });

  it("throws PawPlacerResponseValidationError for an unexpected 2xx body", async () => {
    stub.handler = () => ({ body: { pets: "nope" } });

    const error = (await stub
      .client()
      .pets.list()
      .catch((e: unknown) => e)) as PawPlacerResponseValidationError;

    expect(error).toBeInstanceOf(PawPlacerResponseValidationError);
    expect(error.payload).toEqual({ pets: "nope" });
  });
});

describe("retries", () => {
  it("retries GETs on 5xx", async () => {
    stub.sequence({ status: 503, body: { error: "busy" } }, { body: makePet() });

    const pet = await stub.client().pets.get(PET_ID);

    expect(pet.id).toBe(PET_ID);
    expect(stub.requests).toHaveLength(2);
  });

  it("retries writes that carry an idempotency key, reusing the key", async () => {
    stub.sequence(
      { status: 503, body: { error: "busy" } },
      { status: 201, body: makePet() },
    );

    await stub.client().pets.create(MINIMAL_PET_INPUT);

    expect(stub.requests).toHaveLength(2);
    const [first, second] = stub.requests;
    expect(first.headers["idempotency-key"]).toBeTruthy();
    expect(second.headers["idempotency-key"]).toBe(
      first.headers["idempotency-key"],
    );
  });

  it("does not retry writes without an idempotency key", async () => {
    stub.handler = () => ({ status: 503, body: { error: "busy" } });

    await expect(
      stub.client().pets.create(MINIMAL_PET_INPUT, { idempotencyKey: false }),
    ).rejects.toBeInstanceOf(PawPlacerApiError);

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].headers["idempotency-key"]).toBeUndefined();
  });

  it("does not retry a PATCH when retry is false", async () => {
    stub.handler = () => ({ status: 503, body: { error: "busy" } });

    await expect(
      stub
        .client()
        .pets.update(PET_ID, { description: "x" }, { retry: false }),
    ).rejects.toBeInstanceOf(PawPlacerApiError);

    expect(stub.requests).toHaveLength(1);
  });

  it("does not retry 4xx errors", async () => {
    stub.handler = () => ({ status: 400, body: { error: "bad" } });

    await expect(stub.client().pets.list()).rejects.toThrow("bad");

    expect(stub.requests).toHaveLength(1);
  });
});

describe("lastResponseMeta", () => {
  it("parses request ID, API version, rate limit, and idempotency replay", async () => {
    stub.handler = () => ({
      status: 201,
      body: makePet(),
      headers: {
        "x-request-id": "req_9",
        "x-api-version": "1.6.0",
        "x-generated-at": "2026-01-01T00:00:00Z",
        "x-ratelimit-limit": "250",
        "x-ratelimit-remaining": "249",
        "x-ratelimit-reset": "1767225600",
        "idempotency-replay": "true",
      },
    });
    const client = stub.client();

    await client.pets.create(MINIMAL_PET_INPUT, { idempotencyKey: "job:1" });

    expect(client.lastResponseMeta).toEqual({
      requestId: "req_9",
      apiVersion: "1.6.0",
      generatedAt: "2026-01-01T00:00:00Z",
      rateLimit: { limit: 250, remaining: 249, reset: 1767225600 },
      idempotencyReplay: true,
    });
  });

  it("is recorded for error responses too, including retryAfter", async () => {
    stub.handler = () => ({
      status: 429,
      body: { error: "Rate limited", code: "rate_limited" },
      headers: {
        "x-ratelimit-limit": "2000",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1767225600",
        "retry-after": "3600",
      },
    });
    const client = stub.client({ retryLimit: 0 });

    await expect(client.pets.list()).rejects.toThrow("Rate limited");

    expect(client.lastResponseMeta.rateLimit).toEqual({
      limit: 2000,
      remaining: 0,
      reset: 1767225600,
      retryAfter: 3600,
    });
  });

  it("flags responses from a workspace with sample data active", async () => {
    stub.handler = () => ({
      body: page("pets", [makePet({ is_sample: true })]),
      headers: { "x-pawplacer-sample-data": "true" },
    });
    const client = stub.client();

    const result = await client.pets.list();

    expect(client.lastResponseMeta.sampleData).toBe(true);
    expect(result.data[0].is_sample).toBe(true);
  });

  it("omits rateLimit when the API reports remaining as -1 (unknown)", async () => {
    stub.handler = () => ({
      body: page("pets", []),
      headers: {
        "x-ratelimit-limit": "2000",
        "x-ratelimit-remaining": "-1",
        "x-ratelimit-reset": "1767225600",
      },
    });
    const client = stub.client();

    await client.pets.list();

    expect(client.lastResponseMeta.rateLimit).toBeUndefined();
  });
});

describe("caching", () => {
  const listResponse = (cacheControl?: string, etag?: string) => ({
    body: page("pets", [makePet()]),
    headers: {
      ...(cacheControl ? { "cache-control": cacheControl } : {}),
      ...(etag ? { etag } : {}),
    },
  });

  it("serves repeat GETs from cache within max-age", async () => {
    stub.handler = () =>
      listResponse("private, max-age=60, stale-while-revalidate=300");
    const client = stub.client();

    await client.pets.list({ status: "available" });
    await client.pets.list({ status: "available" });

    expect(stub.requests).toHaveLength(1);
    expect(client.cacheStats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
  });

  it("de-duplicates concurrent identical GETs", async () => {
    stub.handler = () => listResponse("max-age=60");
    const client = stub.client();

    await Promise.all([client.pets.list(), client.pets.list()]);

    expect(stub.requests).toHaveLength(1);
  });

  it("revalidates stale entries with If-None-Match and keeps the value on 304", async () => {
    stub.handler = (req) =>
      req.headers["if-none-match"] === '"v1"'
        ? { status: 304, headers: { "cache-control": "max-age=60", etag: '"v1"' } }
        : listResponse("max-age=0, stale-while-revalidate=300", '"v1"');
    const client = stub.client();

    await client.pets.list();
    const stale = await client.pets.list(); // served stale, revalidates in background
    await vi.waitFor(() => expect(stub.requests).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const fresh = await client.pets.list(); // fresh for 60s after the 304

    expect(stub.requests[1].headers["if-none-match"]).toBe('"v1"');
    expect(stale.data).toHaveLength(1);
    expect(fresh.data).toHaveLength(1);
    expect(stub.requests).toHaveLength(2);
  });

  it("does not cache no-store responses", async () => {
    stub.handler = () => listResponse("no-store");
    const client = stub.client();

    await client.pets.list();
    await client.pets.list();

    expect(stub.requests).toHaveLength(2);
  });

  it("ttlSeconds overrides the API's max-age", async () => {
    stub.handler = () => listResponse("max-age=0");
    const client = stub.client({ cache: { ttlSeconds: 60 } });

    await client.pets.list();
    await client.pets.list();

    expect(stub.requests).toHaveLength(1);
  });

  it("forceRefresh bypasses the cache", async () => {
    stub.handler = () => ({ body: makePet(), headers: { "cache-control": "max-age=60" } });
    const client = stub.client();

    await client.pets.get(PET_ID);
    await client.pets.get(PET_ID, { forceRefresh: true });

    expect(stub.requests).toHaveLength(2);
  });

  it("can be disabled", async () => {
    stub.handler = () => listResponse("max-age=60", '"v1"');
    const client = stub.client({ cache: { enabled: false } });

    await client.pets.list();
    await client.pets.list();

    expect(stub.requests).toHaveLength(2);
    expect(stub.requests[1].headers["if-none-match"]).toBeUndefined();
    expect(client.cacheStats()).toBeNull();
  });

  it("invalidateCache and clearCache drop entries", async () => {
    stub.handler = () => listResponse("max-age=60");
    const client = stub.client();

    await client.pets.list();
    client.invalidateCache("pets:list:");
    await client.pets.list();
    client.clearCache();
    await client.pets.list();
    client.invalidateCache(/^pets:/);
    await client.pets.list();

    expect(stub.requests).toHaveLength(4);
  });

  it("drops cached lists after a successful write", async () => {
    stub.handler = (req) =>
      req.method === "POST"
        ? { status: 201, body: makePet() }
        : listResponse("max-age=60");
    const client = stub.client();

    await client.pets.list();
    await client.pets.create(MINIMAL_PET_INPUT);
    await client.pets.list();

    expect(stub.requests.map((r) => r.method)).toEqual(["GET", "POST", "GET"]);
  });
});
