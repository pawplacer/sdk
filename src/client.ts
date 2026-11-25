import ky from "ky";

import { CacheManager, type CacheSnapshot } from "./cache";
import { RequestManager } from "./request-manager";
import { AdoptionFeesApi } from "./resources/adoption-fees";
import { ContractsApi } from "./resources/contracts";
import { PeopleApi } from "./resources/people";
import { PetsApi } from "./resources/pets";
import type { ApiResponseMeta, PawPlacerConfig } from "./types";
import { SDK_VERSION } from "./version";

const DEFAULT_API_URL = "https://pawplacer.com";

function resolveApiKey(apiKey: string | undefined): string {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const resolved = (apiKey ?? env?.PAWPLACER_API_KEY ?? "").trim();
  if (!resolved) {
    throw new Error(
      "PawPlacer API key is required. Pass apiKey or set PAWPLACER_API_KEY. Generate a key in Settings > SDK & API.",
    );
  }
  return resolved;
}

export class PawPlacerClient {
  readonly pets: PetsApi;
  readonly people: PeopleApi;
  readonly adoptionFees: AdoptionFeesApi;
  readonly contracts: ContractsApi;

  private requests: RequestManager;
  private cache: CacheManager | null;

  constructor(config: PawPlacerConfig = {}) {
    if (typeof window !== "undefined" && config.allowBrowser !== true) {
      throw new Error(
        "PawPlacer SDK must run on the server so your API key stays secret. For local browser testing only, pass allowBrowser: true.",
      );
    }

    const log = config.debug
      ? (...args: unknown[]) => console.debug("[PawPlacer SDK]", ...args)
      : undefined;

    const http = ky.create({
      prefix: (config.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, ""),
      timeout: config.timeout ?? 30_000,
      headers: {
        Accept: "application/json",
        "User-Agent": `pawplacer-sdk/${SDK_VERSION}`,
        "X-API-Key": resolveApiKey(config.apiKey),
      },
      retry: {
        limit: config.retryLimit ?? 2,
        // Writes are retried per request, only when they carry an idempotency key.
        methods: ["get"],
        statusCodes: [408, 429, 500, 502, 503, 504],
        backoffLimit: config.retryBackoffLimit ?? 3000,
      },
      hooks: log
        ? {
            beforeRequest: [
              ({ request }) => log(request.method, request.url),
            ],
            beforeRetry: [
              ({ error, retryCount }) =>
                log(`Retry ${retryCount} after error:`, error.message),
            ],
          }
        : {},
    });

    const cacheConfig = config.cache ?? {};
    this.cache =
      cacheConfig.enabled === false
        ? null
        : new CacheManager({
            maxSize: cacheConfig.maxSize,
            maxAgeOverrideMs:
              cacheConfig.ttlSeconds !== undefined
                ? cacheConfig.ttlSeconds * 1000
                : undefined,
          });

    this.requests = new RequestManager(http, this.cache);
    this.pets = new PetsApi(this.requests);
    this.people = new PeopleApi(this.requests, this.pets);
    this.adoptionFees = new AdoptionFeesApi(this.requests);
    this.contracts = new ContractsApi(this.requests);
  }

  /** Drops every cached response. */
  clearCache(): void {
    this.requests.clearCache();
  }

  /**
   * Drops cached responses whose key contains `pattern` (or matches a RegExp).
   * Keys: `pets:list:<query>`, `pets:get:<id>`, `pets:custom-fields`,
   * `people:list:<query>`, `people:get:<type>:<id>`, `people:custom-fields:<type>`,
   * `adoption-fees`, `contracts:<type>`.
   */
  invalidateCache(pattern: string | RegExp): void {
    this.requests.invalidate(pattern);
  }

  /** Cache hit/miss counters, or null when the cache is disabled. */
  cacheStats(): CacheSnapshot | null {
    return this.cache?.stats() ?? null;
  }

  /**
   * Headers from the most recent network response (cache hits don't update it).
   * Shared across concurrent requests, so read it right after the call you care about.
   */
  get lastResponseMeta(): ApiResponseMeta {
    return this.requests.lastResponseMeta;
  }
}
