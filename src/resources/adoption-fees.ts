import { throwIfApiError } from "../errors";
import type { JsonRecord } from "../internal";
import type { RequestManager } from "../request-manager";
import type { AdoptionFeeEntry } from "../types";
import { validateAdoptionFeesResponse } from "../validation";

export class AdoptionFeesApi {
  constructor(private requests: RequestManager) {}

  /** Fetch the account's adoption fee rules (species + attribute + adjustment). */
  async get(): Promise<AdoptionFeeEntry[]> {
    const response = await this.requests.get<JsonRecord>("api/adoption-fees", {
      memoize: { key: "adoption-fees", refreshFrequencyMinutes: 15 },
    });
    throwIfApiError(response);
    return validateAdoptionFeesResponse(response).fees;
  }
}
