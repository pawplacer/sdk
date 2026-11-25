import { describe, expect, it } from "vitest";

import { useStubServer } from "./helpers";

const stub = useStubServer();

describe("adoptionFees.get", () => {
  it("returns the fee rules", async () => {
    stub.handler = () => ({
      body: {
        fees: [
          { species: "dog", attribute_type: "age_category", attribute_value: "senior", adjustment: -50 },
        ],
      },
    });

    const fees = await stub.client().adoptionFees.get();

    expect(stub.requests[0].path).toBe("/api/adoption-fees");
    expect(fees).toEqual([
      { species: "dog", attribute_type: "age_category", attribute_value: "senior", adjustment: -50 },
    ]);
  });

  it("rejects a malformed rule", async () => {
    stub.handler = () => ({
      body: { fees: [{ species: "dog", attribute_type: "x", attribute_value: "y", adjustment: "5" }] },
    });

    await expect(stub.client().adoptionFees.get()).rejects.toThrow(
      "fees[0].adjustment must be number",
    );
  });
});

describe("contracts.get", () => {
  it.each(["adopter", "foster", "surrender", "volunteer"] as const)(
    "fetches the %s contract",
    async (type) => {
      stub.handler = () => ({ body: { type, content: "# Terms", updated_at: null } });

      const contract = await stub.client().contracts.get(type);

      expect(stub.requests[0].path).toBe("/api/contracts");
      expect(stub.requests[0].query.get("type")).toBe(type);
      expect(contract.content).toBe("# Terms");
    },
  );

  it("rejects an unknown type", async () => {
    await expect(stub.client().contracts.get("partner" as never)).rejects.toThrow(
      "Contract type is required",
    );
    expect(stub.requests).toHaveLength(0);
  });
});
