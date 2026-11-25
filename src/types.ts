// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface PawPlacerConfig {
  /** Defaults to `process.env.PAWPLACER_API_KEY`. */
  apiKey?: string;
  /** Defaults to `https://pawplacer.com`. */
  apiUrl?: string;
  /** Per-attempt timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Retries for GETs, and for writes that carry an idempotency key. Defaults to 2. */
  retryLimit?: number;
  /** Maximum delay between retries in milliseconds. Defaults to 3000. */
  retryBackoffLimit?: number;
  /** Logs each request and retry with `console.debug`. */
  debug?: boolean;
  /** Allows construction in a browser. Exposes your API key; local development only. */
  allowBrowser?: boolean;
  cache?: {
    /** Defaults to true. */
    enabled?: boolean;
    /**
     * Seconds to serve a cached response before revalidating. Defaults to the
     * API's `Cache-Control: max-age` (currently 60 seconds).
     */
    ttlSeconds?: number;
    /** Maximum cached responses. Defaults to 1000. */
    maxSize?: number;
  };
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CustomField {
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  help_text?: string | null;
  placeholder?: string | null;
  options?: unknown;
  sync_to_column?: string | null;
  template_id?: string | null;
  section_id?: string | null;
  section?: string | null;
  section_order?: number;
  field_order?: number;
  hidden?: boolean;
  internal_only?: boolean;
}

export interface WriteOptions {
  /**
   * Sent as the `Idempotency-Key` header. Defaults to a random UUID per call.
   * Pass a stable key (e.g. `sync:${externalId}`) so a replayed job returns the
   * original result instead of writing twice. `false` sends no key.
   */
  idempotencyKey?: string | false;
  /** Retry on timeouts, 429, and 5xx. Defaults to true when an idempotency key is sent. */
  retry?: boolean;
}

// ---------------------------------------------------------------------------
// Pet types
// ---------------------------------------------------------------------------

export type PetSpecies =
  | "dog"
  | "cat"
  | "rabbit"
  | "horse"
  | "small_furry"
  | "bird"
  | "barnyard"
  | "reptile"
  | "scales_fins_other"
  | "invertebrate";
export type PetAgeCategory = "youngest" | "young" | "adult" | "senior";
export type PetSex = "male" | "female" | "unknown";
export type PetSize = "xSmall" | "small" | "medium" | "large" | "xLarge";
export type PetHealthStatus = "unknown" | "poor" | "good" | "great";
/**
 * Default pet status names. Accounts can rename these and add their own, so
 * any status name, label, or status UUID configured in PawPlacer is accepted.
 */
export type PetStatus =
  | "intake"
  | "stray"
  | "available"
  | "fostered"
  | "hold"
  | "medicalTreatment"
  | "adopted"
  | "deceased"
  | "euthanized"
  | "transferred"
  | "returnedToOwner"
  | "archived"
  | "other"
  | (string & {});
export type PetCompatibility =
  | "activeLifestyle"
  | "cats"
  | "disabledMental"
  | "disabledPhysical"
  | "dogs"
  | "families"
  | "firstTimeOwners"
  | "frequentTravelers"
  | "houseTrained"
  | "kids"
  | "otherPets"
  | "outdoorsLiving"
  | "sedentaryLifestyle"
  | "seniors"
  | "smallApartments";
export type PetTemperament =
  | "affectionate"
  | "aggressive"
  | "cuddly"
  | "curious"
  | "docile"
  | "energetic"
  | "fearful"
  | "gentle"
  | "independent"
  | "loyal"
  | "mischievous"
  | "moody"
  | "playful"
  | "protective"
  | "quiet"
  | "rough"
  | "shy"
  | "smart"
  | "social"
  | "stubborn"
  | "vocal";

/** Pet returned by `pets.list`, `pets.get`, `pets.create`, and `pets.update`. */
export interface Pet {
  id: string;
  name: string;
  /** Empty string when not set. */
  species: PetSpecies | "";
  /** Empty string when not set. */
  age_category: PetAgeCategory | "";
  /** Empty string when not set. */
  sex: PetSex | "";
  /** Empty string when not set. */
  size: PetSize | "";
  /** The status's display label, e.g. `"Available"` or `"Medical Treatment"`. */
  status: string;
  /** Empty string when not set. */
  health: PetHealthStatus | "";
  breed: string[];
  color: string[];
  age_years: string | null;
  age_months: string | null;
  age_birthday: string | null;
  description: string;
  spayed: boolean;
  adoption_fee: string;
  /** Fee from the account's adoption fee rules, when the pet has no manual `adoption_fee`. */
  global_adoption_fee?: number | null;
  /** Always null: microchip IDs are private intake data and are never returned. */
  microchip_id: string | null;
  good_with: PetCompatibility[];
  bad_with: PetCompatibility[];
  temperaments: PetTemperament[];
  image_urls: string[];
  /** First image, or null. */
  image_url: string | null;
  coat_length: string | null;
  custom_field_data: Record<string, unknown>;
  /** Always null: custom IDs are private intake data and are never returned. You can still pass one to `pets.update`. */
  custom_id: string | null;
  intake_date: string | null;
  outcome_date: string | null;
  primary_veterinarian: string | null;
  show_public: boolean;
  special_needs: string[];
  tags: string[];
  status_change_notes: string | null;
  weight: string | null;
  adopted_by: string | null;
  adopted_on: string | null;
  hold_until?: string | null;
  /** True for pets that came from PawPlacer's sample data. */
  is_sample?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PetCreateInput {
  name: string;
  species: PetSpecies;
  age_category: PetAgeCategory;
  sex: PetSex;
  size: PetSize;
  /** A status name, label, or status UUID. Unknown values fall back to `available` on create. */
  status: PetStatus;
  health?: PetHealthStatus;
  breed?: string[];
  color?: string[];
  /** Whole years as digits, e.g. `"3"`. */
  age_years?: string;
  /** Whole months as digits, e.g. `"6"`. */
  age_months?: string;
  age_birthday?: string;
  description?: string;
  spayed?: boolean;
  adoption_fee?: string | number;
  microchip_id?: string;
  good_with?: PetCompatibility[];
  bad_with?: PetCompatibility[];
  temperaments?: PetTemperament[];
  image_urls?: string[];
  coat_length?: string;
  /** Keys come from `pets.getCustomFields()`. On update, keys are merged into the existing data. */
  custom_field_data?: Record<string, unknown>;
  /** Your own ID for the pet. `pets.update` accepts it in place of the UUID. */
  custom_id?: string;
  /** Status UUID. Overrides `status`. */
  custom_status_id?: string;
  intake_date?: string;
  /** Stored in custom field data; not returned on the pet. */
  location_found?: string;
  outcome_date?: string;
  /** Veterinarian UUID. */
  primary_veterinarian_id?: string;
  /** Stored in custom field data; not returned on the pet. */
  reason_for_surrender?: string;
  show_public?: boolean;
  special_needs?: string[];
  status_change_notes?: string;
  /** Pet form template UUID. */
  template_id?: string;
  weight?: string;
}

/**
 * Partial pet update. Omitted fields are unchanged. To clear a field, send
 * `[]` for lists, or `""` for text fields such as `description`, `weight`,
 * `intake_date`, or `adoption_fee`.
 */
export type PetUpdateInput = Partial<PetCreateInput>;

export interface PetListParams {
  /** 1-100. Defaults to 20. */
  limit?: number;
  offset?: number;
  species?: PetSpecies;
  /** Status name or label, e.g. `"available"`. */
  status?: PetStatus;
  /** Matches name and description. */
  search?: string;
  /** ISO-8601 timestamp. Only pets updated since then. */
  updated_since?: string;
}

export type PetListResponse = PaginatedResponse<Pet>;

export interface PetCustomFieldsResponse {
  custom_fields: CustomField[];
}

// ---------------------------------------------------------------------------
// Person types (adopters, fosters, surrenders & volunteers)
// ---------------------------------------------------------------------------

export const PERSON_TYPES = [
  "adopter",
  "foster",
  "surrender",
  "volunteer",
] as const;
export type PersonType = (typeof PERSON_TYPES)[number];
export type PersonStatus =
  | "pending"
  | "active"
  | "training"
  | "inactive"
  | "denied"
  | "suspended"
  | "blocked";
/** Statuses you can set on create. Adopters can't be `training`. */
export type PersonCreateStatus = "pending" | "active" | "training" | "inactive";

/** Adopter, foster, surrender, or volunteer returned by the API. */
export interface Person {
  id: string;
  type: PersonType;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: PersonStatus | (string & {});
  status_change_notes: string | null;
  custom_field_data: Record<string, unknown>;
  tags: string[];
  /** Foster capacity. Null for other types. */
  capacity: number | null;
  /** Volunteers only. */
  skills?: string[];
  /** Volunteers only. */
  interests?: string[];
  /** Volunteers only. */
  preferred_roles?: string[];
  /** Volunteers only. */
  languages?: string[];
  /** Present when the person was created with an `application`. */
  application?: PersonApplication;
  created_at: string;
  updated_at: string;
}

export interface PersonApplication {
  id: string;
  pet_ids: string[];
  submitted_at: string;
}

export interface PersonApplicationCreateInput {
  /** PawPlacer pet UUIDs the applicant selected (1-5, unique). */
  pet_ids: readonly string[];
  /** Set to true only after you showed the applicant `contracts.get(type).content` and they accepted it. */
  terms_accepted: true;
  /** Form template UUID from `people.getCustomFields`. If the form changed since, the API returns 409 `form_changed`. */
  template_id?: string;
  /** Your own user ID for the applicant. */
  external_user_id?: string;
}

export interface PersonCreateInput {
  type: PersonType;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: PersonCreateStatus;
  /** Keys come from `people.getCustomFields(type)`. */
  custom_field_data?: Record<string, unknown>;
  /** Fosters only. Whole number of pets. */
  capacity?: number | null;
  /** Volunteers only. */
  skills?: string[];
  /** Volunteers only. */
  interests?: string[];
  /** Volunteers only. */
  preferred_roles?: string[];
  /** Volunteers only. */
  languages?: string[];
  /** Adopters and fosters only. Creates a pending person and their application in one request. */
  application?: PersonApplicationCreateInput;
  /** Surrenders only. Pets to link to the surrender. */
  pets?: SurrenderPetCreateInput[];
}

export interface SurrenderPetCreateInput {
  /** UUID of an existing pet to link. Use this or `create`. */
  pet_id?: string | null;
  /** A new pet for the SDK to create (with `pets.create`) and then link. */
  create?: PetCreateInput;
  reason?: string | null;
  urgency?: "low" | "normal" | "high" | "urgent";
  notes?: string | null;
  custom_data?: Record<string, unknown>;
}

export interface PersonListParams {
  type: PersonType;
  /** 1-100. Defaults to 20. */
  limit?: number;
  offset?: number;
  status?: PersonStatus;
  /** Free-text search. */
  search?: string;
  /** ISO-8601 timestamp. Only people updated since then. */
  updated_since?: string;
}

export interface PersonListResponse extends PaginatedResponse<Person> {
  type: PersonType;
}

export interface PersonCustomFieldsResponse {
  type: PersonType;
  custom_fields: CustomField[];
}

// ---------------------------------------------------------------------------
// Adoption fee types
// ---------------------------------------------------------------------------

export interface AdoptionFeeEntry {
  species: string;
  attribute_type: string;
  attribute_value: string;
  adjustment: number;
}

export interface AdoptionFeesResponse {
  fees: AdoptionFeeEntry[];
}

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export const CONTRACT_TYPES = PERSON_TYPES;
export type ContractType = PersonType;

export interface ContractResponse {
  type: ContractType;
  content: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// API internals (errors, metadata, rate limits)
// ---------------------------------------------------------------------------

export interface ApiError {
  message: string;
  error: string;
  code: string;
  request_id: string;
  status?: number;
  errors?: unknown;
  details?: unknown;
  docs?: string;
  hint?: string;
  [key: string]: unknown;
}

export interface RateLimitInfo {
  /** Requests allowed per window for this key and endpoint. */
  limit: number;
  remaining: number;
  /** Unix time (seconds) when the window resets. */
  reset: number;
  /** Seconds to wait, sent on 429 responses. */
  retryAfter?: number;
}

export interface ApiResponseMeta {
  /** Include in support requests. */
  requestId?: string;
  apiVersion?: string;
  generatedAt?: string;
  rateLimit?: RateLimitInfo;
  /** True when the API returned the stored result of an earlier write with the same idempotency key. */
  idempotencyReplay?: boolean;
  /**
   * True while the account has sample data active. Responses then include
   * the sample pets and people alongside real records.
   */
  sampleData?: boolean;
}
