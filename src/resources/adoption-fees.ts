import type { RequestManager } from "../request-manager";
import type { AdoptionFeeEntry } from "../types";
import { validateAdoptionFeesResponse } from "../validation";

export class AdoptionFeesApi {
  constructor(private requests: RequestManager) {}

  /** Fetch the account's adoption fee rules (species + attribute + adjustment). */
  async get(): Promise<AdoptionFeeEntry[]> {
    const response = await this.requests.get("api/adoption-fees", {
      cacheKey: "adoption-fees",
    });
    return validateAdoptionFeesResponse(response).fees;
  }
}
