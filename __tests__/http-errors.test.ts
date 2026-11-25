import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PawPlacerClient } from "../src/client";
import { PawPlacerApiError } from "../src/errors";

// These tests use a real ky instance against a local server, so they cover
// how ky hands error bodies to the SDK.

let server: Server;
let baseUrl = "";
let respond: (res: import("node:http").ServerResponse) => void = () => {};
let lastApiKey: string | undefined;

beforeAll(async () => {
  server = createServer((req, res) => {
    lastApiKey = req.headers["x-api-key"] as string | undefined;
    respond(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function client() {
  return new PawPlacerClient({
    apiKey: "test-key",
    apiUrl: baseUrl,
    retryLimit: 0,
  });
}

describe("HTTP error responses", () => {
  it("throws PawPlacerApiError with the API's message and code", async () => {
    respond = (res) => {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "Public API access is unavailable while sample data is active.",
          code: "sample_workspace_unavailable",
          request_id: "req_123",
        }),
      );
    };

    const error = await client()
      .pets.list()
      .catch((e: unknown) => e);

    expect(lastApiKey).toBe("test-key");
    expect(error).toBeInstanceOf(PawPlacerApiError);
    expect(error).toMatchObject({
      message: "Public API access is unavailable while sample data is active.",
      code: "sample_workspace_unavailable",
      status: 403,
      requestId: "req_123",
    });
  });

  it("keeps validation details", async () => {
    respond = (res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Validation failed",
          code: "validation_failed",
          request_id: "req_1",
          details: [{ path: "name", message: "Required" }],
        }),
      );
    };

    const error = (await client()
      .pets.get("550e8400-e29b-41d4-a716-446655440001")
      .catch((e: unknown) => e)) as PawPlacerApiError;

    expect(error.code).toBe("validation_failed");
    expect(error.status).toBe(400);
    expect(error.apiError.details).toEqual([
      { path: "name", message: "Required" },
    ]);
  });

  it("leaves non-JSON error responses as ky errors", async () => {
    respond = (res) => {
      res.writeHead(502, { "content-type": "text/html" });
      res.end("<html>Bad gateway</html>");
    };

    const error = await client()
      .pets.list()
      .catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(PawPlacerApiError);
    expect((error as Error).message).toContain("502");
  });
});
