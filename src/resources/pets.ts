import { throwIfApiError } from "../errors";
import {
  assignPresentFields,
  buildSearchParams,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requireId,
  requireString,
} from "../internal";
import type { JsonRecord } from "../internal";
import type { RequestManager } from "../request-manager";
import type {
  CreatePetOptions,
  CustomField,
  Pet,
  PetCreateInput,
  PetListParams,
  PetListResponse,
} from "../types";
import {
  validatePet,
  validatePetCustomFieldsResponse,
  validatePetListResponse,
} from "../validation";
import { applyPostOptions } from "./_post-options";

export class PetsApi {
  constructor(private requests: RequestManager) {}

  private normalizePetWritePayload(
    data: Partial<PetCreateInput>,
    options: { requireCreateFields: boolean },
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (options.requireCreateFields) {
      Object.assign(payload, {
        name: requireString(data.name, "Pet", "name"),
        species: requireString(
          data.species,
          "Pet",
          "species",
          "dog, cat, or rabbit",
        ),
        age_category: requireString(
          data.age_category,
          "Pet",
          "age_category",
          "youngest, young, adult, or senior",
        ),
        sex: requireString(data.sex, "Pet", "sex", "male, female, or unknown"),
        size: requireString(
          data.size,
          "Pet",
          "size",
          "xSmall, small, medium, large, or xLarge",
        ),
        status: requireString(data.status, "Pet", "status"),
        health: requireString(
          data.health,
          "Pet",
          "health",
          "unknown, poor, good, or great",
        ),
      });
    } else {
      assignPresentFields(payload, {
        name: optionalString(data.name, "Pet", "name"),
        species: optionalString(data.species, "Pet", "species"),
        age_category: optionalString(
          data.age_category,
          "Pet",
          "age_category",
        ),
        sex: optionalString(data.sex, "Pet", "sex"),
        size: optionalString(data.size, "Pet", "size"),
        status: optionalString(data.status, "Pet", "status"),
        health: optionalString(data.health, "Pet", "health"),
      });
    }

    const breed = optionalStringArray(data.breed ?? data.breeds, "Pet", "breed");
    if (breed) payload.breed = breed;

    const color = optionalStringArray(data.color ?? data.colors, "Pet", "color");
    if (color) payload.color = color;

    if (data.adoption_fee !== undefined) {
      let adoptionFee: string;
      if (typeof data.adoption_fee === "number") {
        if (!Number.isFinite(data.adoption_fee)) {
          throw new Error("Pet adoption_fee must be a finite number or string");
        }
        adoptionFee = data.adoption_fee.toString();
      } else if (typeof data.adoption_fee === "string") {
        adoptionFee = data.adoption_fee.trim();
      } else {
        throw new Error("Pet adoption_fee must be a finite number or string");
      }
      if (adoptionFee.length > 0) {
        payload.adoption_fee = adoptionFee;
      }
    }

    assignPresentFields(payload, {
      age_years: optionalString(data.age_years, "Pet", "age_years"),
      age_months: optionalString(data.age_months, "Pet", "age_months"),
      age_birthday: optionalString(data.age_birthday, "Pet", "age_birthday"),
      description: optionalString(data.description, "Pet", "description"),
      spayed: data.spayed,
      microchip_id: optionalString(data.microchip_id, "Pet", "microchip_id"),
      good_with: optionalStringArray(data.good_with, "Pet", "good_with"),
      bad_with: optionalStringArray(data.bad_with, "Pet", "bad_with"),
      temperaments: optionalStringArray(
        data.temperaments,
        "Pet",
        "temperaments",
      ),
      image_urls: optionalStringArray(data.image_urls, "Pet", "image_urls"),
      coat_length: optionalString(data.coat_length, "Pet", "coat_length"),
      custom_field_data: optionalRecord(
        data.custom_field_data,
        "Pet",
        "custom_field_data",
      ),
      custom_id: optionalString(data.custom_id, "Pet", "custom_id"),
      custom_status_id: optionalString(
        data.custom_status_id,
        "Pet",
        "custom_status_id",
      ),
      intake_date: optionalString(data.intake_date, "Pet", "intake_date"),
      location_found: optionalString(
        data.location_found,
        "Pet",
        "location_found",
      ),
      outcome_date: optionalString(data.outcome_date, "Pet", "outcome_date"),
      primary_veterinarian_id: optionalString(
        data.primary_veterinarian_id,
        "Pet",
        "primary_veterinarian_id",
      ),
      reason_for_surrender: optionalString(
        data.reason_for_surrender,
        "Pet",
        "reason_for_surrender",
      ),
      special_needs: optionalStringArray(
        data.special_needs,
        "Pet",
        "special_needs",
      ),
      status_change_notes: optionalString(
        data.status_change_notes,
        "Pet",
        "status_change_notes",
      ),
      template_id: optionalString(data.template_id, "Pet", "template_id"),
      show_public: data.show_public ?? data.is_published,
      weight: optionalString(data.weight, "Pet", "weight"),
    });

    return payload;
  }

  private normalizeCreatePayload(
    data: PetCreateInput,
  ): Record<string, unknown> {
    return this.normalizePetWritePayload(data, { requireCreateFields: true });
  }

  private normalizeUpdatePayload(
    data: Partial<PetCreateInput>,
  ): Record<string, unknown> {
    const payload = this.normalizePetWritePayload(data, {
      requireCreateFields: false,
    });
    if (Object.keys(payload).length === 0) {
      throw new Error("Update payload must include at least one field");
    }
    return payload;
  }

  /** List pets with optional filters. Returns paginated results. */
  async list(params?: PetListParams): Promise<PetListResponse> {
    const searchParams = buildSearchParams(params);
    const response = await this.requests.get<JsonRecord>("api/pets", {
      searchParams,
      memoize: { key: `pets:list:${searchParams.toString()}` },
    });
    throwIfApiError(response);
    const { pets, total, limit, offset, hasMore } =
      validatePetListResponse(response);
    return { data: pets, total, limit, offset, hasMore };
  }

  /** Fetch a single pet by ID. */
  async get(id: string, options?: { forceRefresh?: boolean }): Promise<Pet> {
    const trimmedId = requireId(id, "Pet");
    const response = await this.requests.get<JsonRecord>(
      `api/pets/${trimmedId}`,
      {
        memoize: {
          key: `pets:get:${trimmedId}`,
          staleWhileRevalidateMs: 30 * 60 * 1000,
          forceRefresh: options?.forceRefresh,
        },
      },
    );
    throwIfApiError(response);
    return validatePet(response);
  }

  /** Alias for `get`. */
  async getById(
    id: string,
    options?: { forceRefresh?: boolean },
  ): Promise<Pet> {
    return this.get(id, options);
  }

  /** Convenience method that returns a plain `Pet[]` array. Defaults to 10 results. */
  async findMany(params?: PetListParams, limit?: number): Promise<Pet[]> {
    const result = await this.list({
      ...params,
      limit: limit ?? params?.limit ?? 10,
      offset: params?.offset ?? 0,
    });
    return result.data;
  }

  /** Create a new pet. Sends an idempotency key by default. */
  async create(data: PetCreateInput, options?: CreatePetOptions): Promise<Pet> {
    if (!data || typeof data !== "object") {
      throw new Error("Create payload is required");
    }
    const payload = this.normalizeCreatePayload(data);
    const headers: Record<string, string> = {};
    const requestOptions: Record<string, unknown> = { json: payload, headers };
    applyPostOptions(headers, requestOptions, options);

    const pet = await this.requests.post<JsonRecord>(
      "api/pets",
      requestOptions,
    );
    throwIfApiError(pet);
    this.requests.invalidateMatching("pets:list:");
    return validatePet(pet);
  }

  /** Update an existing pet by PawPlacer pet UUID or custom_id. Sends an idempotency key by default. */
  async update(
    idOrCustomId: string,
    data: Partial<PetCreateInput>,
    options?: CreatePetOptions,
  ): Promise<Pet> {
    const identifier = requireId(idOrCustomId, "Pet");
    if (!data || typeof data !== "object") {
      throw new Error("Update payload is required");
    }
    const payload = this.normalizeUpdatePayload(data);
    const headers: Record<string, string> = {};
    const requestOptions: Record<string, unknown> = { json: payload, headers };
    applyPostOptions(headers, requestOptions, options, "patch");

    const pet = await this.requests.patch<JsonRecord>(
      `api/pets/${encodeURIComponent(identifier)}`,
      requestOptions,
    );
    throwIfApiError(pet);
    const validatedPet = validatePet(pet);
    this.requests.invalidateMatching("pets:list:");
    this.requests.invalidate(`pets:get:${validatedPet.id}`);
    if (identifier !== validatedPet.id) {
      this.requests.invalidate(`pets:get:${identifier}`);
    }
    return validatedPet;
  }

  /** Search pets by name or description. Returns a plain `Pet[]` array. */
  async search(query: string): Promise<Pet[]> {
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw new Error(
        "Search query is required and must be a non-empty string",
      );
    }
    return (await this.list({ search: query })).data;
  }

  /** Filter pets by status. Returns a plain `Pet[]` array. */
  async getByStatus(status: string): Promise<Pet[]> {
    if (!status || typeof status !== "string" || status.trim().length === 0) {
      throw new Error("Status is required to filter pets");
    }
    return (await this.list({ status })).data;
  }

  /** Fetch the custom field definitions for pet forms. */
  async getCustomFields(): Promise<CustomField[]> {
    const response = await this.requests.get<JsonRecord>(
      "api/pets/custom-fields",
      { memoize: { key: "pets:custom-fields", refreshFrequencyMinutes: 15 } },
    );
    throwIfApiError(response);
    return validatePetCustomFieldsResponse(response).custom_fields;
  }
}
