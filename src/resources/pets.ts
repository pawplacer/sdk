import { throwIfApiError } from "../errors";
import { buildSearchParams, requireId } from "../internal";
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

  private normalizeCreatePayload(
    data: PetCreateInput,
  ): Record<string, unknown> {
    const normalizeRequired = (
      value: unknown,
      fieldName: string,
      hint?: string,
    ) => {
      const suffix = hint ? `: ${hint}` : "";
      if (typeof value !== "string") {
        throw new Error(`Pet ${fieldName} is required${suffix}`);
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        throw new Error(`Pet ${fieldName} is required${suffix}`);
      }
      return trimmed;
    };
    const normalizeArray = (
      values: string[] | undefined,
      fieldName: string,
    ) => {
      if (values === undefined) {
        return undefined;
      }
      if (!Array.isArray(values)) {
        throw new Error(`Pet ${fieldName} must be an array of strings`);
      }
      return values
        .map((value) => {
          if (typeof value !== "string") {
            throw new Error(`Pet ${fieldName} must be an array of strings`);
          }
          return value.trim();
        })
        .filter((value) => value.length > 0);
    };
    const normalizeRecord = (
      value: Record<string, unknown> | undefined,
      fieldName: string,
    ) => {
      if (value === undefined) {
        return undefined;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Pet ${fieldName} must be an object`);
      }
      return value;
    };

    const payload: Record<string, unknown> = {
      name: normalizeRequired(data.name, "name"),
      species: normalizeRequired(
        data.species,
        "species",
        "dog, cat, or rabbit",
      ),
      age_category: normalizeRequired(
        data.age_category,
        "age_category",
        "youngest, young, adult, or senior",
      ),
      sex: normalizeRequired(data.sex, "sex", "male, female, or unknown"),
      size: normalizeRequired(
        data.size,
        "size",
        "xSmall, small, medium, large, or xLarge",
      ),
      status: normalizeRequired(data.status, "status"),
      health: normalizeRequired(
        data.health,
        "health",
        "unknown, poor, good, or great",
      ),
    };

    const breed = normalizeArray(data.breed ?? data.breeds, "breed");
    if (breed) payload.breed = breed;

    const color = normalizeArray(data.color ?? data.colors, "color");
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

    const optionalFields: Record<string, unknown> = {
      age_years: data.age_years?.trim(),
      age_months: data.age_months?.trim(),
      age_birthday: data.age_birthday?.trim(),
      description: data.description?.trim(),
      spayed: data.spayed,
      microchip_id: data.microchip_id?.trim(),
      good_with: normalizeArray(data.good_with, "good_with"),
      bad_with: normalizeArray(data.bad_with, "bad_with"),
      temperaments: normalizeArray(data.temperaments, "temperaments"),
      image_urls: normalizeArray(data.image_urls, "image_urls"),
      coat_length: data.coat_length?.trim(),
      custom_field_data: normalizeRecord(
        data.custom_field_data,
        "custom_field_data",
      ),
      custom_id: data.custom_id?.trim(),
      custom_status_id: data.custom_status_id?.trim(),
      intake_date: data.intake_date?.trim(),
      location_found: data.location_found?.trim(),
      outcome_date: data.outcome_date?.trim(),
      primary_veterinarian_id: data.primary_veterinarian_id?.trim(),
      reason_for_surrender: data.reason_for_surrender?.trim(),
      special_needs: normalizeArray(data.special_needs, "special_needs"),
      status_change_notes: data.status_change_notes?.trim(),
      template_id: data.template_id?.trim(),
      show_public: data.show_public ?? data.is_published,
      weight: data.weight?.trim(),
    };

    for (const [key, value] of Object.entries(optionalFields)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string") {
        if (value.trim().length > 0) payload[key] = value.trim();
      } else if (Array.isArray(value)) {
        if (value.length > 0) payload[key] = value;
      } else {
        payload[key] = value;
      }
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
