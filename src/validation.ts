import { PawPlacerResponseValidationError } from "./errors";
import type { JsonRecord } from "./internal";
import { isRecord } from "./internal";
import type {
  AdoptionFeeEntry,
  AdoptionFeesResponse,
  ContractResponse,
  CustomField,
  Person,
  PersonCustomFieldsResponse,
  PersonListResponse,
  PersonType,
  Pet,
  PetCustomFieldsResponse,
} from "./types";

function fail(message: string, payload: unknown): never {
  throw new PawPlacerResponseValidationError(message, payload);
}

function expectRecord(value: unknown, context: string): JsonRecord {
  if (!isRecord(value)) {
    fail(`${context} must be an object`, value);
  }
  return value;
}

function expectString(
  record: JsonRecord,
  key: string,
  context: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    fail(`${context}.${key} must be a string`, record);
  }
  return value;
}

function expectNullableString(
  record: JsonRecord,
  key: string,
  context: string,
): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    fail(`${context}.${key} must be a string or null`, record);
  }
  return value;
}

function expectOptionalNullableString(
  record: JsonRecord,
  key: string,
  context: string,
): string | null | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    fail(`${context}.${key} must be a string, null, or undefined`, record);
  }
  return value;
}

function expectBoolean(
  record: JsonRecord,
  key: string,
  context: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    fail(`${context}.${key} must be a boolean`, record);
  }
  return value;
}

function expectOptionalBoolean(
  record: JsonRecord,
  key: string,
  context: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    fail(`${context}.${key} must be a boolean or undefined`, record);
  }
  return value;
}

function expectNumber(
  record: JsonRecord,
  key: string,
  context: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${context}.${key} must be a finite number`, record);
  }
  return value;
}

function expectStringArray(
  record: JsonRecord,
  key: string,
  context: string,
): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${context}.${key} must be an array of strings`, record);
  }
  return value;
}

function expectJsonRecord(
  record: JsonRecord,
  key: string,
  context: string,
): JsonRecord {
  const value = record[key];
  if (!isRecord(value)) {
    fail(`${context}.${key} must be an object`, record);
  }
  return value;
}

function expectNullableNumber(
  record: JsonRecord,
  key: string,
  context: string,
): number | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${context}.${key} must be a finite number or null`, record);
  }
  return value;
}

export function validatePet(payload: unknown, context = "pet"): Pet {
  const pet = expectRecord(payload, context);

  // Core identity
  expectString(pet, "id", context);
  expectString(pet, "name", context);
  expectString(pet, "species", context);
  expectString(pet, "age_category", context);
  expectString(pet, "sex", context);
  expectString(pet, "size", context);
  expectString(pet, "status", context);
  expectString(pet, "health", context);

  // Profile data
  expectStringArray(pet, "breed", context);
  expectStringArray(pet, "color", context);
  expectNullableString(pet, "age_years", context);
  expectNullableString(pet, "age_months", context);
  expectNullableString(pet, "age_birthday", context);
  expectString(pet, "description", context);
  expectBoolean(pet, "spayed", context);
  expectString(pet, "adoption_fee", context);
  if ("global_adoption_fee" in pet) {
    expectNullableNumber(pet, "global_adoption_fee", context);
  }
  expectNullableString(pet, "microchip_id", context);
  expectStringArray(pet, "good_with", context);
  expectStringArray(pet, "bad_with", context);
  expectStringArray(pet, "temperaments", context);
  expectStringArray(pet, "image_urls", context);
  expectNullableString(pet, "image_url", context);
  expectNullableString(pet, "coat_length", context);
  expectJsonRecord(pet, "custom_field_data", context);
  expectNullableString(pet, "custom_id", context);
  expectNullableString(pet, "intake_date", context);
  expectNullableString(pet, "outcome_date", context);
  expectNullableString(pet, "primary_veterinarian", context);
  expectBoolean(pet, "show_public", context);
  expectStringArray(pet, "special_needs", context);
  expectStringArray(pet, "tags", context);
  expectNullableString(pet, "status_change_notes", context);
  expectNullableString(pet, "weight", context);
  expectNullableString(pet, "adopted_by", context);
  expectNullableString(pet, "adopted_on", context);
  expectString(pet, "created_at", context);
  expectString(pet, "updated_at", context);

  return pet as unknown as Pet;
}

export function validatePetListResponse(payload: unknown): {
  pets: Pet[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
} {
  const response = expectRecord(payload, "pets list response");
  const pets = response.pets;

  if (!Array.isArray(pets)) {
    fail("pets list response.pets must be an array", response);
  }

  return {
    pets: pets.map((pet, index) => validatePet(pet, `pets[${index}]`)),
    total: expectNumber(response, "total", "pets list response"),
    limit: expectNumber(response, "limit", "pets list response"),
    offset: expectNumber(response, "offset", "pets list response"),
    hasMore: expectBoolean(response, "hasMore", "pets list response"),
  };
}

function validateCustomField(payload: unknown, context: string): CustomField {
  const field = expectRecord(payload, context);

  expectString(field, "field_key", context);
  expectString(field, "label", context);
  expectString(field, "field_type", context);
  expectBoolean(field, "required", context);
  expectOptionalNullableString(field, "help_text", context);
  expectOptionalNullableString(field, "section", context);
  expectOptionalBoolean(field, "hidden", context);
  expectOptionalBoolean(field, "internal_only", context);

  return field as unknown as CustomField;
}

function validateCustomFieldArray(
  payload: unknown,
  context: string,
): CustomField[] {
  if (!Array.isArray(payload)) {
    fail(`${context}.custom_fields must be an array`, payload);
  }
  return payload.map((field, index) =>
    validateCustomField(field, `custom_fields[${index}]`),
  );
}

export function validatePetCustomFieldsResponse(
  payload: unknown,
): PetCustomFieldsResponse {
  const response = expectRecord(payload, "pet custom fields response");
  return {
    custom_fields: validateCustomFieldArray(
      response.custom_fields,
      "pet custom fields response",
    ),
  };
}

// ---------------------------------------------------------------------------
// Person validators
// ---------------------------------------------------------------------------

export function validatePerson(payload: unknown, context = "person"): Person {
  const person = expectRecord(payload, context);

  expectString(person, "id", context);
  expectString(person, "type", context);
  expectString(person, "name", context);
  expectNullableString(person, "email", context);
  expectNullableString(person, "phone", context);
  expectNullableString(person, "address", context);
  expectString(person, "status", context);
  expectNullableString(person, "status_change_notes", context);
  expectJsonRecord(person, "custom_field_data", context);
  expectStringArray(person, "tags", context);
  expectNullableNumber(person, "capacity", context);
  expectString(person, "created_at", context);
  expectString(person, "updated_at", context);

  return person as unknown as Person;
}

export function validatePersonListResponse(
  payload: unknown,
): PersonListResponse {
  const response = expectRecord(payload, "people list response");
  const people = response.people;

  if (!Array.isArray(people)) {
    fail("people list response.people must be an array", response);
  }

  return {
    type: expectString(response, "type", "people list response") as PersonType,
    data: people.map((person, index) =>
      validatePerson(person, `people[${index}]`),
    ),
    total: expectNumber(response, "total", "people list response"),
    limit: expectNumber(response, "limit", "people list response"),
    offset: expectNumber(response, "offset", "people list response"),
    hasMore: expectBoolean(response, "hasMore", "people list response"),
  };
}

export function validatePersonCustomFieldsResponse(
  payload: unknown,
): PersonCustomFieldsResponse {
  const response = expectRecord(payload, "person custom fields response");
  return {
    type: expectString(
      response,
      "type",
      "person custom fields response",
    ) as PersonType,
    custom_fields: validateCustomFieldArray(
      response.custom_fields,
      "person custom fields response",
    ),
  };
}

// ---------------------------------------------------------------------------
// Adoption fees validators
// ---------------------------------------------------------------------------

function validateAdoptionFeeEntry(
  payload: unknown,
  context: string,
): AdoptionFeeEntry {
  const entry = expectRecord(payload, context);

  expectString(entry, "species", context);
  expectString(entry, "attribute_type", context);
  expectString(entry, "attribute_value", context);
  expectNumber(entry, "adjustment", context);

  return entry as unknown as AdoptionFeeEntry;
}

export function validateAdoptionFeesResponse(
  payload: unknown,
): AdoptionFeesResponse {
  const response = expectRecord(payload, "adoption fees response");
  const fees = response.fees;

  if (!Array.isArray(fees)) {
    fail("adoption fees response.fees must be an array", response);
  }

  return {
    fees: fees.map((entry, index) =>
      validateAdoptionFeeEntry(entry, `fees[${index}]`),
    ),
  };
}

// ---------------------------------------------------------------------------
// Contract validators
// ---------------------------------------------------------------------------

export function validateContractResponse(payload: unknown): ContractResponse {
  const response = expectRecord(payload, "contract response");

  expectString(response, "type", "contract response");
  expectString(response, "content", "contract response");
  expectNullableString(response, "updated_at", "contract response");

  return response as unknown as ContractResponse;
}
