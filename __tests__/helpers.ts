import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach } from "vitest";

import { PawPlacerClient } from "../src/client";
import type { PawPlacerConfig, Person, Pet } from "../src/types";

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingMessage["headers"];
  body: unknown;
}

export interface StubResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type Handler = (req: RecordedRequest) => StubResponse | Promise<StubResponse>;

/**
 * Starts one local HTTP server for the test file. Each test sets `stub.handler`
 * and reads `stub.requests`.
 */
export function useStubServer() {
  let server: Server;
  const stub = {
    url: "",
    requests: [] as RecordedRequest[],
    handler: (() => ({ status: 500, body: { error: "No handler" } })) as Handler,
    /** Responds with each entry in turn, repeating the last one. */
    sequence(...responses: StubResponse[]) {
      let call = 0;
      stub.handler = () => responses[Math.min(call++, responses.length - 1)];
    },
    client(config: PawPlacerConfig = {}) {
      return new PawPlacerClient({
        apiKey: "test-key",
        apiUrl: stub.url,
        retryBackoffLimit: 1,
        ...config,
      });
    },
  };

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString();
      const url = new URL(req.url ?? "/", "http://localhost");
      const recorded: RecordedRequest = {
        method: req.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : undefined,
      };
      stub.requests.push(recorded);
      const { status = 200, body, headers = {} } = await stub.handler(recorded);
      res.writeHead(status, {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      });
      res.end(body !== undefined ? JSON.stringify(body) : undefined);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    stub.requests = [];
    stub.handler = () => ({ status: 500, body: { error: "No handler" } });
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  return stub;
}

export const PET_ID = "550e8400-e29b-41d4-a716-446655440001";
export const PET_ID_2 = "550e8400-e29b-41d4-a716-446655440002";
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: PET_ID,
    name: "Max",
    species: "dog",
    age_category: "young",
    sex: "male",
    size: "medium",
    status: "Available",
    health: "good",
    breed: ["Labrador Retriever"],
    color: ["Black"],
    age_years: "2",
    age_months: null,
    age_birthday: null,
    description: "Friendly dog",
    spayed: true,
    adoption_fee: "250",
    global_adoption_fee: null,
    microchip_id: null,
    good_with: ["kids"],
    bad_with: [],
    temperaments: ["playful"],
    image_urls: [],
    image_url: null,
    coat_length: null,
    custom_field_data: {},
    custom_id: null,
    intake_date: null,
    outcome_date: null,
    primary_veterinarian: null,
    show_public: true,
    special_needs: [],
    tags: [],
    status_change_notes: null,
    weight: null,
    adopted_by: null,
    adopted_on: null,
    hold_until: null,
    is_sample: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    type: "adopter",
    name: "Jane Smith",
    email: "jane@example.com",
    phone: null,
    address: null,
    status: "active",
    status_change_notes: null,
    custom_field_data: {},
    tags: [],
    capacity: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function page<T>(key: string, items: T[], extra: Record<string, unknown> = {}) {
  return {
    [key]: items,
    total: items.length,
    limit: 20,
    offset: 0,
    hasMore: false,
    ...extra,
  };
}

export const MINIMAL_PET_INPUT = {
  name: "Max",
  species: "dog",
  age_category: "young",
  sex: "male",
  size: "medium",
  status: "available",
} as const;
