import { throwIfApiError } from "../errors";
import {
  assignPresentFields,
  buildSearchParams,
  optionalNumber,
  optionalRecord,
  optionalString,
  requireId,
  requireString,
} from "../internal";
import type { JsonRecord } from "../internal";
import type { RequestManager } from "../request-manager";
import type {
  CreatePetOptions,
  CreatePersonOptions,
  CustomField,
  Person,
  PersonCreateInput,
  PersonListParams,
  PersonListResponse,
  PersonType,
  SurrenderPetCreateInput,
} from "../types";
import {
  validatePerson,
  validatePersonCustomFieldsResponse,
  validatePersonListResponse,
} from "../validation";
import { applyPostOptions } from "./_post-options";
import type { PetsApi } from "./pets";

function assertPersonType(type: unknown): asserts type is PersonType {
  if (
    type !== "adopter" &&
    type !== "foster" &&
    type !== "surrender" &&
    type !== "volunteer"
  ) {
    throw new Error(
      'Person type is required. Must be "adopter", "foster", "surrender", or "volunteer".',
    );
  }
}

function surrenderPetCreateOptions(
  options: CreatePersonOptions | undefined,
  index: number,
): CreatePetOptions | undefined {
  if (!options) {
    return undefined;
  }

  if (typeof options.idempotencyKey === "string") {
    return {
      idempotencyKey: `${options.idempotencyKey}:pet:${index}`,
      retry: options.retry,
    };
  }

  return {
    idempotencyKey: options.idempotencyKey,
    retry: options.retry,
  };
}

function normalizeSurrenderPetLink(
  item: SurrenderPetCreateInput,
  index: number,
): Record<string, unknown> {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Surrender pet at index ${index} must be an object`);
  }

  const payload: Record<string, unknown> = {};
  const optionalStrings: Record<string, string | null | undefined> = {
    pet_id: item.pet_id,
    reason: item.reason,
    urgency: item.urgency,
    notes: item.notes,
  };

  for (const [key, value] of Object.entries(optionalStrings)) {
    const normalized = optionalString(value, "Person", key);
    if (normalized !== undefined) payload[key] = normalized;
  }

  if (item.custom_data != null) {
    payload.custom_data = optionalRecord(
      item.custom_data,
      "Surrender pet",
      "custom_data",
    );
  }

  if (!payload.pet_id && item.create == null) {
    throw new Error(
      `Surrender pet at index ${index} must include pet_id or create`,
    );
  }
  if (payload.pet_id && item.create != null) {
    throw new Error(
      `Surrender pet at index ${index} cannot include both pet_id and create`,
    );
  }

  return payload;
}

async function resolveSurrenderPets(
  petsApi: Pick<PetsApi, "create"> | undefined,
  pets: SurrenderPetCreateInput[] | null | undefined,
  options: CreatePersonOptions | undefined,
): Promise<Record<string, unknown>[] | undefined> {
  if (pets == null) {
    return undefined;
  }
  if (!Array.isArray(pets)) {
    throw new Error("Surrender pets must be an array");
  }
  if (pets.length === 0) {
    throw new Error("Surrender pets must include at least one pet");
  }

  const normalized = pets.map((item, index) => ({
    item,
    link: normalizeSurrenderPetLink(item, index),
    index,
  }));
  const needsPetCreation = normalized.some(({ item }) => item.create != null);
  if (needsPetCreation && !petsApi) {
    throw new Error(
      "Creating surrender pets requires PawPlacerClient or a PetsApi instance",
    );
  }
  const petCreator = petsApi;

  const resolved: Record<string, unknown>[] = [];
  for (const { item, link, index } of normalized) {
    if (item.create != null) {
      if (!petCreator) {
        throw new Error(
          "Creating surrender pets requires PawPlacerClient or a PetsApi instance",
        );
      }
      const pet = await petCreator.create(
        item.create,
        surrenderPetCreateOptions(options, index),
      );
      link.pet_id = pet.id;
    }
    resolved.push(link);
  }
  return resolved;
}

export class PeopleApi {
  constructor(
    private requests: RequestManager,
    private petsApi?: Pick<PetsApi, "create">,
  ) {}

  /** List adopters, fosters, surrenders, or volunteers. `type` is required in params. */
  async list(params: PersonListParams): Promise<PersonListResponse> {
    assertPersonType(params?.type);
    const searchParams = buildSearchParams(params);
    const response = await this.requests.get<JsonRecord>("api/people", {
      searchParams,
      memoize: { key: `people:list:${searchParams.toString()}` },
    });
    throwIfApiError(response);
    return validatePersonListResponse(response);
  }

  /** Fetch a single adopter, foster, surrender, or volunteer by ID. */
  async get(
    id: string,
    type: PersonType,
    options?: { forceRefresh?: boolean },
  ): Promise<Person> {
    const trimmedId = requireId(id, "Person");
    assertPersonType(type);
    const response = await this.requests.get<JsonRecord>(
      `api/people/${trimmedId}`,
      {
        searchParams: new URLSearchParams({ type }),
        memoize: {
          key: `people:get:${type}:${trimmedId}`,
          staleWhileRevalidateMs: 30 * 60 * 1000,
          forceRefresh: options?.forceRefresh,
        },
      },
    );
    throwIfApiError(response);
    return validatePerson(response);
  }

  /** Alias for `get`. */
  async getById(
    id: string,
    type: PersonType,
    options?: { forceRefresh?: boolean },
  ): Promise<Person> {
    return this.get(id, type, options);
  }

  /** Convenience method that returns a plain `Person[]` array. Defaults to 10 results. */
  async findMany(params: PersonListParams, limit?: number): Promise<Person[]> {
    const result = await this.list({
      ...params,
      limit: limit ?? params?.limit ?? 10,
      offset: params?.offset ?? 0,
    });
    return result.data;
  }

  /** Create a new adopter, foster, surrender, or volunteer. Sends an idempotency key by default. */
  async create(
    data: PersonCreateInput,
    options?: CreatePersonOptions,
  ): Promise<Person> {
    if (!data || typeof data !== "object") {
      throw new Error("Create payload is required");
    }
    assertPersonType(data.type);

    const payload: Record<string, unknown> = {
      type: data.type,
      name: requireString(data.name, "Person", "name"),
    };

    assignPresentFields(payload, {
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
    });
    if (data.pets != null && data.type !== "surrender") {
      throw new Error(
        'Person pets can only be provided when type is "surrender"',
      );
    }

    const surrenderPets = await resolveSurrenderPets(
      this.petsApi,
      data.pets,
      options,
    );
    if (surrenderPets) {
      payload.pets = surrenderPets;
    }

    const headers: Record<string, string> = {};
    const requestOptions: Record<string, unknown> = { json: payload, headers };
    applyPostOptions(headers, requestOptions, options);
    // type is sent in both the body (resource field) and query (routing).
    requestOptions.searchParams = new URLSearchParams({ type: data.type });

    const person = await this.requests.post<JsonRecord>(
      "api/people",
      requestOptions,
    );
    throwIfApiError(person);
    this.requests.invalidateMatching("people:list:");
    return validatePerson(person);
  }

  /** Fetch the custom field definitions for adopter, foster, surrender, or volunteer forms. */
  async getCustomFields(type: PersonType): Promise<CustomField[]> {
    assertPersonType(type);
    const response = await this.requests.get<JsonRecord>(
      "api/people/custom-fields",
      {
        searchParams: new URLSearchParams({ type }),
        memoize: {
          key: `people:custom-fields:${type}`,
          refreshFrequencyMinutes: 15,
        },
      },
    );
    throwIfApiError(response);
    return validatePersonCustomFieldsResponse(response).custom_fields;
  }
}
