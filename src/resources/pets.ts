import {
  assignDefined,
  buildSearchParams,
  optionalBoolean,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requireId,
  requireString,
} from "../internal";
import type { RequestManager } from "../request-manager";
import type {
  CustomField,
  Pet,
  PetCreateInput,
  PetListParams,
  PetListResponse,
  PetUpdateInput,
  WriteOptions,
} from "../types";
import {
  validatePet,
  validatePetCustomFieldsResponse,
  validatePetListResponse,
} from "../validation";

const REQUIRED_FIELDS: ReadonlyArray<[keyof PetCreateInput, string?]> = [
  ["name"],
  ["species", "e.g. dog, cat, or rabbit"],
  ["age_category", "youngest, young, adult, or senior"],
  ["sex", "male, female, or unknown"],
  ["size", "xSmall, small, medium, large, or xLarge"],
  ["status"],
];

const STRING_FIELDS = [
  "health",
  "age_years",
  "age_months",
  "age_birthday",
  "description",
  "microchip_id",
  "coat_length",
  "custom_id",
  "custom_status_id",
  "intake_date",
  "location_found",
  "outcome_date",
  "primary_veterinarian_id",
  "reason_for_surrender",
  "status_change_notes",
  "template_id",
  "weight",
] as const satisfies ReadonlyArray<keyof PetCreateInput>;

const STRING_ARRAY_FIELDS = [
  "breed",
  "color",
  "good_with",
  "bad_with",
  "temperaments",
  "image_urls",
  "special_needs",
] as const satisfies ReadonlyArray<keyof PetCreateInput>;

function normalizeAdoptionFee(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === "string") return value.trim();
  throw new Error("Pet adoption_fee must be a finite number or string");
}

/** Trimmed string. Blank strings are dropped on create and sent on update, where `""` clears the field. */
function textField(
  value: unknown,
  field: string,
  mode: "create" | "update",
): string | undefined {
  const normalized = optionalString(value, "Pet", field);
  if (normalized === undefined && mode === "update" && typeof value === "string") {
    return "";
  }
  return normalized;
}

/**
 * Validates and trims a pet write payload. On create every required field must
 * be present; on update every field is optional.
 */
function normalizePetPayload(
  data: Partial<PetCreateInput>,
  mode: "create" | "update",
): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Pet ${mode} payload must be an object`);
  }
  const payload: Record<string, unknown> = {};

  for (const [field, hint] of REQUIRED_FIELDS) {
    payload[field] =
      mode === "create"
        ? requireString(data[field], "Pet", field, hint)
        : optionalString(data[field], "Pet", field);
  }
  for (const field of STRING_FIELDS) {
    payload[field] = textField(data[field], field, mode);
  }
  for (const field of STRING_ARRAY_FIELDS) {
    payload[field] = optionalStringArray(data[field], "Pet", field);
  }
  const adoptionFee = normalizeAdoptionFee(data.adoption_fee);
  payload.adoption_fee =
    adoptionFee === "" && mode === "create" ? undefined : adoptionFee;
  payload.spayed = optionalBoolean(data.spayed, "Pet", "spayed");
  payload.show_public = optionalBoolean(data.show_public, "Pet", "show_public");
  payload.custom_field_data = optionalRecord(
    data.custom_field_data,
    "Pet",
    "custom_field_data",
  );

  const result: Record<string, unknown> = {};
  assignDefined(result, payload);
  return result;
}

export class PetsApi {
  constructor(private requests: RequestManager) {}

  /** List pets with optional filters. Returns one page of results. */
  async list(params?: PetListParams): Promise<PetListResponse> {
    const searchParams = buildSearchParams(params);
    const response = await this.requests.get("api/pets", {
      searchParams,
      cacheKey: `pets:list:${searchParams}`,
    });
    const { pets, ...page } = validatePetListResponse(response);
    return { data: pets, ...page };
  }

  /**
   * Iterate every pet matching `params`, fetching pages of `params.limit`
   * (default 100) as needed.
   *
   * ```ts
   * for await (const pet of pawplacer.pets.listAll({ status: "available" })) { ... }
   * ```
   */
  async *listAll(params?: Omit<PetListParams, "offset">): AsyncGenerator<Pet> {
    const limit = params?.limit ?? 100;
    let offset = 0;
    while (true) {
      const page = await this.list({ ...params, limit, offset });
      yield* page.data;
      if (!page.hasMore || page.data.length === 0) return;
      offset += page.data.length;
    }
  }

  /** Fetch a single pet by PawPlacer pet UUID. */
  async get(id: string, options?: { forceRefresh?: boolean }): Promise<Pet> {
    const petId = requireId(id, "Pet");
    const response = await this.requests.get(
      `api/pets/${encodeURIComponent(petId)}`,
      { cacheKey: `pets:get:${petId}`, forceRefresh: options?.forceRefresh },
    );
    return validatePet(response);
  }

  /** Create a pet. Sends an idempotency key by default so retries are safe. */
  async create(data: PetCreateInput, options?: WriteOptions): Promise<Pet> {
    const json = normalizePetPayload(data, "create");
    const pet = validatePet(
      await this.requests.post("api/pets", { json, ...options }),
    );
    this.requests.invalidate("pets:list:");
    return pet;
  }

  /**
   * Update a pet by PawPlacer pet UUID or `custom_id`. Send only the fields
   * that changed. Sends an idempotency key by default so retries are safe.
   */
  async update(
    idOrCustomId: string,
    data: PetUpdateInput,
    options?: WriteOptions,
  ): Promise<Pet> {
    const identifier = requireId(idOrCustomId, "Pet");
    const json = normalizePetPayload(data, "update");
    if (Object.keys(json).length === 0) {
      throw new Error("Pet update payload must include at least one field");
    }
    const pet = validatePet(
      await this.requests.patch(`api/pets/${encodeURIComponent(identifier)}`, {
        json,
        ...options,
      }),
    );
    this.requests.invalidate("pets:list:");
    this.requests.invalidate(`pets:get:${pet.id}`);
    return pet;
  }

  /** Fetch the account's custom field definitions for pets. */
  async getCustomFields(): Promise<CustomField[]> {
    const response = await this.requests.get("api/pets/custom-fields", {
      cacheKey: "pets:custom-fields",
    });
    return validatePetCustomFieldsResponse(response).custom_fields;
  }
}
