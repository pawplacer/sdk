import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PawPlacerApiError,
  PawPlacerResponseValidationError,
} from "../src/errors";
import type { RequestManager } from "../src/request-manager";
import { PeopleApi } from "../src/resources/people";
import type { Person, PersonType } from "../src/types";
import { createMockRequestManager } from "./test-utils";

const mockAdopter: Person = {
  id: "person-1",
  type: "adopter",
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "555-0100",
  address: "123 Main St",
  status: "active",
  status_change_notes: null,
  custom_field_data: {},
  tags: [],
  capacity: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const mockFoster: Person = {
  ...mockAdopter,
  id: "person-2",
  type: "foster",
  name: "Bob Foster",
  capacity: 3,
};

const mockSurrender: Person = {
  ...mockAdopter,
  id: "person-3",
  type: "surrender",
  name: "Sam Surrender",
};

const mockVolunteer: Person = {
  ...mockAdopter,
  id: "person-4",
  type: "volunteer",
  name: "Val Volunteer",
};

function createPersonResponse(overrides: Partial<Person> = {}): Person {
  return { ...mockAdopter, ...overrides };
}

function createListResponse(
  people: Person[],
  overrides: Partial<{
    type: PersonType;
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }> = {},
) {
  return {
    type: overrides.type ?? "adopter",
    people,
    total: overrides.total ?? people.length,
    limit: overrides.limit ?? 20,
    offset: overrides.offset ?? 0,
    hasMore: overrides.hasMore ?? false,
  };
}

describe("PeopleApi", () => {
  let requests: ReturnType<typeof createMockRequestManager>;
  let people: PeopleApi;
  let petCreator: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    requests = createMockRequestManager();
    petCreator = { create: vi.fn() };
    people = new PeopleApi(
      requests as unknown as RequestManager,
      petCreator as never,
    );
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe("list", () => {
    it("calls GET api/people with type param and cache key", async () => {
      requests.get.mockResolvedValue(
        createListResponse([mockAdopter], { type: "adopter" }),
      );

      const result = await people.list({ type: "adopter" });

      const [url, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; memoize: { key: string } },
      ];
      expect(url).toBe("api/people");
      expect(options.searchParams.get("type")).toBe("adopter");
      expect(options.memoize.key).toBe("people:list:type=adopter");

      expect(result.type).toBe("adopter");
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe("Jane Smith");
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it("supports type=foster", async () => {
      requests.get.mockResolvedValue(
        createListResponse([mockFoster], { type: "foster" }),
      );

      const result = await people.list({ type: "foster" });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      expect(options.searchParams.get("type")).toBe("foster");
      expect(result.type).toBe("foster");
      expect(result.data[0]!.type).toBe("foster");
    });

    it("supports type=surrender", async () => {
      requests.get.mockResolvedValue(
        createListResponse([mockSurrender], { type: "surrender" }),
      );

      const result = await people.list({ type: "surrender" });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; memoize: { key: string } },
      ];
      expect(options.searchParams.get("type")).toBe("surrender");
      expect(options.memoize.key).toBe("people:list:type=surrender");
      expect(result.type).toBe("surrender");
      expect(result.data[0]!.type).toBe("surrender");
    });

    it("supports type=volunteer", async () => {
      requests.get.mockResolvedValue(
        createListResponse([mockVolunteer], { type: "volunteer" }),
      );

      const result = await people.list({ type: "volunteer" });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; memoize: { key: string } },
      ];
      expect(options.searchParams.get("type")).toBe("volunteer");
      expect(options.memoize.key).toBe("people:list:type=volunteer");
      expect(result.type).toBe("volunteer");
      expect(result.data[0]!.type).toBe("volunteer");
    });

    it("passes all query params as URLSearchParams", async () => {
      requests.get.mockResolvedValue(
        createListResponse([], { total: 0, limit: 10, offset: 5 }),
      );

      await people.list({
        type: "adopter",
        limit: 10,
        offset: 5,
        status: "active",
        search: "jane",
        updated_since: "2026-01-01T00:00:00.000Z",
      });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      const params = options.searchParams;
      expect(params.get("type")).toBe("adopter");
      expect(params.get("limit")).toBe("10");
      expect(params.get("offset")).toBe("5");
      expect(params.get("status")).toBe("active");
      expect(params.get("search")).toBe("jane");
      expect(params.get("updated_since")).toBe("2026-01-01T00:00:00.000Z");
    });

    it("omits blank string optional params", async () => {
      requests.get.mockResolvedValue(createListResponse([]));

      await people.list({ type: "adopter", status: "  ", search: "  " });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      expect(options.searchParams.has("status")).toBe(false);
      expect(options.searchParams.has("search")).toBe(false);
    });

    it("returns hasMore from API", async () => {
      requests.get.mockResolvedValue(
        createListResponse([mockAdopter], { total: 50, hasMore: true }),
      );

      const result = await people.list({ type: "adopter" });
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(50);
    });

    it("throws when type is missing", async () => {
      await expect(people.list({ type: undefined as never })).rejects.toThrow(
        "Person type is required",
      );
    });

    it("throws when type is invalid", async () => {
      await expect(people.list({ type: "donor" as never })).rejects.toThrow(
        "Person type is required",
      );
      expect(requests.get).not.toHaveBeenCalled();
    });

    it("throws when API returns error response", async () => {
      requests.get.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      await expect(people.list({ type: "adopter" })).rejects.toThrow(
        "Invalid API key",
      );
    });

    it("throws PawPlacerApiError with code and requestId", async () => {
      requests.get.mockResolvedValue({
        error: "Rate limited",
        code: "rate_limited",
        request_id: "req-2",
      });

      try {
        await people.list({ type: "adopter" });
        expect.fail("Expected error");
      } catch (err) {
        expect(err).toBeInstanceOf(PawPlacerApiError);
        const apiErr = err as PawPlacerApiError;
        expect(apiErr.code).toBe("rate_limited");
        expect(apiErr.requestId).toBe("req-2");
      }
    });

    it("throws when list response shape is invalid (missing people array)", async () => {
      requests.get.mockResolvedValue({
        type: "adopter",
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      await expect(people.list({ type: "adopter" })).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws when a person in the list has invalid shape", async () => {
      requests.get.mockResolvedValue(
        createListResponse([{ id: "bad", name: "Incomplete" } as Person]),
      );

      await expect(people.list({ type: "adopter" })).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // get / getById
  // ---------------------------------------------------------------------------

  describe("get / getById", () => {
    it("calls GET api/people/:id with type query param and cache key", async () => {
      requests.get.mockResolvedValue(mockAdopter);

      const result = await people.get("person-1", "adopter");

      const [url, options] = requests.get.mock.calls[0] as [
        string,
        {
          searchParams: URLSearchParams;
          memoize: { key: string; staleWhileRevalidateMs: number };
        },
      ];
      expect(url).toBe("api/people/person-1");
      expect(options.searchParams.get("type")).toBe("adopter");
      expect(options.memoize.key).toBe("people:get:adopter:person-1");
      expect(options.memoize.staleWhileRevalidateMs).toBe(30 * 60 * 1000);
      expect(result.name).toBe("Jane Smith");
    });

    it("uses correct cache key for foster type", async () => {
      requests.get.mockResolvedValue(mockFoster);

      await people.get("person-2", "foster");

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { memoize: { key: string } },
      ];
      expect(options.memoize.key).toBe("people:get:foster:person-2");
    });

    it("uses correct cache key for surrender type", async () => {
      requests.get.mockResolvedValue(mockSurrender);

      await people.get("person-3", "surrender");

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; memoize: { key: string } },
      ];
      expect(options.searchParams.get("type")).toBe("surrender");
      expect(options.memoize.key).toBe("people:get:surrender:person-3");
    });

    it("uses correct cache key for volunteer type", async () => {
      requests.get.mockResolvedValue(mockVolunteer);

      await people.get("person-4", "volunteer");

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; memoize: { key: string } },
      ];
      expect(options.searchParams.get("type")).toBe("volunteer");
      expect(options.memoize.key).toBe("people:get:volunteer:person-4");
    });

    it("getById delegates to get", async () => {
      requests.get.mockResolvedValue(mockAdopter);

      const result = await people.getById("person-1", "adopter");
      expect(result.name).toBe("Jane Smith");
    });

    it("supports forceRefresh option", async () => {
      requests.get.mockResolvedValue(mockAdopter);

      await people.get("person-1", "adopter", { forceRefresh: true });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { memoize: { forceRefresh: boolean } },
      ];
      expect(options.memoize.forceRefresh).toBe(true);
    });

    it("trims id before use", async () => {
      requests.get.mockResolvedValue(mockAdopter);

      await people.get("  person-1  ", "adopter");

      const [url] = requests.get.mock.calls[0] as [string];
      expect(url).toBe("api/people/person-1");
    });

    it("throws when id is empty string", async () => {
      await expect(people.get("", "adopter")).rejects.toThrow(
        "Person ID is required",
      );
    });

    it("throws when id is whitespace only", async () => {
      await expect(people.get("   ", "adopter")).rejects.toThrow(
        "Person ID is required",
      );
    });

    it("throws when type is missing", async () => {
      await expect(people.get("person-1", undefined as never)).rejects.toThrow(
        "Person type is required",
      );
    });

    it("throws when type is invalid", async () => {
      await expect(people.get("person-1", "donor" as never)).rejects.toThrow(
        "Person type is required",
      );
      expect(requests.get).not.toHaveBeenCalled();
    });

    it("throws on API error response", async () => {
      requests.get.mockResolvedValue({
        error: "Person not found",
        code: "not_found",
        request_id: "req-1",
      });

      await expect(people.get("nonexistent", "adopter")).rejects.toThrow(
        "Person not found",
      );
    });

    it("throws when person response shape is invalid", async () => {
      requests.get.mockResolvedValue({ id: "person-1", name: "Jane" });

      await expect(people.get("person-1", "adopter")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findMany
  // ---------------------------------------------------------------------------

  describe("findMany", () => {
    it("delegates to list and returns data array", async () => {
      requests.get.mockResolvedValue(
        createListResponse([mockAdopter], { type: "adopter" }),
      );

      const result = await people.findMany({ type: "adopter" });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Jane Smith");
    });

    it("applies default limit of 10", async () => {
      requests.get.mockResolvedValue(createListResponse([], { limit: 10 }));

      await people.findMany({ type: "adopter" });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      expect(options.searchParams.get("limit")).toBe("10");
    });

    it("respects custom limit override", async () => {
      requests.get.mockResolvedValue(createListResponse([], { limit: 25 }));

      await people.findMany({ type: "adopter" }, 25);

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      expect(options.searchParams.get("limit")).toBe("25");
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe("create", () => {
    const validInput = {
      type: "adopter" as const,
      name: "Alice Adopter",
    };

    it("sends POST to api/people with type in body and generates idempotency key", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({ id: "new-person", ...validInput }),
      );

      const result = await people.create(validInput);

      const [url, options] = requests.post.mock.calls[0] as [
        string,
        {
          json: Record<string, unknown>;
          headers: Record<string, string>;
          searchParams: URLSearchParams;
        },
      ];
      expect(url).toBe("api/people");
      expect(options.json.type).toBe("adopter");
      expect(options.json.name).toBe("Alice Adopter");
      expect(options.headers["Idempotency-Key"]).toBeDefined();
      expect(options.searchParams.get("type")).toBe("adopter");
      expect(result.name).toBe("Alice Adopter");
    });

    it("sends all optional fields when provided", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({ id: "new-person" }),
      );

      await people.create({
        type: "foster",
        name: "Bob Foster",
        email: "bob@example.com",
        phone: "555-0200",
        address: "456 Oak Ave",
        status: "active",
        custom_field_data: { dog_experience: "yes" },
        capacity: 2,
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.email).toBe("bob@example.com");
      expect(options.json.phone).toBe("555-0200");
      expect(options.json.address).toBe("456 Oak Ave");
      expect(options.json.status).toBe("active");
      expect(options.json.status_change_notes).toBeUndefined();
      expect(options.json.custom_field_data).toEqual({ dog_experience: "yes" });
      expect(options.json.capacity).toBe(2);
    });

    it("submits an adopter application with accepted terms and pet IDs", async () => {
      const petId = "550e8400-e29b-41d4-a716-446655440001";
      const submissionId = "550e8400-e29b-41d4-a716-446655440002";
      requests.post.mockResolvedValue(
        createPersonResponse({
          application: {
            id: "550e8400-e29b-41d4-a716-446655440003",
            pet_ids: [petId],
            submitted_at: "2026-08-11T12:00:00.000Z",
          },
          id: submissionId,
          status: "pending",
        }),
      );

      const result = await people.create(
        {
          application: {
            pet_ids: [petId],
            terms_accepted: true,
          },
          custom_field_data: { housing_type: "house" },
          name: "Alice Adopter",
          type: "adopter",
        },
        { idempotencyKey: submissionId },
      );

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { headers: Record<string, string>; json: Record<string, unknown> },
      ];
      expect(options.headers["Idempotency-Key"]).toBe(submissionId);
      expect(options.json.application).toEqual({
        pet_ids: [petId],
        terms_accepted: true,
      });
      expect(result.status).toBe("pending");
      expect(result.application).toEqual({
        id: "550e8400-e29b-41d4-a716-446655440003",
        pet_ids: [petId],
        submitted_at: "2026-08-11T12:00:00.000Z",
      });
    });

    it("generates the UUID idempotency key required by applications", async () => {
      requests.post.mockResolvedValue(createPersonResponse());

      await people.create({
        application: {
          pet_ids: ["550e8400-e29b-41d4-a716-446655440001"],
          terms_accepted: true,
        },
        name: "Alice Adopter",
        type: "adopter",
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(options.headers["Idempotency-Key"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("supports foster applications", async () => {
      const petId = "550e8400-e29b-41d4-a716-446655440001";
      requests.post.mockResolvedValue(createPersonResponse({ type: "foster" }));

      const result = await people.create({
        application: {
          pet_ids: [petId],
          terms_accepted: true,
        },
        name: "Fran Foster",
        type: "foster",
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.application).toEqual({
        pet_ids: [petId],
        terms_accepted: true,
      });
      expect(result.type).toBe("foster");
    });

    it("rejects application payloads outside adopter and foster people", async () => {
      await expect(
        people.create({
          application: {
            pet_ids: ["550e8400-e29b-41d4-a716-446655440001"],
            terms_accepted: true,
          },
          name: "Val Volunteer",
          type: "volunteer",
        }),
      ).rejects.toThrow(
        'Person application can only be provided when type is "adopter" or "foster"',
      );
      expect(requests.post).not.toHaveBeenCalled();
    });

    it("validates application terms and pet UUIDs before posting", async () => {
      await expect(
        people.create({
          application: {
            pet_ids: ["not-a-uuid"],
            terms_accepted: true,
          },
          name: "Alice Adopter",
          type: "adopter",
        }),
      ).rejects.toThrow("Person application pet_ids must be an array of UUIDs");

      await expect(
        people.create({
          application: {
            pet_ids: ["550e8400-e29b-41d4-a716-446655440001"],
            terms_accepted: false,
          } as never,
          name: "Alice Adopter",
          type: "adopter",
        }),
      ).rejects.toThrow("Person application terms_accepted must be true");

      await expect(
        people.create({
          application: {
            pet_ids: [
              "550e8400-e29b-41d4-a716-446655440001",
              "550e8400-e29b-41d4-a716-446655440001",
            ],
            terms_accepted: true,
          },
          name: "Alice Adopter",
          type: "adopter",
        }),
      ).rejects.toThrow("Person application pet_ids must be unique");

      expect(requests.post).not.toHaveBeenCalled();
    });

    it("enforces application pet limits and input exclusivity", async () => {
      await expect(
        people.create({
          application: { pet_ids: [], terms_accepted: true },
          name: "Alice Adopter",
          type: "adopter",
        }),
      ).rejects.toThrow("Person application must include at least one pet_id");

      await expect(
        people.create({
          application: {
            pet_ids: [
              "550e8400-e29b-41d4-a716-446655440001",
              "550e8400-e29b-41d4-a716-446655440002",
              "550e8400-e29b-41d4-a716-446655440003",
              "550e8400-e29b-41d4-a716-446655440004",
              "550e8400-e29b-41d4-a716-446655440005",
              "550e8400-e29b-41d4-a716-446655440006",
            ],
            terms_accepted: true,
          },
          name: "Alice Adopter",
          type: "adopter",
        }),
      ).rejects.toThrow(
        "Person application cannot include more than 5 pet_ids",
      );

      await expect(
        people.create({
          application: {
            pet_ids: ["550e8400-e29b-41d4-a716-446655440001"],
            terms_accepted: true,
          },
          name: "Alice Adopter",
          pets: [{ pet_id: "550e8400-e29b-41d4-a716-446655440002" }],
          type: "adopter",
        }),
      ).rejects.toThrow(
        "Person application and surrender pets cannot be provided together",
      );

      expect(requests.post).not.toHaveBeenCalled();
    });

    it("requires UUID idempotency for applications", async () => {
      const input = {
        application: {
          pet_ids: ["550e8400-e29b-41d4-a716-446655440001"],
          terms_accepted: true as const,
        },
        name: "Alice Adopter",
        type: "adopter" as const,
      };

      await expect(
        people.create(input, { idempotencyKey: false }),
      ).rejects.toThrow("Person applications require an idempotency key");
      await expect(
        people.create(input, { idempotencyKey: "application-1" }),
      ).rejects.toThrow("Person application idempotencyKey must be a UUID");
      expect(requests.post).not.toHaveBeenCalled();
    });

    it("creates surrender records with the same people endpoint", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({
          id: "new-surrender",
          type: "surrender",
          name: "Sam Surrender",
        }),
      );

      const result = await people.create({
        type: "surrender",
        name: "Sam Surrender",
        email: "sam@example.com",
        custom_field_data: { requested_intake_at: "2026-06-01" },
      });

      const [url, options] = requests.post.mock.calls[0] as [
        string,
        {
          json: Record<string, unknown>;
          searchParams: URLSearchParams;
        },
      ];
      expect(url).toBe("api/people");
      expect(options.json.type).toBe("surrender");
      expect(options.searchParams.get("type")).toBe("surrender");
      expect(result.type).toBe("surrender");
    });

    it("creates and links surrender pets through the Pets API", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({
          id: "new-surrender",
          type: "surrender",
          name: "Sam Surrender",
        }),
      );
      petCreator.create.mockResolvedValue({
        id: "created-pet-1",
        name: "Buddy",
      });

      await people.create({
        type: "surrender",
        name: "Sam Surrender",
        pets: [
          {
            create: {
              name: "Buddy",
              species: "dog",
              age_category: "adult",
              sex: "male",
              size: "large",
              status: "intake",
              health: "unknown",
              breed: ["Lab", "  Mix  ", ""],
              color: ["black"],
            },
            reason: "Moving",
            urgency: "high",
            custom_data: { has_records: true },
          },
          {
            pet_id: "11111111-1111-1111-1111-111111111111",
            notes: "Existing pet profile",
          },
        ],
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(petCreator.create).toHaveBeenCalledWith(
        {
          name: "Buddy",
          species: "dog",
          age_category: "adult",
          sex: "male",
          size: "large",
          status: "intake",
          health: "unknown",
          breed: ["Lab", "  Mix  ", ""],
          color: ["black"],
        },
        undefined,
      );
      expect(options.json.pets).toEqual([
        {
          pet_id: "created-pet-1",
          reason: "Moving",
          urgency: "high",
          custom_data: { has_records: true },
        },
        {
          pet_id: "11111111-1111-1111-1111-111111111111",
          notes: "Existing pet profile",
        },
      ]);
    });

    it("derives pet idempotency keys from caller-provided surrender keys", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({ id: "new-surrender", type: "surrender" }),
      );
      petCreator.create.mockResolvedValue({ id: "created-pet-1" });

      await people.create(
        {
          type: "surrender",
          name: "Sam Surrender",
          pets: [
            {
              create: {
                name: "Buddy",
                species: "dog",
                age_category: "adult",
                sex: "male",
                size: "large",
                status: "intake",
                health: "unknown",
              },
            },
          ],
        },
        { idempotencyKey: "surrender-key" },
      );

      expect(petCreator.create).toHaveBeenCalledWith(expect.any(Object), {
        idempotencyKey: "surrender-key:pet:0",
        retry: undefined,
      });
    });

    it("rejects surrender pets on non-surrender person types", async () => {
      await expect(
        people.create({
          type: "foster",
          name: "Bob Foster",
          pets: [{ pet_id: "11111111-1111-1111-1111-111111111111" }],
        }),
      ).rejects.toThrow(
        'Person pets can only be provided when type is "surrender"',
      );
    });

    it("does not create pets before rejecting non-surrender pet links", async () => {
      await expect(
        people.create({
          type: "foster",
          name: "Bob Foster",
          pets: [
            {
              create: {
                name: "Buddy",
                species: "dog",
                age_category: "adult",
                sex: "male",
                size: "large",
                status: "intake",
                health: "unknown",
              },
            },
          ],
        }),
      ).rejects.toThrow(
        'Person pets can only be provided when type is "surrender"',
      );

      expect(petCreator.create).not.toHaveBeenCalled();
      expect(requests.post).not.toHaveBeenCalled();
    });

    it("rejects invalid surrender pet payloads", async () => {
      await expect(
        people.create({
          type: "surrender",
          name: "Sam Surrender",
          pets: [],
        }),
      ).rejects.toThrow("Surrender pets must include at least one pet");

      await expect(
        people.create({
          type: "surrender",
          name: "Sam Surrender",
          pets: [{}],
        }),
      ).rejects.toThrow(
        "Surrender pet at index 0 must include pet_id or create",
      );
    });

    it("validates all surrender pet links before creating new pets", async () => {
      await expect(
        people.create({
          type: "surrender",
          name: "Sam Surrender",
          pets: [
            {
              create: {
                name: "Buddy",
                species: "dog",
                age_category: "adult",
                sex: "male",
                size: "large",
                status: "intake",
                health: "unknown",
              },
            },
            {},
          ],
        }),
      ).rejects.toThrow(
        "Surrender pet at index 1 must include pet_id or create",
      );

      expect(petCreator.create).not.toHaveBeenCalled();
      expect(requests.post).not.toHaveBeenCalled();
    });

    it("creates volunteer records with the same people endpoint", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({
          id: "new-volunteer",
          type: "volunteer",
          name: "Val Volunteer",
        }),
      );

      const result = await people.create({
        type: "volunteer",
        name: "Val Volunteer",
        email: "val@example.com",
        custom_field_data: { preferred_shift: "Saturday" },
      });

      const [url, options] = requests.post.mock.calls[0] as [
        string,
        {
          json: Record<string, unknown>;
          searchParams: URLSearchParams;
        },
      ];
      expect(url).toBe("api/people");
      expect(options.json.type).toBe("volunteer");
      expect(options.searchParams.get("type")).toBe("volunteer");
      expect(result.type).toBe("volunteer");
    });

    it("trims name before sending", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({ id: "new-person" }),
      );

      await people.create({ type: "adopter", name: "  Alice  " });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.name).toBe("Alice");
    });

    it("throws a clear error for invalid optional string fields", async () => {
      await expect(
        people.create({
          type: "adopter",
          name: "Alice",
          email: 42 as never,
        }),
      ).rejects.toThrow("Person email must be a string");
    });

    it("throws a clear error for invalid custom_field_data", async () => {
      await expect(
        people.create({
          type: "adopter",
          name: "Alice",
          custom_field_data: ["not", "an", "object"] as never,
        }),
      ).rejects.toThrow("Person custom_field_data must be an object");
    });

    it("throws a clear error for invalid capacity", async () => {
      await expect(
        people.create({
          type: "foster",
          name: "Bob Foster",
          capacity: "2" as never,
        }),
      ).rejects.toThrow("Person capacity must be a finite number");

      await expect(
        people.create({
          type: "foster",
          name: "Bob Foster",
          capacity: Number.POSITIVE_INFINITY,
        }),
      ).rejects.toThrow("Person capacity must be a finite number");
    });

    it("throws a clear error for invalid surrender pet custom_data", async () => {
      await expect(
        people.create({
          type: "surrender",
          name: "Sam Surrender",
          pets: [
            {
              pet_id: "11111111-1111-1111-1111-111111111111",
              custom_data: ["not", "an", "object"] as never,
            },
          ],
        }),
      ).rejects.toThrow("Surrender pet custom_data must be an object");
    });

    it("allows caller-provided idempotency key", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({ id: "new-person" }),
      );

      await people.create(validInput, { idempotencyKey: "my-key-abc" });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(options.headers["Idempotency-Key"]).toBe("my-key-abc");
    });

    it("allows disabling idempotency key", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({ id: "new-person" }),
      );

      await people.create(validInput, { idempotencyKey: false });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { headers: Record<string, string>; retry?: unknown },
      ];
      expect(options.headers["Idempotency-Key"]).toBeUndefined();
      expect(options.retry).toBeUndefined();
    });

    it("invalidates list cache after successful create", async () => {
      requests.post.mockResolvedValue(
        createPersonResponse({ id: "new-person" }),
      );

      await people.create(validInput);

      expect(requests.invalidateMatching).toHaveBeenCalledWith("people:list:");
    });

    it("throws when type is missing", async () => {
      await expect(
        people.create({ name: "Alice", type: undefined as never }),
      ).rejects.toThrow("Person type is required");
    });

    it("throws when type is invalid", async () => {
      await expect(
        people.create({ name: "Alice", type: "donor" as never }),
      ).rejects.toThrow("Person type is required");
    });

    it("throws when name is empty", async () => {
      await expect(
        people.create({ type: "adopter", name: "" }),
      ).rejects.toThrow("Person name is required");
    });

    it("throws when name is whitespace only", async () => {
      await expect(
        people.create({ type: "adopter", name: "   " }),
      ).rejects.toThrow("Person name is required");
    });

    it("throws when payload is null", async () => {
      await expect(people.create(null as never)).rejects.toThrow(
        "Create payload is required",
      );
    });

    it("throws on API error response", async () => {
      requests.post.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      await expect(people.create(validInput)).rejects.toThrow(
        "Invalid API key",
      );
    });

    it("throws PawPlacerApiError with code and requestId on API error", async () => {
      requests.post.mockResolvedValue({
        error: "Forbidden",
        code: "forbidden",
        request_id: "req-3",
      });

      try {
        await people.create(validInput);
        expect.fail("Expected error");
      } catch (err) {
        expect(err).toBeInstanceOf(PawPlacerApiError);
        const apiErr = err as PawPlacerApiError;
        expect(apiErr.code).toBe("forbidden");
        expect(apiErr.requestId).toBe("req-3");
      }
    });

    it("throws validation error when API returns errors field", async () => {
      requests.post.mockResolvedValue({
        errors: [{ field: "email", message: "Invalid email" }],
      });

      await expect(people.create(validInput)).rejects.toThrow(
        "Validation failed",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getCustomFields
  // ---------------------------------------------------------------------------

  describe("getCustomFields", () => {
    it("calls GET api/people/custom-fields with type param and 15min cache", async () => {
      requests.get.mockResolvedValue({
        type: "adopter",
        custom_fields: [
          {
            field_key: "prev_pets",
            label: "Previous Pets",
            field_type: "text",
            required: false,
            placeholder: "Tell us about your pets",
            sync_to_column: null,
            template_id: "550e8400-e29b-41d4-a716-446655440010",
            section_id: "550e8400-e29b-41d4-a716-446655440011",
            section: "Experience",
            section_order: 2,
            field_order: 3,
            hidden: false,
            internal_only: true,
          },
        ],
      });

      const result = await people.getCustomFields("adopter");

      const [url, options] = requests.get.mock.calls[0] as [
        string,
        {
          searchParams: URLSearchParams;
          memoize: { key: string; refreshFrequencyMinutes: number };
        },
      ];
      expect(url).toBe("api/people/custom-fields");
      expect(options.searchParams.get("type")).toBe("adopter");
      expect(options.memoize.key).toBe("people:custom-fields:adopter");
      expect(options.memoize.refreshFrequencyMinutes).toBe(15);
      expect(result).toHaveLength(1);
      expect(result[0]!.field_key).toBe("prev_pets");
      expect(result[0]!.hidden).toBe(false);
      expect(result[0]!.internal_only).toBe(true);
      expect(result[0]!.section).toBe("Experience");
      expect(result[0]!.section_order).toBe(2);
      expect(result[0]!.field_order).toBe(3);
      expect(result[0]!.placeholder).toBe("Tell us about your pets");
    });

    it("uses distinct cache key per type", async () => {
      requests.get.mockResolvedValue({
        type: "foster",
        custom_fields: [],
      });

      await people.getCustomFields("foster");

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { memoize: { key: string } },
      ];
      expect(options.memoize.key).toBe("people:custom-fields:foster");
    });

    it("uses distinct cache key for surrender custom fields", async () => {
      requests.get.mockResolvedValue({
        type: "surrender",
        custom_fields: [],
      });

      await people.getCustomFields("surrender");

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; memoize: { key: string } },
      ];
      expect(options.searchParams.get("type")).toBe("surrender");
      expect(options.memoize.key).toBe("people:custom-fields:surrender");
    });

    it("uses distinct cache key for volunteer custom fields", async () => {
      requests.get.mockResolvedValue({
        type: "volunteer",
        custom_fields: [],
      });

      await people.getCustomFields("volunteer");

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; memoize: { key: string } },
      ];
      expect(options.searchParams.get("type")).toBe("volunteer");
      expect(options.memoize.key).toBe("people:custom-fields:volunteer");
    });

    it("throws when type is invalid", async () => {
      await expect(people.getCustomFields("donor" as never)).rejects.toThrow(
        "Person type is required",
      );
    });

    it("throws on API error response", async () => {
      requests.get.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      await expect(people.getCustomFields("adopter")).rejects.toThrow(
        "Invalid API key",
      );
    });

    it("throws when custom_fields is not an array", async () => {
      requests.get.mockResolvedValue({ type: "adopter", custom_fields: null });

      await expect(people.getCustomFields("adopter")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws when a custom field is missing required keys", async () => {
      requests.get.mockResolvedValue({
        type: "adopter",
        custom_fields: [{ field_key: "incomplete" }],
      });

      await expect(people.getCustomFields("adopter")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("returns empty array for empty custom_fields", async () => {
      requests.get.mockResolvedValue({ type: "adopter", custom_fields: [] });

      const result = await people.getCustomFields("adopter");
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // typed response fields
  // ---------------------------------------------------------------------------

  describe("typed response fields", () => {
    it("returns person with all expected fields from get", async () => {
      const full: Person = {
        id: "person-99",
        type: "adopter",
        name: "Full Person",
        email: "full@example.com",
        phone: "555-9999",
        address: "789 Oak St",
        status: "active",
        status_change_notes: "Notes here",
        custom_field_data: { foo: "bar" },
        tags: ["vip"],
        capacity: 5,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
      };
      requests.get.mockResolvedValue(full);

      const result = await people.get("person-99", "adopter");

      expect(result.type).toBe("adopter");
      expect(result.email).toBe("full@example.com");
      expect(result.capacity).toBe(5);
      expect(result.tags).toEqual(["vip"]);
      expect(result.custom_field_data).toEqual({ foo: "bar" });
      expect(result.status_change_notes).toBe("Notes here");
    });

    it("accepts null for nullable fields", async () => {
      requests.get.mockResolvedValue(mockAdopter);
      const result = await people.get("person-1", "adopter");
      expect(result.status_change_notes).toBeNull();
      expect(result.capacity).toBeNull();
    });

    it("rejects malformed application metadata in a person response", async () => {
      requests.get.mockResolvedValue({
        ...mockAdopter,
        application: {
          id: "application-1",
          pet_ids: "pet-1",
          submitted_at: "2026-08-11T12:00:00.000Z",
        },
      });

      await expect(people.get("person-1", "adopter")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });
});
