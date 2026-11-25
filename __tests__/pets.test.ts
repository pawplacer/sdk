import { describe, expect, it } from "vitest";

import { PawPlacerResponseValidationError } from "../src/errors";
import {
  MINIMAL_PET_INPUT,
  PET_ID,
  PET_ID_2,
  UUID_PATTERN,
  makePet,
  page,
  useStubServer,
} from "./helpers";

const stub = useStubServer();

describe("pets.list", () => {
  it("sends filters as query params and returns a page", async () => {
    stub.handler = () => ({
      body: page("pets", [makePet()], { total: 40, hasMore: true }),
    });

    const result = await stub.client().pets.list({
      status: "available",
      species: "dog",
      search: "  max  ",
      updated_since: "2026-01-01T00:00:00.000Z",
      limit: 12,
      offset: 24,
    });

    const { path, query } = stub.requests[0];
    expect(path).toBe("/api/pets");
    expect(Object.fromEntries(query)).toEqual({
      limit: "12",
      offset: "24",
      search: "max",
      species: "dog",
      status: "available",
      updated_since: "2026-01-01T00:00:00.000Z",
    });
    expect(result).toMatchObject({ total: 40, hasMore: true, limit: 20 });
    expect(result.data[0].name).toBe("Max");
  });

  it("omits blank filters", async () => {
    stub.handler = () => ({ body: page("pets", []) });

    await stub.client().pets.list({ search: "  ", status: undefined });

    expect([...stub.requests[0].query]).toEqual([]);
  });

  it("validates every pet in the response", async () => {
    stub.handler = () => ({
      body: page("pets", [makePet(), { ...makePet(), breed: "Lab" }]),
    });

    await expect(stub.client().pets.list()).rejects.toThrow(
      new PawPlacerResponseValidationError(
        "pets[1].breed must be string[]",
        undefined,
      ).message,
    );
  });

  it("accepts empty-string enum fields and optional extras", async () => {
    stub.handler = () => ({
      body: page("pets", [
        makePet({ species: "", size: "", health: "" }),
        { ...makePet(), hold_until: undefined, is_sample: undefined },
      ]),
    });

    const result = await stub.client().pets.list();

    expect(result.data).toHaveLength(2);
  });
});

describe("pets.listAll", () => {
  it("pages until hasMore is false", async () => {
    stub.handler = (req) => {
      const offset = Number(req.query.get("offset"));
      return {
        body: page("pets", offset === 0 ? [makePet(), makePet({ id: PET_ID_2 })] : [makePet({ id: "p3" })], {
          offset,
          limit: 2,
          total: 3,
          hasMore: offset === 0,
        }),
      };
    };

    const ids: string[] = [];
    for await (const pet of stub.client().pets.listAll({ status: "available", limit: 2 })) {
      ids.push(pet.id);
    }

    expect(ids).toEqual([PET_ID, PET_ID_2, "p3"]);
    expect(stub.requests.map((r) => r.query.get("offset"))).toEqual(["0", "2"]);
    expect(stub.requests[0].query.get("status")).toBe("available");
  });
});

describe("pets.get", () => {
  it("fetches by ID", async () => {
    stub.handler = () => ({ body: makePet() });

    const pet = await stub.client().pets.get(` ${PET_ID} `);

    expect(stub.requests[0].path).toBe(`/api/pets/${PET_ID}`);
    expect(pet.id).toBe(PET_ID);
  });

  it("rejects a blank ID without a request", async () => {
    const client = stub.client();
    await expect(client.pets.get("")).rejects.toThrow("Pet ID is required");
    await expect(client.pets.get("   ")).rejects.toThrow("Pet ID is required");
    expect(stub.requests).toHaveLength(0);
  });
});

describe("pets.create", () => {
  it("posts a trimmed payload with an automatic UUID idempotency key", async () => {
    stub.handler = () => ({ status: 201, body: makePet() });

    const pet = await stub.client().pets.create({
      ...MINIMAL_PET_INPUT,
      name: "  Max  ",
      breed: [" Lab ", " "],
      adoption_fee: 250,
      description: "",
      spayed: false,
      custom_field_data: { has_yard: true },
    });

    const req = stub.requests[0];
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/api/pets");
    expect(req.headers["idempotency-key"]).toMatch(UUID_PATTERN);
    expect(req.body).toEqual({
      ...MINIMAL_PET_INPUT,
      name: "Max",
      breed: ["Lab"],
      adoption_fee: "250",
      spayed: false,
      custom_field_data: { has_yard: true },
    });
    expect(pet.id).toBe(PET_ID);
  });

  it("sends a caller-provided idempotency key", async () => {
    stub.handler = () => ({ status: 201, body: makePet() });

    await stub
      .client()
      .pets.create(MINIMAL_PET_INPUT, { idempotencyKey: "sync:ext-1" });

    expect(stub.requests[0].headers["idempotency-key"]).toBe("sync:ext-1");
  });

  it("does not require health", async () => {
    stub.handler = () => ({ status: 201, body: makePet() });

    await stub.client().pets.create(MINIMAL_PET_INPUT);

    expect(stub.requests[0].body).not.toHaveProperty("health");
  });

  it.each([
    ["name", "Pet name is required"],
    ["species", "Pet species is required: e.g. dog, cat, or rabbit"],
    ["age_category", "Pet age_category is required"],
    ["sex", "Pet sex is required"],
    ["size", "Pet size is required"],
    ["status", "Pet status is required"],
  ])("requires %s", async (field, message) => {
    const input = { ...MINIMAL_PET_INPUT, [field]: " " };
    await expect(stub.client().pets.create(input as never)).rejects.toThrow(message);
    expect(stub.requests).toHaveLength(0);
  });

  it.each([
    [{ breed: "Lab" }, "Pet breed must be an array of strings"],
    [{ breed: ["Lab", 1] }, "Pet breed must be an array of strings"],
    [{ description: 5 }, "Pet description must be a string"],
    [{ adoption_fee: Number.NaN }, "Pet adoption_fee must be a finite number or string"],
    [{ custom_field_data: [] }, "Pet custom_field_data must be an object"],
    [{ spayed: "yes" }, "Pet spayed must be a boolean"],
  ])("rejects malformed field %o", async (fields, message) => {
    await expect(
      stub.client().pets.create({ ...MINIMAL_PET_INPUT, ...fields } as never),
    ).rejects.toThrow(message);
  });

  it("rejects a non-object payload", async () => {
    await expect(stub.client().pets.create(null as never)).rejects.toThrow(
      "Pet create payload must be an object",
    );
  });
});

describe("pets.update", () => {
  it("patches only the given fields, URL-encoding the identifier", async () => {
    stub.handler = () => ({ body: makePet() });

    await stub.client().pets.update("DOG 2026/001", { description: " New bio " });

    const req = stub.requests[0];
    expect(req.method).toBe("PATCH");
    expect(req.path).toBe("/api/pets/DOG%202026%2F001");
    expect(req.body).toEqual({ description: "New bio" });
    expect(req.headers["idempotency-key"]).toMatch(UUID_PATTERN);
  });

  it("sends empty arrays and empty strings so fields can be cleared", async () => {
    stub.handler = () => ({ body: makePet() });

    await stub.client().pets.update(PET_ID, {
      image_urls: [],
      special_needs: [],
      description: "",
      intake_date: "  ",
      adoption_fee: "",
    });

    expect(stub.requests[0].body).toEqual({
      image_urls: [],
      special_needs: [],
      description: "",
      intake_date: "",
      adoption_fee: "",
    });
  });

  it("rejects an empty update", async () => {
    await expect(stub.client().pets.update(PET_ID, {})).rejects.toThrow(
      "Pet update payload must include at least one field",
    );
    await expect(
      stub.client().pets.update(PET_ID, { description: undefined }),
    ).rejects.toThrow("at least one field");
    expect(stub.requests).toHaveLength(0);
  });

  it("drops the cached detail for the returned pet", async () => {
    let description = "old";
    stub.handler = (req) => {
      if (req.method === "PATCH") description = "new";
      return {
        body: makePet({ description }),
        headers: { "cache-control": req.method === "GET" ? "max-age=60" : "no-store" },
      };
    };
    const client = stub.client();

    await client.pets.get(PET_ID);
    await client.pets.update("custom-1", { description: "new" });
    const pet = await client.pets.get(PET_ID);

    expect(pet.description).toBe("new");
    expect(stub.requests.map((r) => r.method)).toEqual(["GET", "PATCH", "GET"]);
  });
});

describe("pets.getCustomFields", () => {
  it("returns the field definitions", async () => {
    stub.handler = () => ({
      body: {
        custom_fields: [
          {
            field_key: "has_yard",
            label: "Has yard",
            field_type: "boolean",
            required: false,
            help_text: null,
            section_order: 1,
            hidden: false,
          },
        ],
      },
    });

    const fields = await stub.client().pets.getCustomFields();

    expect(stub.requests[0].path).toBe("/api/pets/custom-fields");
    expect(fields.map((f) => f.field_key)).toEqual(["has_yard"]);
  });

  it("rejects a malformed field definition", async () => {
    stub.handler = () => ({
      body: { custom_fields: [{ field_key: "x", label: "X", field_type: "text" }] },
    });

    await expect(stub.client().pets.getCustomFields()).rejects.toThrow(
      "custom_fields[0].required must be boolean",
    );
  });
});
