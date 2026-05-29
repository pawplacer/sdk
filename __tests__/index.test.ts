import { describe, expect, it } from "vitest";

import * as sdk from "../src";

describe("public entrypoint", () => {
  it("exports documented runtime APIs", () => {
    const runtimeExports = [
      "AdoptionFeesApi",
      "CacheManager",
      "ContractsApi",
      "PawPlacerApiError",
      "PawPlacerClient",
      "PawPlacerResponseValidationError",
      "PeopleApi",
      "PetsApi",
      "RequestManager",
      "normalizeApiError",
      "throwApiError",
      "throwIfApiError",
      "validateAdoptionFeesResponse",
      "validateContractResponse",
      "validatePerson",
      "validatePersonCustomFieldsResponse",
      "validatePersonListResponse",
      "validatePet",
      "validatePetCustomFieldsResponse",
      "validatePetListResponse",
    ] as const;

    expect(Object.keys(sdk).sort()).toEqual([...runtimeExports].sort());
    for (const exportName of runtimeExports) {
      expect(sdk[exportName]).toEqual(expect.any(Function));
    }
  });

  it("exports throwIfApiError from the public entrypoint", () => {
    expect(() => sdk.throwIfApiError({ error: "Validation failed" })).toThrow(
      sdk.PawPlacerApiError,
    );
  });
});
