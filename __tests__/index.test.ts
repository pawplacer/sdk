import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as sdk from "../src";

describe("package entrypoint", () => {
  it("exports only the client, error classes, and constants at runtime", () => {
    expect(Object.keys(sdk).sort()).toEqual([
      "CONTRACT_TYPES",
      "PERSON_TYPES",
      "PawPlacerApiError",
      "PawPlacerClient",
      "PawPlacerResponseValidationError",
      "SDK_VERSION",
    ]);
  });

  it("SDK_VERSION matches package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(sdk.SDK_VERSION).toBe(pkg.version);
  });
});
