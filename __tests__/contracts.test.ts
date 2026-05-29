import { beforeEach, describe, expect, it } from "vitest";

import {
  PawPlacerApiError,
  PawPlacerResponseValidationError,
} from "../src/errors";
import { ContractsApi } from "../src/resources/contracts";
import type { RequestManager } from "../src/request-manager";
import type { ContractResponse } from "../src/types";
import { createMockRequestManager } from "./test-utils";

const mockContract: ContractResponse = {
  type: "adopter",
  content: "# Adoption Agreement\n\nBy signing you agree to...",
  updated_at: "2026-01-15T00:00:00.000Z",
};

describe("ContractsApi", () => {
  let requests: ReturnType<typeof createMockRequestManager>;
  let contracts: ContractsApi;

  beforeEach(() => {
    requests = createMockRequestManager();
    contracts = new ContractsApi(requests as unknown as RequestManager);
  });

  describe("get", () => {
    it("calls GET api/contracts with type param and 15min cache", async () => {
      requests.get.mockResolvedValue(mockContract);

      const result = await contracts.get("adopter");

      const [url, options] = requests.get.mock.calls[0] as [
        string,
        {
          searchParams: URLSearchParams;
          memoize: { key: string; refreshFrequencyMinutes: number };
        },
      ];
      expect(url).toBe("api/contracts");
      expect(options.searchParams.get("type")).toBe("adopter");
      expect(options.memoize.key).toBe("contracts:adopter");
      expect(options.memoize.refreshFrequencyMinutes).toBe(15);

      expect(result.type).toBe("adopter");
      expect(result.content).toContain("Adoption Agreement");
    });

    it("uses distinct cache key per type", async () => {
      requests.get.mockResolvedValue({ ...mockContract, type: "foster" });

      await contracts.get("foster");

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { memoize: { key: string }; searchParams: URLSearchParams },
      ];
      expect(options.memoize.key).toBe("contracts:foster");
      expect(options.searchParams.get("type")).toBe("foster");
    });

    it("supports all four valid contract types", async () => {
      const types = ["adopter", "foster", "volunteer", "surrender"] as const;

      for (const type of types) {
        requests.get.mockResolvedValue({ type, content: "", updated_at: null });
        const result = await contracts.get(type);
        expect(result.type).toBe(type);
      }
    });

    it("returns null updated_at when no contract exists", async () => {
      requests.get.mockResolvedValue({
        type: "adopter",
        content: "",
        updated_at: null,
      });

      const result = await contracts.get("adopter");
      expect(result.content).toBe("");
      expect(result.updated_at).toBeNull();
    });

    it("returns content and updated_at fields", async () => {
      requests.get.mockResolvedValue(mockContract);

      const result = await contracts.get("adopter");
      expect(result.content).toBe(
        "# Adoption Agreement\n\nBy signing you agree to...",
      );
      expect(result.updated_at).toBe("2026-01-15T00:00:00.000Z");
    });

    it("throws when type is invalid", async () => {
      await expect(contracts.get("pet" as never)).rejects.toThrow(
        "Contract type is required",
      );
    });

    it("throws when type is undefined", async () => {
      await expect(contracts.get(undefined as never)).rejects.toThrow(
        "Contract type is required",
      );
    });

    it("throws on API error response", async () => {
      requests.get.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      await expect(contracts.get("adopter")).rejects.toThrow("Invalid API key");
    });

    it("throws PawPlacerApiError with code and requestId", async () => {
      requests.get.mockResolvedValue({
        error: "Rate limited",
        code: "rate_limited",
        request_id: "req-c",
      });

      try {
        await contracts.get("adopter");
        expect.fail("Expected error");
      } catch (err) {
        expect(err).toBeInstanceOf(PawPlacerApiError);
        const apiErr = err as PawPlacerApiError;
        expect(apiErr.code).toBe("rate_limited");
        expect(apiErr.requestId).toBe("req-c");
      }
    });

    it("throws when response is missing type field", async () => {
      requests.get.mockResolvedValue({
        content: "Some content",
        updated_at: null,
      });

      await expect(contracts.get("adopter")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws when response is missing content field", async () => {
      requests.get.mockResolvedValue({
        type: "adopter",
        updated_at: null,
      });

      await expect(contracts.get("adopter")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws when content is not a string", async () => {
      requests.get.mockResolvedValue({
        type: "adopter",
        content: 42,
        updated_at: null,
      });

      await expect(contracts.get("adopter")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });
});
