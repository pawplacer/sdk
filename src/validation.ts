import { PawPlacerResponseValidationError } from "./errors";
import { isRecord, type JsonRecord } from "./internal";
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

// These checks guard against API drift: they confirm the fields the SDK's
// types promise are present with the right primitive types, and pass extra
// fields through untouched.

type Kind = "string" | "number" | "boolean" | "string[]" | "object";

/** `kind` = required; `kind?` = may be absent; `kind|null` = may be null; `kind?|null` = either. */
type Spec = Record<string, `${Kind}${"" | "?"}${"" | "|null"}`>;

function fail(message: string, payload: unknown): never {
  throw new PawPlacerResponseValidationError(message, payload);
}

function matchesKind(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string[]":
      return (
        Array.isArray(value) && value.every((item) => typeof item === "string")
      );
    case "object":
      return isRecord(value);
  }
}

function expectRecord(value: unknown, context: string): JsonRecord {
  if (!isRecord(value)) fail(`${context} must be an object`, value);
  return value;
}

function checkShape<T>(payload: unknown, spec: Spec, context: string): T {
  const record = expectRecord(payload, context);
  for (const [key, rule] of Object.entries(spec)) {
    const value = record[key];
    const nullable = rule.endsWith("|null");
    const optional = rule.includes("?");
    const kind = rule.replace("|null", "").replace("?", "") as Kind;
    if (value === undefined && optional) continue;
    if (value === null && nullable) continue;
    if (!matchesKind(value, kind)) {
      fail(`${context}.${key} must be ${rule.replace("?", " (optional)")}`, record);
    }
  }
  return record as T;
}

function expectArray(
  record: JsonRecord,
  key: string,
  context: string,
): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) fail(`${context}.${key} must be an array`, record);
  return value;
}

function checkPage(record: JsonRecord, context: string) {
  return checkShape<{
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>(
    record,
    { total: "number", limit: "number", offset: "number", hasMore: "boolean" },
    context,
  );
}

// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------

const PET_SPEC: Spec = {
  id: "string",
  name: "string",
  species: "string",
  age_category: "string",
  sex: "string",
  size: "string",
  status: "string",
  health: "string",
  breed: "string[]",
  color: "string[]",
  age_years: "string|null",
  age_months: "string|null",
  age_birthday: "string|null",
  description: "string",
  spayed: "boolean",
  adoption_fee: "string",
  global_adoption_fee: "number?|null",
  microchip_id: "string|null",
  good_with: "string[]",
  bad_with: "string[]",
  temperaments: "string[]",
  image_urls: "string[]",
  image_url: "string|null",
  coat_length: "string|null",
  custom_field_data: "object",
  custom_id: "string|null",
  intake_date: "string|null",
  outcome_date: "string|null",
  primary_veterinarian: "string|null",
  show_public: "boolean",
  special_needs: "string[]",
  tags: "string[]",
  status_change_notes: "string|null",
  weight: "string|null",
  adopted_by: "string|null",
  adopted_on: "string|null",
  hold_until: "string?|null",
  is_sample: "boolean?",
  created_at: "string",
  updated_at: "string",
};

export function validatePet(payload: unknown, context = "pet"): Pet {
  return checkShape<Pet>(payload, PET_SPEC, context);
}

export function validatePetListResponse(payload: unknown) {
  const context = "pets list response";
  const response = expectRecord(payload, context);
  return {
    pets: expectArray(response, "pets", context).map((pet, index) =>
      validatePet(pet, `pets[${index}]`),
    ),
    ...checkPage(response, context),
  };
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

const CUSTOM_FIELD_SPEC: Spec = {
  field_key: "string",
  label: "string",
  field_type: "string",
  required: "boolean",
  help_text: "string?|null",
  placeholder: "string?|null",
  sync_to_column: "string?|null",
  template_id: "string?|null",
  section_id: "string?|null",
  section: "string?|null",
  section_order: "number?",
  field_order: "number?",
  hidden: "boolean?",
  internal_only: "boolean?",
};

function validateCustomFields(
  response: JsonRecord,
  context: string,
): CustomField[] {
  return expectArray(response, "custom_fields", context).map((field, index) =>
    checkShape<CustomField>(field, CUSTOM_FIELD_SPEC, `custom_fields[${index}]`),
  );
}

export function validatePetCustomFieldsResponse(
  payload: unknown,
): PetCustomFieldsResponse {
  const context = "pet custom fields response";
  return {
    custom_fields: validateCustomFields(expectRecord(payload, context), context),
  };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const PERSON_SPEC: Spec = {
  id: "string",
  type: "string",
  name: "string",
  email: "string|null",
  phone: "string|null",
  address: "string|null",
  status: "string",
  status_change_notes: "string|null",
  custom_field_data: "object",
  tags: "string[]",
  capacity: "number|null",
  skills: "string[]?",
  interests: "string[]?",
  preferred_roles: "string[]?",
  languages: "string[]?",
  application: "object?",
  created_at: "string",
  updated_at: "string",
};

const APPLICATION_SPEC: Spec = {
  id: "string",
  pet_ids: "string[]",
  submitted_at: "string",
};

export function validatePerson(payload: unknown, context = "person"): Person {
  const person = checkShape<Person>(payload, PERSON_SPEC, context);
  if (person.application !== undefined) {
    checkShape(person.application, APPLICATION_SPEC, `${context}.application`);
  }
  return person;
}

export function validatePersonListResponse(
  payload: unknown,
): PersonListResponse {
  const context = "people list response";
  const response = checkShape<{ type: PersonType }>(
    payload,
    { type: "string" },
    context,
  );
  return {
    type: response.type,
    data: expectArray(response, "people", context).map((person, index) =>
      validatePerson(person, `people[${index}]`),
    ),
    ...checkPage(response, context),
  };
}

export function validatePersonCustomFieldsResponse(
  payload: unknown,
): PersonCustomFieldsResponse {
  const context = "person custom fields response";
  const response = checkShape<{ type: PersonType }>(
    payload,
    { type: "string" },
    context,
  );
  return {
    type: response.type,
    custom_fields: validateCustomFields(response, context),
  };
}

// ---------------------------------------------------------------------------
// Adoption fees & contracts
// ---------------------------------------------------------------------------

const ADOPTION_FEE_SPEC: Spec = {
  species: "string",
  attribute_type: "string",
  attribute_value: "string",
  adjustment: "number",
};

export function validateAdoptionFeesResponse(
  payload: unknown,
): AdoptionFeesResponse {
  const context = "adoption fees response";
  return {
    fees: expectArray(expectRecord(payload, context), "fees", context).map(
      (entry, index) =>
        checkShape<AdoptionFeeEntry>(entry, ADOPTION_FEE_SPEC, `fees[${index}]`),
    ),
  };
}

export function validateContractResponse(payload: unknown): ContractResponse {
  return checkShape<ContractResponse>(
    payload,
    { type: "string", content: "string", updated_at: "string|null" },
    "contract response",
  );
}
