import { beforeEach, describe, expect, it } from "vitest";

import {
  PawPlacerApiError,
  PawPlacerResponseValidationError,
} from "../src/errors";
import { AdoptionFeesApi } from "../src/resources/adoption-fees";
import type { RequestManager } from "../src/request-manager";
import type { AdoptionFeeEntry } from "../src/types";
import { createMockRequestManager } from "./test-utils";

const mockFees: AdoptionFeeEntry[] = [
  {
    species: "dog",
    attribute_type: "age",
    attribute_value: "youngest",
    adjustment: 350,
  },
  {
    species: "dog",
    attribute_type: "age",
    attribute_value: "adult",
    adjustment: 200,
  },
  {
    species: "cat",
    attribute_type: "age",
    attribute_value: "adult",
    adjustment: 100,
  },
];

describe("AdoptionFeesApi", () => {
  let requests: ReturnType<typeof createMockRequestManager>;
  let adoptionFees: AdoptionFeesApi;

  beforeEach(() => {
    requests = createMockRequestManager();
    adoptionFees = new AdoptionFeesApi(requests as unknown as RequestManager);
  });

  describe("get", () => {
    it("calls GET api/adoption-fees with 15min cache", async () => {
      requests.get.mockResolvedValue({ fees: mockFees });

      const result = await adoptionFees.get();

      const [url, options] = requests.get.mock.calls[0] as [
        string,
        { memoize: { key: string; refreshFrequencyMinutes: number } },
      ];
      expect(url).toBe("api/adoption-fees");
      expect(options.memoize.key).toBe("adoption-fees");
      expect(options.memoize.refreshFrequencyMinutes).toBe(15);

      expect(result).toHaveLength(3);
    });

    it("returns the full fee entries with all fields", async () => {
      requests.get.mockResolvedValue({ fees: mockFees });

      const result = await adoptionFees.get();

      expect(result[0]).toEqual({
        species: "dog",
        attribute_type: "age",
        attribute_value: "youngest",
        adjustment: 350,
      });
    });

    it("returns empty array when fees is empty", async () => {
      requests.get.mockResolvedValue({ fees: [] });

      const result = await adoptionFees.get();
      expect(result).toEqual([]);
    });

    it("throws on API error response", async () => {
      requests.get.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      await expect(adoptionFees.get()).rejects.toThrow("Invalid API key");
    });

    it("throws PawPlacerApiError with code and requestId", async () => {
      requests.get.mockResolvedValue({
        error: "Rate limited",
        code: "rate_limited",
        request_id: "req-fee",
      });

      try {
        await adoptionFees.get();
        expect.fail("Expected error");
      } catch (err) {
        expect(err).toBeInstanceOf(PawPlacerApiError);
        const apiErr = err as PawPlacerApiError;
        expect(apiErr.code).toBe("rate_limited");
        expect(apiErr.requestId).toBe("req-fee");
      }
    });

    it("throws when fees is not an array", async () => {
      requests.get.mockResolvedValue({ fees: null });

      await expect(adoptionFees.get()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws when fees is missing entirely", async () => {
      requests.get.mockResolvedValue({});

      await expect(adoptionFees.get()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws when a fee entry is missing adjustment", async () => {
      requests.get.mockResolvedValue({
        fees: [
          {
            species: "dog",
            attribute_type: "age",
            attribute_value: "youngest",
          },
        ],
      });

      await expect(adoptionFees.get()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws when a fee entry has non-numeric adjustment", async () => {
      requests.get.mockResolvedValue({
        fees: [
          {
            species: "dog",
            attribute_type: "age",
            attribute_value: "youngest",
            adjustment: "350",
          },
        ],
      });

      await expect(adoptionFees.get()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });
});
