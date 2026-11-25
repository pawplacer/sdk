import {
  assignDefined,
  buildSearchParams,
  isRecord,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requireId,
  requireString,
} from "../internal";
import type { RequestManager } from "../request-manager";
import {
  type CustomField,
  PERSON_TYPES,
  type Person,
  type PersonApplicationCreateInput,
  type PersonCreateInput,
  type PersonListParams,
  type PersonListResponse,
  type PersonType,
  type SurrenderPetCreateInput,
  type WriteOptions,
} from "../types";
import {
  validatePerson,
  validatePersonCustomFieldsResponse,
  validatePersonListResponse,
} from "../validation";
import type { PetsApi } from "./pets";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_APPLICATION_PETS = 5;

function assertPersonType(type: unknown): asserts type is PersonType {
  if (!PERSON_TYPES.includes(type as PersonType)) {
    throw new Error(
      `Person type is required. Must be one of: ${PERSON_TYPES.join(", ")}.`,
    );
  }
}

function normalizeApplication(
  application: PersonApplicationCreateInput,
  type: PersonType,
  options: WriteOptions | undefined,
): Record<string, unknown> {
  if (!isRecord(application)) {
    throw new Error("Person application must be an object");
  }
  if (type !== "adopter" && type !== "foster") {
    throw new Error(
      'Person application can only be provided when type is "adopter" or "foster"',
    );
  }
  const petIds = Array.isArray(application.pet_ids)
    ? application.pet_ids.map((id) => (typeof id === "string" ? id.trim() : ""))
    : null;
  if (!petIds || petIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error("Person application pet_ids must be an array of UUIDs");
  }
  if (petIds.length === 0) {
    throw new Error("Person application must include at least one pet_id");
  }
  if (petIds.length > MAX_APPLICATION_PETS) {
    throw new Error(
      `Person application cannot include more than ${MAX_APPLICATION_PETS} pet_ids`,
    );
  }
  if (new Set(petIds).size !== petIds.length) {
    throw new Error("Person application pet_ids must be unique");
  }
  if (application.terms_accepted !== true) {
    throw new Error("Person application terms_accepted must be true");
  }
  // The API stores applications under a UUID idempotency key.
  const key = options?.idempotencyKey;
  if (key === false) {
    throw new Error("Person applications require an idempotency key");
  }
  if (typeof key === "string" && !UUID_PATTERN.test(key)) {
    throw new Error("Person application idempotencyKey must be a UUID");
  }
  const result: Record<string, unknown> = {
    pet_ids: petIds,
    terms_accepted: true,
  };
  assignDefined(result, {
    template_id: optionalString(
      application.template_id,
      "Person application",
      "template_id",
    ),
    external_user_id: optionalString(
      application.external_user_id,
      "Person application",
      "external_user_id",
    ),
  });
  return result;
}

function normalizeSurrenderPet(
  item: SurrenderPetCreateInput,
  index: number,
): Record<string, unknown> {
  const label = `Surrender pet at index ${index}`;
  if (!isRecord(item)) {
    throw new Error(`${label} must be an object`);
  }
  const link: Record<string, unknown> = {};
  assignDefined(link, {
    pet_id: optionalString(item.pet_id, label, "pet_id"),
    reason: optionalString(item.reason, label, "reason"),
    urgency: optionalString(item.urgency, label, "urgency"),
    notes: optionalString(item.notes, label, "notes"),
    custom_data: optionalRecord(item.custom_data, label, "custom_data"),
  });
  if (!link.pet_id && item.create == null) {
    throw new Error(`${label} must include pet_id or create`);
  }
  if (link.pet_id && item.create != null) {
    throw new Error(`${label} cannot include both pet_id and create`);
  }
  return link;
}

/**
 * Validates every surrender pet link first, then creates any new pets, so a
 * bad entry fails before anything is written.
 */
async function resolveSurrenderPets(
  pets: SurrenderPetCreateInput[],
  petsApi: Pick<PetsApi, "create"> | undefined,
  options: WriteOptions | undefined,
): Promise<Record<string, unknown>[]> {
  if (!Array.isArray(pets) || pets.length === 0) {
    throw new Error("Surrender pets must be a non-empty array");
  }
  const links = pets.map(normalizeSurrenderPet);
  if (pets.some((item) => item.create != null) && !petsApi) {
    throw new Error("Creating surrender pets requires a PetsApi instance");
  }
  for (const [index, item] of pets.entries()) {
    if (item.create == null || !petsApi) continue;
    const pet = await petsApi.create(item.create, {
      ...options,
      // Derive a per-pet key so replaying the surrender replays each pet create.
      idempotencyKey:
        typeof options?.idempotencyKey === "string"
          ? `${options.idempotencyKey}:pet:${index}`
          : options?.idempotencyKey,
    });
    links[index].pet_id = pet.id;
  }
  return links;
}

export class PeopleApi {
  constructor(
    private requests: RequestManager,
    private petsApi?: Pick<PetsApi, "create">,
  ) {}

  /** List adopters, fosters, surrenders, or volunteers. `type` is required. */
  async list(params: PersonListParams): Promise<PersonListResponse> {
    assertPersonType(params?.type);
    const searchParams = buildSearchParams(params);
    const response = await this.requests.get("api/people", {
      searchParams,
      cacheKey: `people:list:${searchParams}`,
    });
    return validatePersonListResponse(response);
  }

  /** Iterate every person matching `params`, fetching pages as needed. */
  async *listAll(
    params: Omit<PersonListParams, "offset">,
  ): AsyncGenerator<Person> {
    const limit = params?.limit ?? 100;
    let offset = 0;
    while (true) {
      const page = await this.list({ ...params, limit, offset });
      yield* page.data;
      if (!page.hasMore || page.data.length === 0) return;
      offset += page.data.length;
    }
  }

  /** Fetch a single adopter, foster, surrender, or volunteer by ID. */
  async get(
    id: string,
    type: PersonType,
    options?: { forceRefresh?: boolean },
  ): Promise<Person> {
    const personId = requireId(id, "Person");
    assertPersonType(type);
    const response = await this.requests.get(
      `api/people/${encodeURIComponent(personId)}`,
      {
        searchParams: new URLSearchParams({ type }),
        cacheKey: `people:get:${type}:${personId}`,
        forceRefresh: options?.forceRefresh,
      },
    );
    return validatePerson(response);
  }

  /**
   * Create an adopter, foster, surrender, or volunteer. Sends an idempotency
   * key by default so retries are safe.
   *
   * - `application` (adopter/foster) submits a pending application for 1-5 pets.
   * - `pets` (surrender) links existing pets or creates new ones first.
   */
  async create(
    data: PersonCreateInput,
    options?: WriteOptions,
  ): Promise<Person> {
    if (!isRecord(data)) {
      throw new Error("Person create payload must be an object");
    }
    assertPersonType(data.type);
    if (data.application != null && data.pets != null) {
      throw new Error(
        "Person application and surrender pets cannot be provided together",
      );
    }
    if (data.pets != null && data.type !== "surrender") {
      throw new Error(
        'Person pets can only be provided when type is "surrender"',
      );
    }

    const json: Record<string, unknown> = {
      type: data.type,
      name: requireString(data.name, "Person", "name"),
    };
    assignDefined(json, {
      email: optionalString(data.email, "Person", "email"),
      phone: optionalString(data.phone, "Person", "phone"),
      address: optionalString(data.address, "Person", "address"),
      status: optionalString(data.status, "Person", "status"),
      custom_field_data: optionalRecord(
        data.custom_field_data,
        "Person",
        "custom_field_data",
      ),
      capacity: optionalNumber(data.capacity, "Person", "capacity"),
      skills: optionalStringArray(data.skills, "Person", "skills"),
      interests: optionalStringArray(data.interests, "Person", "interests"),
      preferred_roles: optionalStringArray(
        data.preferred_roles,
        "Person",
        "preferred_roles",
      ),
      languages: optionalStringArray(data.languages, "Person", "languages"),
      application:
        data.application != null
          ? normalizeApplication(data.application, data.type, options)
          : undefined,
      pets:
        data.pets != null
          ? await resolveSurrenderPets(data.pets, this.petsApi, options)
          : undefined,
    });

    const person = validatePerson(
      await this.requests.post("api/people", {
        json,
        // `type` is also sent as a query param for routing.
        searchParams: new URLSearchParams({ type: data.type }),
        ...options,
      }),
    );
    this.requests.invalidate("people:list:");
    return person;
  }

  /** Fetch the custom field definitions for a person type's forms. */
  async getCustomFields(type: PersonType): Promise<CustomField[]> {
    assertPersonType(type);
    const response = await this.requests.get("api/people/custom-fields", {
      searchParams: new URLSearchParams({ type }),
      cacheKey: `people:custom-fields:${type}`,
    });
    return validatePersonCustomFieldsResponse(response).custom_fields;
  }
}
