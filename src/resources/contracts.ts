import { throwIfApiError } from "../errors";
import type { JsonRecord } from "../internal";
import type { RequestManager } from "../request-manager";
import type { ContractResponse, ContractType } from "../types";
import { validateContractResponse } from "../validation";

const VALID_CONTRACT_TYPES: ContractType[] = [
  "adopter",
  "foster",
  "volunteer",
  "surrender",
];

export class ContractsApi {
  constructor(private requests: RequestManager) {}

  /** Fetch terms & conditions markdown for a contract type. */
  async get(type: ContractType): Promise<ContractResponse> {
    if (!type || !VALID_CONTRACT_TYPES.includes(type)) {
      throw new Error(
        'Contract type is required. Must be "adopter", "foster", "volunteer", or "surrender".',
      );
    }
    const response = await this.requests.get<JsonRecord>("api/contracts", {
      searchParams: new URLSearchParams({ type }),
      memoize: { key: `contracts:${type}`, refreshFrequencyMinutes: 15 },
    });
    throwIfApiError(response);
    return validateContractResponse(response);
  }
}
