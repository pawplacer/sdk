import type { RequestManager } from "../request-manager";
import { CONTRACT_TYPES, type ContractResponse, type ContractType } from "../types";
import { validateContractResponse } from "../validation";

export class ContractsApi {
  constructor(private requests: RequestManager) {}

  /** Fetch the terms & conditions markdown for a contract type. */
  async get(type: ContractType): Promise<ContractResponse> {
    if (!CONTRACT_TYPES.includes(type)) {
      throw new Error(
        `Contract type is required. Must be one of: ${CONTRACT_TYPES.join(", ")}.`,
      );
    }
    const response = await this.requests.get("api/contracts", {
      searchParams: new URLSearchParams({ type }),
      cacheKey: `contracts:${type}`,
    });
    return validateContractResponse(response);
  }
}
