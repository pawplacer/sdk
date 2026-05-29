import ky, { type HTTPError, type KyInstance } from "ky";

import { CacheManager, type CacheSnapshot } from "./cache";
import { normalizeApiError } from "./errors";
import { RequestManager } from "./request-manager";
import { AdoptionFeesApi } from "./resources/adoption-fees";
import { ContractsApi } from "./resources/contracts";
import { PeopleApi } from "./resources/people";
import { PetsApi } from "./resources/pets";
import type {
  ApiResponseMeta,
  PawPlacerConfig,
  Pet,
  PetListParams,
} from "./types";

function ensureServerEnvironment(config: PawPlacerConfig): void {
  const runningInBrowser = typeof window !== "undefined";
  if (runningInBrowser && config.allowBrowser !== true) {
    throw new Error(
      "PawPlacer SDK must be instantiated on the server. If you are testing locally in a browser, pass allowBrowser: true explicitly.",
    );
  }
}

function getEnvApiKey(): string {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = globalWithProcess.process?.env?.PAWPLACER_API_KEY;
  return typeof value === "string" ? value.trim() : "";
}

export class PawPlacerClient {
  private ky: KyInstance;
  private cache: CacheManager | null = null;
  private requests: RequestManager;
  public pets: PetsApi;
  public people: PeopleApi;
  public adoptionFees: AdoptionFeesApi;
  public contracts: ContractsApi;

  constructor(config: PawPlacerConfig = {}) {
    ensureServerEnvironment(config);

    const apiKey =
      typeof config.apiKey === "string" && config.apiKey.trim().length > 0
        ? config.apiKey.trim()
        : getEnvApiKey();
    if (!apiKey) {
      throw new Error(
        "apiKey is required for authentication. Pass apiKey or set PAWPLACER_API_KEY. Generate a key in Settings > SDK & API.",
      );
    }
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-API-Key": apiKey,
    };

    const apiUrl = (config.apiUrl ?? "https://pawplacer.com").replace(
      /\/+$/,
      "",
    );

    this.ky = ky.create({
      prefix: apiUrl,
      timeout: config.timeout || 30000, // 30 seconds
      headers,
      retry: {
        limit: config.retryLimit ?? 2,
        methods: ["get", "put", "patch", "delete"],
        statusCodes: [408, 429, 500, 502, 503, 504],
        backoffLimit: config.retryBackoffLimit ?? 3000, // 3 seconds
      },
      hooks: {
        beforeRequest: [
          ({ request }) => {
            if (config.debug) {
              console.debug(`[PawPlacer SDK] ${request.method} ${request.url}`);
            }
          },
        ],
        beforeRetry: [
          ({ error, retryCount }) => {
            if (config.debug) {
              console.debug(
                `[PawPlacer SDK] Retry attempt ${retryCount} after error:`,
                error.message,
              );
            }
          },
        ],
        beforeError: [
          async ({ error }) => {
            const httpError = error as HTTPError;
            const { response } = httpError;
            if (response?.body) {
              try {
                const body = await response.clone().json();
                const apiError = normalizeApiError(body);
                if (apiError) {
                  apiError.status = response.status;
                  httpError.message = apiError.message;
                  (
                    httpError as HTTPError & { apiError?: typeof apiError }
                  ).apiError = apiError;
                }
              } catch {
                // Failed to parse error body
              }
            }
            return httpError;
          },
        ],
      },
    });

    const cacheEnabled = config.cache?.enabled !== false;
    if (cacheEnabled) {
      const refreshFrequencyInput =
        config.cache?.refreshFrequencyMinutes ?? config.cache?.refreshFrequency;
      const refreshFrequencyMinutes =
        typeof refreshFrequencyInput === "number" &&
        Number.isFinite(refreshFrequencyInput)
          ? Math.max(refreshFrequencyInput, 0)
          : undefined;
      const refreshFrequencyMs =
        refreshFrequencyMinutes !== undefined
          ? refreshFrequencyMinutes * 60 * 1000
          : undefined;
      this.cache = new CacheManager({
        refreshFrequencyMs,
        maxSize: config.cache?.maxSize,
      });
    }

    this.requests = new RequestManager(this.ky, this.cache);
    this.pets = new PetsApi(this.requests);
    this.people = new PeopleApi(this.requests, this.pets);
    this.adoptionFees = new AdoptionFeesApi(this.requests);
    this.contracts = new ContractsApi(this.requests);
  }

  /**
   * @deprecated Use `client.pets.get(id, options)` instead.
   */
  async getPetById(
    id: string,
    options?: { forceRefresh?: boolean },
  ): Promise<Pet> {
    return this.pets.get(id, options);
  }

  /**
   * @deprecated Use `client.pets.findMany(filter, limit)` instead.
   */
  async findPets(filter?: PetListParams, limit?: number): Promise<Pet[]> {
    return this.pets.findMany(filter, limit);
  }

  clearCache(): void {
    this.cache?.clear();
    this.requests.clearEtags();
  }

  invalidateCache(pattern?: string | RegExp): void {
    if (pattern) {
      this.requests.invalidateMatching(pattern);
    } else {
      this.clearCache();
    }
  }

  cacheStats(): CacheSnapshot | null {
    return this.cache?.stats() ?? null;
  }

  get lastResponseMeta(): ApiResponseMeta {
    return this.requests.lastResponseMeta;
  }
}
