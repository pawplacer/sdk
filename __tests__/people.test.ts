import { describe, expect, it } from "vitest";

import type { PersonCreateInput } from "../src/types";
import {
  MINIMAL_PET_INPUT,
  PET_ID,
  PET_ID_2,
  UUID_PATTERN,
  makePerson,
  makePet,
  page,
  useStubServer,
} from "./helpers";

const stub = useStubServer();

const APPLICATION_KEY = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";

describe("people.list", () => {
  it.each(["adopter", "foster", "surrender", "volunteer"] as const)(
    "lists %s records",
    async (type) => {
      stub.handler = () => ({
        body: { type, ...page("people", [makePerson({ type })]) },
      });

      const result = await stub.client().people.list({ type, status: "active" });

      expect(stub.requests[0].path).toBe("/api/people");
      expect(Object.fromEntries(stub.requests[0].query)).toEqual({
        status: "active",
        type,
      });
      expect(result.type).toBe(type);
      expect(result.data[0].type).toBe(type);
    },
  );

  it("requires a valid type", async () => {
    const client = stub.client();
    await expect(client.people.list({} as never)).rejects.toThrow(
      "Person type is required",
    );
    await expect(client.people.list({ type: "donor" } as never)).rejects.toThrow(
      "Must be one of: adopter, foster, surrender, volunteer",
    );
    expect(stub.requests).toHaveLength(0);
  });

  it("accepts volunteer-only arrays and rejects malformed people", async () => {
    stub.handler = () => ({
      body: {
        type: "volunteer",
        ...page("people", [
          makePerson({ type: "volunteer", skills: ["dog walking"], languages: [] }),
        ]),
      },
    });
    const result = await stub.client().people.list({ type: "volunteer" });
    expect(result.data[0].skills).toEqual(["dog walking"]);

    stub.handler = () => ({
      body: { type: "adopter", ...page("people", [{ ...makePerson(), tags: null }]) },
    });
    await expect(
      stub.client().people.list({ type: "adopter" }),
    ).rejects.toThrow("people[0].tags must be string[]");
  });
});

describe("people.listAll", () => {
  it("pages until hasMore is false", async () => {
    stub.handler = (req) => {
      const offset = Number(req.query.get("offset"));
      return {
        body: {
          type: "foster",
          ...page("people", [makePerson({ id: `p${offset}`, type: "foster" })], {
            offset,
            hasMore: offset < 2,
          }),
        },
      };
    };

    const ids: string[] = [];
    for await (const person of stub.client().people.listAll({ type: "foster", limit: 1 })) {
      ids.push(person.id);
    }

    expect(ids).toEqual(["p0", "p1", "p2"]);
  });
});

describe("people.get", () => {
  it("fetches by ID with the type as a query param", async () => {
    stub.handler = () => ({ body: makePerson({ type: "foster", capacity: 3 }) });

    const person = await stub.client().people.get("person-1", "foster");

    expect(stub.requests[0].path).toBe("/api/people/person-1");
    expect(stub.requests[0].query.get("type")).toBe("foster");
    expect(person.capacity).toBe(3);
  });

  it("caches per type and ID", async () => {
    stub.handler = (req) => ({
      body: makePerson({ type: req.query.get("type") as never }),
      headers: { "cache-control": "max-age=60" },
    });
    const client = stub.client();

    await client.people.get("person-1", "adopter");
    await client.people.get("person-1", "adopter");
    await client.people.get("person-1", "foster");

    expect(stub.requests).toHaveLength(2);
  });

  it("validates the ID and type", async () => {
    const client = stub.client();
    await expect(client.people.get(" ", "adopter")).rejects.toThrow(
      "Person ID is required",
    );
    await expect(client.people.get("person-1", "x" as never)).rejects.toThrow(
      "Person type is required",
    );
  });
});

describe("people.create", () => {
  it("posts the person with type in body and query, and an idempotency key", async () => {
    stub.handler = () => ({ status: 201, body: makePerson() });

    await stub.client().people.create({
      type: "adopter",
      name: "  Jane Smith ",
      email: "jane@example.com",
      phone: null,
      status: "active",
      custom_field_data: { has_yard: true },
    });

    const req = stub.requests[0];
    expect(req.method).toBe("POST");
    expect(req.query.get("type")).toBe("adopter");
    expect(req.headers["idempotency-key"]).toMatch(UUID_PATTERN);
    expect(req.body).toEqual({
      type: "adopter",
      name: "Jane Smith",
      email: "jane@example.com",
      status: "active",
      custom_field_data: { has_yard: true },
    });
  });

  it("sends volunteer fields", async () => {
    stub.handler = () => ({ status: 201, body: makePerson({ type: "volunteer" }) });

    await stub.client().people.create({
      type: "volunteer",
      name: "Val",
      skills: ["dog walking"],
      languages: ["en", "es"],
    });

    expect(stub.requests[0].body).toMatchObject({
      skills: ["dog walking"],
      languages: ["en", "es"],
    });
  });

  it.each<[Partial<PersonCreateInput>, string]>([
    [{ type: undefined }, "Person type is required"],
    [{ name: "  " }, "Person name is required"],
    [{ email: 5 as never }, "Person email must be a string"],
    [{ custom_field_data: "x" as never }, "Person custom_field_data must be an object"],
    [{ capacity: Number.POSITIVE_INFINITY }, "Person capacity must be a finite number"],
  ])("rejects %o", async (fields, message) => {
    await expect(
      stub.client().people.create({ type: "adopter", name: "Jane", ...fields } as never),
    ).rejects.toThrow(message);
    expect(stub.requests).toHaveLength(0);
  });

  it("drops cached people lists after a create", async () => {
    stub.handler = (req) =>
      req.method === "POST"
        ? { status: 201, body: makePerson() }
        : {
            body: { type: "adopter", ...page("people", []) },
            headers: { "cache-control": "max-age=60" },
          };
    const client = stub.client();

    await client.people.list({ type: "adopter" });
    await client.people.create({ type: "adopter", name: "Jane" });
    await client.people.list({ type: "adopter" });

    expect(stub.requests).toHaveLength(3);
  });

  describe("applications", () => {
    const application = { pet_ids: [PET_ID], terms_accepted: true } as const;

    it("submits an adopter application", async () => {
      stub.handler = () => ({
        status: 201,
        body: makePerson({
          status: "pending",
          application: { id: "app-1", pet_ids: [PET_ID], submitted_at: "2026-01-01" },
        }),
      });

      const person = await stub.client().people.create(
        {
          type: "adopter",
          name: "Jane",
          application: { ...application, template_id: "tpl-1", external_user_id: "u-1" },
        },
        { idempotencyKey: APPLICATION_KEY },
      );

      expect(stub.requests[0].body).toMatchObject({
        application: {
          pet_ids: [PET_ID],
          terms_accepted: true,
          template_id: "tpl-1",
          external_user_id: "u-1",
        },
      });
      expect(stub.requests[0].headers["idempotency-key"]).toBe(APPLICATION_KEY);
      expect(person.application?.id).toBe("app-1");
    });

    it.each<[Record<string, unknown>, string]>([
      [{ pet_ids: "x" }, "pet_ids must be an array of UUIDs"],
      [{ pet_ids: ["not-a-uuid"] }, "pet_ids must be an array of UUIDs"],
      [{ pet_ids: [] }, "at least one pet_id"],
      [{ pet_ids: [PET_ID, PET_ID] }, "pet_ids must be unique"],
      [
        { pet_ids: Array.from({ length: 6 }, (_, i) => PET_ID.replace(/1$/, String(i))) },
        "more than 5 pet_ids",
      ],
      [{ terms_accepted: false }, "terms_accepted must be true"],
    ])("rejects application %o", async (overrides, message) => {
      await expect(
        stub.client().people.create({
          type: "adopter",
          name: "Jane",
          application: { ...application, ...overrides } as never,
        }),
      ).rejects.toThrow(message);
      expect(stub.requests).toHaveLength(0);
    });

    it("only allows applications for adopters and fosters", async () => {
      await expect(
        stub.client().people.create({ type: "volunteer", name: "Val", application }),
      ).rejects.toThrow('only be provided when type is "adopter" or "foster"');
    });

    it("requires a UUID idempotency key", async () => {
      const client = stub.client();
      const input = { type: "foster", name: "Bob", application } as const;
      await expect(client.people.create(input, { idempotencyKey: false })).rejects.toThrow(
        "require an idempotency key",
      );
      await expect(client.people.create(input, { idempotencyKey: "job-1" })).rejects.toThrow(
        "idempotencyKey must be a UUID",
      );
    });
  });

  describe("surrenders", () => {
    it("creates new pets first, then links them with existing ones", async () => {
      stub.handler = (req) =>
        req.path === "/api/pets"
          ? { status: 201, body: makePet({ id: PET_ID_2 }) }
          : { status: 201, body: makePerson({ type: "surrender" }) };

      await stub.client().people.create(
        {
          type: "surrender",
          name: "Sam",
          pets: [
            { create: MINIMAL_PET_INPUT, reason: " Moving ", urgency: "high" },
            { pet_id: PET_ID, notes: "Existing profile" },
          ],
        },
        { idempotencyKey: "intake-7" },
      );

      const [petCreate, personCreate] = stub.requests;
      expect(petCreate.path).toBe("/api/pets");
      expect(petCreate.headers["idempotency-key"]).toBe("intake-7:pet:0");
      expect(personCreate.headers["idempotency-key"]).toBe("intake-7");
      expect(personCreate.body).toMatchObject({
        pets: [
          { pet_id: PET_ID_2, reason: "Moving", urgency: "high" },
          { pet_id: PET_ID, notes: "Existing profile" },
        ],
      });
    });

    it("validates every link before creating any pet", async () => {
      await expect(
        stub.client().people.create({
          type: "surrender",
          name: "Sam",
          pets: [{ create: MINIMAL_PET_INPUT }, { reason: "no pet" }],
        }),
      ).rejects.toThrow("Surrender pet at index 1 must include pet_id or create");
      expect(stub.requests).toHaveLength(0);
    });

    it.each<[unknown, string]>([
      [[], "Surrender pets must be a non-empty array"],
      [[{ pet_id: PET_ID, create: MINIMAL_PET_INPUT }], "cannot include both pet_id and create"],
      [[{ pet_id: PET_ID, custom_data: [] }], "Surrender pet at index 0 custom_data must be an object"],
      [["x"], "Surrender pet at index 0 must be an object"],
    ])("rejects pets %o", async (pets, message) => {
      await expect(
        stub.client().people.create({ type: "surrender", name: "Sam", pets: pets as never }),
      ).rejects.toThrow(message);
    });

    it("rejects pets on other types and alongside an application", async () => {
      const client = stub.client();
      await expect(
        client.people.create({ type: "adopter", name: "Jane", pets: [{ pet_id: PET_ID }] }),
      ).rejects.toThrow('only be provided when type is "surrender"');
      await expect(
        client.people.create({
          type: "adopter",
          name: "Jane",
          pets: [{ pet_id: PET_ID }],
          application: { pet_ids: [PET_ID], terms_accepted: true },
        }),
      ).rejects.toThrow("cannot be provided together");
      expect(stub.requests).toHaveLength(0);
    });
  });
});

describe("people.getCustomFields", () => {
  it("fetches fields for a type", async () => {
    stub.handler = () => ({
      body: {
        type: "volunteer",
        custom_fields: [
          { field_key: "shift", label: "Shift", field_type: "select", required: true },
        ],
      },
    });

    const fields = await stub.client().people.getCustomFields("volunteer");

    expect(stub.requests[0].path).toBe("/api/people/custom-fields");
    expect(stub.requests[0].query.get("type")).toBe("volunteer");
    expect(fields[0].field_key).toBe("shift");
  });
});
