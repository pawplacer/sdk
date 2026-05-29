import { beforeEach, describe, expect, it } from "vitest";

import {
  PawPlacerApiError,
  PawPlacerResponseValidationError,
} from "../src/errors";
import { PetsApi } from "../src/resources/pets";
import type { RequestManager } from "../src/request-manager";
import type { Pet } from "../src/types";
import { createMockRequestManager } from "./test-utils";

const mockPet: Pet = {
  id: "pet-1",
  name: "Buddy",
  species: "dog",
  age_category: "young",
  sex: "male",
  size: "medium",
  status: "available",
  health: "good",
  breed: ["Labrador"],
  color: ["Black"],
  age_years: null,
  age_months: null,
  age_birthday: null,
  description: "Friendly dog",
  spayed: true,
  adoption_fee: "250",
  microchip_id: null,
  good_with: ["families"],
  bad_with: [],
  temperaments: ["playful"],
  image_urls: ["https://example.com/buddy.jpg"],
  image_url: "https://example.com/buddy.jpg",
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
  adopted_on: null,
  adopted_by: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function createPetResponse(overrides: Partial<Pet> = {}): Pet {
  return {
    ...mockPet,
    ...overrides,
  };
}

describe("PetsApi", () => {
  let requests: ReturnType<typeof createMockRequestManager>;
  let pets: PetsApi;

  beforeEach(() => {
    requests = createMockRequestManager();
    pets = new PetsApi(requests as unknown as RequestManager);
  });

  describe("list", () => {
    it("calls GET api/pets with cache key", async () => {
      requests.get.mockResolvedValue({
        pets: [mockPet],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const result = await pets.list();

      expect(requests.get).toHaveBeenCalledWith("api/pets", {
        searchParams: expect.any(URLSearchParams),
        memoize: { key: "pets:list:" },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe("Buddy");
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it("uses API hasMore value instead of recomputing", async () => {
      requests.get.mockResolvedValue({
        pets: [mockPet],
        total: 50,
        limit: 20,
        offset: 0,
        hasMore: true,
      });

      const result = await pets.list({ limit: 20 });
      expect(result.hasMore).toBe(true);
    });

    it("passes query params as URLSearchParams", async () => {
      requests.get.mockResolvedValue({
        pets: [],
        total: 0,
        limit: 10,
        offset: 5,
        hasMore: false,
      });

      await pets.list({
        limit: 10,
        offset: 5,
        species: "dog",
        status: "available",
        search: "buddy",
        updated_since: "2026-01-01T00:00:00.000Z",
      });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      const params = options.searchParams;
      expect(params.get("limit")).toBe("10");
      expect(params.get("offset")).toBe("5");
      expect(params.get("species")).toBe("dog");
      expect(params.get("status")).toBe("available");
      expect(params.get("search")).toBe("buddy");
      expect(params.get("updated_since")).toBe("2026-01-01T00:00:00.000Z");
    });

    it("trims empty string params", async () => {
      requests.get.mockResolvedValue({
        pets: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      await pets.list({ species: "  ", search: "  " });

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      expect(options.searchParams.has("species")).toBe(false);
      expect(options.searchParams.has("search")).toBe(false);
    });

    it("throws when API returns error response", async () => {
      requests.get.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      await expect(pets.list()).rejects.toThrow("Invalid API key");
    });

    it("throws when API returns rate limit error", async () => {
      requests.get.mockResolvedValue({
        error: "rate limited",
        code: "rate_limited",
        request_id: "req-1",
      });

      await expect(pets.list()).rejects.toThrow("rate limited");
    });

    it("throws when list response shape is invalid", async () => {
      requests.get.mockResolvedValue({
        pets: [{}],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      await expect(pets.list()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });

  describe("get / getById", () => {
    it("calls GET api/pets/:id with cache key", async () => {
      requests.get.mockResolvedValue(mockPet);

      const result = await pets.get("pet-1");

      expect(requests.get).toHaveBeenCalledWith("api/pets/pet-1", {
        memoize: {
          key: "pets:get:pet-1",
          staleWhileRevalidateMs: 30 * 60 * 1000,
          forceRefresh: undefined,
        },
      });
      expect(result.name).toBe("Buddy");
    });

    it("getById delegates to get", async () => {
      requests.get.mockResolvedValue(mockPet);

      const result = await pets.getById("pet-1");
      expect(result.name).toBe("Buddy");
    });

    it("throws when id is empty", async () => {
      await expect(pets.get("")).rejects.toThrow(
        "Pet ID is required and must be a string",
      );
    });

    it("throws when id is whitespace only", async () => {
      await expect(pets.get("   ")).rejects.toThrow(
        "Pet ID is required and must be a non-empty string",
      );
    });

    it("trims id before using", async () => {
      requests.get.mockResolvedValue(mockPet);

      await pets.get("  pet-1  ");

      expect(requests.get).toHaveBeenCalledWith(
        "api/pets/pet-1",
        expect.anything(),
      );
    });

    it("supports forceRefresh option", async () => {
      requests.get.mockResolvedValue(mockPet);

      await pets.get("pet-1", { forceRefresh: true });

      expect(requests.get).toHaveBeenCalledWith(
        "api/pets/pet-1",
        expect.objectContaining({
          memoize: expect.objectContaining({ forceRefresh: true }),
        }),
      );
    });

    it("throws on API error response", async () => {
      requests.get.mockResolvedValue({
        error: "Pet not found",
        code: "pet_not_found",
        request_id: "req-1",
      });

      await expect(pets.get("nonexistent")).rejects.toThrow("Pet not found");
    });

    it("throws when pet response shape is invalid", async () => {
      requests.get.mockResolvedValue({
        id: "pet-1",
        name: "Buddy",
      });

      await expect(pets.get("pet-1")).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });

  describe("create", () => {
    const validInput = {
      name: "Max",
      species: "dog" as const,
      age_category: "young" as const,
      sex: "male" as const,
      size: "medium" as const,
      status: "available",
      health: "good" as const,
    };

    it("sends POST to api/pets with normalized payload", async () => {
      requests.post.mockResolvedValue(
        createPetResponse({ id: "new-pet", ...validInput }),
      );

      const result = await pets.create(validInput);

      expect(requests.post).toHaveBeenCalledWith("api/pets", {
        json: expect.objectContaining({
          name: "Max",
          species: "dog",
          status: "available",
        }),
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
        }),
        retry: { methods: ["post"] },
      });
      expect(result.name).toBe("Max");
    });

    it("sends caller-provided Idempotency-Key header and enables POST retry", async () => {
      requests.post.mockResolvedValue(
        createPetResponse({ id: "new-pet", ...validInput }),
      );

      await pets.create(validInput, { idempotencyKey: "my-key-123" });

      expect(requests.post).toHaveBeenCalledWith("api/pets", {
        json: expect.any(Object),
        headers: { "Idempotency-Key": "my-key-123" },
        retry: { methods: ["post"] },
      });
    });

    it("allows disabling automatic idempotency headers and POST retry", async () => {
      requests.post.mockResolvedValue(
        createPetResponse({ id: "new-pet", ...validInput }),
      );

      await pets.create(validInput, { idempotencyKey: false });

      expect(requests.post).toHaveBeenCalledWith("api/pets", {
        json: expect.any(Object),
        headers: {},
      });
    });

    it("invalidates list cache after successful create", async () => {
      requests.post.mockResolvedValue(
        createPetResponse({ id: "new-pet", ...validInput }),
      );

      await pets.create(validInput);

      expect(requests.invalidateMatching).toHaveBeenCalledWith("pets:list:");
    });

    it("throws when name is missing", async () => {
      await expect(pets.create({ ...validInput, name: "" })).rejects.toThrow(
        "Pet name is required",
      );
    });

    it("throws when species is missing", async () => {
      await expect(
        pets.create({ ...validInput, species: "" as never }),
      ).rejects.toThrow("Pet species is required");
    });

    it("throws when payload is null", async () => {
      await expect(pets.create(null as never)).rejects.toThrow(
        "Create payload is required",
      );
    });

    it("normalizes breeds alias to breed", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        breeds: ["Labrador", "Poodle"],
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.breed).toEqual(["Labrador", "Poodle"]);
      expect(options.json).not.toHaveProperty("breeds");
    });

    it("normalizes colors alias to color", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        colors: ["Black", "White"],
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.color).toEqual(["Black", "White"]);
    });

    it("converts numeric adoption_fee to string", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        adoption_fee: 250,
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.adoption_fee).toBe("250");
    });

    it("trims string adoption_fee values", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        adoption_fee: "  250  ",
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.adoption_fee).toBe("250");
    });

    it("throws a clear error for invalid adoption_fee values", async () => {
      await expect(
        pets.create({
          ...validInput,
          adoption_fee: Number.NaN,
        }),
      ).rejects.toThrow("Pet adoption_fee must be a finite number or string");

      await expect(
        pets.create({
          ...validInput,
          adoption_fee: { amount: 250 } as never,
        }),
      ).rejects.toThrow("Pet adoption_fee must be a finite number or string");
    });

    it("normalizes is_published alias to show_public", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        is_published: true,
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.show_public).toBe(true);
    });

    it("trims string fields in payload", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        name: "  Max  ",
        description: "  A good dog  ",
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.name).toBe("Max");
      expect(options.json.description).toBe("A good dog");
    });

    it("omits empty string optional fields", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        description: "",
        microchip_id: "  ",
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json).not.toHaveProperty("description");
      expect(options.json).not.toHaveProperty("microchip_id");
    });

    it("throws a clear error for invalid string arrays", async () => {
      await expect(
        pets.create({
          ...validInput,
          breed: ["Labrador", 42] as never,
        }),
      ).rejects.toThrow("Pet breed must be an array of strings");
    });

    it("throws a clear error for invalid custom_field_data", async () => {
      await expect(
        pets.create({
          ...validInput,
          custom_field_data: ["not", "an", "object"] as never,
        }),
      ).rejects.toThrow("Pet custom_field_data must be an object");
    });

    it("throws on API validation error", async () => {
      requests.post.mockResolvedValue({
        errors: [{ field: "status", message: "Invalid status" }],
      });

      await expect(pets.create(validInput)).rejects.toThrow(
        "Validation failed",
      );
    });

    it("throws PawPlacerApiError with code and requestId", async () => {
      requests.post.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      try {
        await pets.create(validInput);
        expect.fail("Expected error");
      } catch (err) {
        expect(err).toBeInstanceOf(PawPlacerApiError);
        const apiErr = err as PawPlacerApiError;
        expect(apiErr.code).toBe("invalid_api_key");
        expect(apiErr.requestId).toBe("req-1");
        expect(apiErr.message).toBe("Invalid API key");
        expect(apiErr.apiError).toMatchObject({
          message: "Invalid API key",
          error: "Invalid API key",
        });
      }
    });

    it("passes custom_status_id through to payload", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        custom_status_id: "cust-status-123",
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.custom_status_id).toBe("cust-status-123");
    });

    it("passes legacy intake metadata fields through to payload", async () => {
      requests.post.mockResolvedValue(createPetResponse({ id: "new-pet" }));

      await pets.create({
        ...validInput,
        location_found: "  Austin, TX  ",
        reason_for_surrender: "  Owner relocation  ",
      });

      const [, options] = requests.post.mock.calls[0] as [
        string,
        { json: Record<string, unknown> },
      ];
      expect(options.json.location_found).toBe("Austin, TX");
      expect(options.json.reason_for_surrender).toBe("Owner relocation");
    });
  });

  describe("findMany", () => {
    it("delegates to list and returns data array", async () => {
      requests.get.mockResolvedValue({
        pets: [mockPet],
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
      });

      const result = await pets.findMany({ species: "dog" });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Buddy");
    });

    it("applies default limit of 10", async () => {
      requests.get.mockResolvedValue({
        pets: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
      });

      await pets.findMany();

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      expect(options.searchParams.get("limit")).toBe("10");
    });

    it("respects custom limit override", async () => {
      requests.get.mockResolvedValue({
        pets: [],
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      });

      await pets.findMany(undefined, 50);

      const [, options] = requests.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams },
      ];
      expect(options.searchParams.get("limit")).toBe("50");
    });
  });

  describe("search", () => {
    it("delegates to list with search param", async () => {
      requests.get.mockResolvedValue({
        pets: [mockPet],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const result = await pets.search("buddy");
      expect(result).toHaveLength(1);
    });

    it("throws when query is empty", async () => {
      await expect(pets.search("")).rejects.toThrow("Search query is required");
    });

    it("throws when query is whitespace", async () => {
      await expect(pets.search("   ")).rejects.toThrow(
        "Search query is required",
      );
    });
  });

  describe("getByStatus", () => {
    it("delegates to list with status param", async () => {
      requests.get.mockResolvedValue({
        pets: [mockPet],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const result = await pets.getByStatus("available");
      expect(result).toHaveLength(1);
    });

    it("throws when status is empty", async () => {
      await expect(pets.getByStatus("")).rejects.toThrow("Status is required");
    });
  });

  describe("getCustomFields", () => {
    it("calls GET api/pets/custom-fields with 15min cache", async () => {
      requests.get.mockResolvedValue({
        custom_fields: [
          {
            field_key: "fav_toy",
            label: "Favorite Toy",
            field_type: "text",
            required: false,
            hidden: true,
            internal_only: false,
          },
        ],
      });

      const result = await pets.getCustomFields();

      expect(requests.get).toHaveBeenCalledWith("api/pets/custom-fields", {
        memoize: {
          key: "pets:custom-fields",
          refreshFrequencyMinutes: 15,
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.field_key).toBe("fav_toy");
      expect(result[0]!.hidden).toBe(true);
      expect(result[0]!.internal_only).toBe(false);
    });

    it("throws when custom field visibility flags have invalid types", async () => {
      requests.get.mockResolvedValue({
        custom_fields: [
          {
            field_key: "fav_toy",
            label: "Favorite Toy",
            field_type: "text",
            required: false,
            hidden: "yes",
          },
        ],
      });

      await expect(pets.getCustomFields()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("returns empty array when custom_fields is null", async () => {
      requests.get.mockResolvedValue({ custom_fields: null });

      await expect(pets.getCustomFields()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });

    it("throws on API error response", async () => {
      requests.get.mockResolvedValue({
        error: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req-1",
      });

      await expect(pets.getCustomFields()).rejects.toThrow("Invalid API key");
    });

    it("throws when custom field response shape is invalid", async () => {
      requests.get.mockResolvedValue({
        custom_fields: [
          {
            field_key: "fav_toy",
          },
        ],
      });

      await expect(pets.getCustomFields()).rejects.toThrow(
        PawPlacerResponseValidationError,
      );
    });
  });

  describe("typed response fields", () => {
    it("returns pet with typed enum fields from get", async () => {
      requests.get.mockResolvedValue(mockPet);

      const result = await pets.get("pet-1");

      // These assertions verify the typed fields match expected enum values
      expect(result.species).toBe("dog");
      expect(result.status).toBe("available");
      expect(result.sex).toBe("male");
      expect(result.size).toBe("medium");
      expect(result.health).toBe("good");
      expect(result.age_category).toBe("young");
      expect(result.good_with).toEqual(["families"]);
      expect(result.temperaments).toEqual(["playful"]);
    });
  });
});
