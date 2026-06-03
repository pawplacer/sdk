// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface PawPlacerConfig {
  apiKey?: string; // Defaults to process.env.PAWPLACER_API_KEY when omitted.
  apiUrl?: string; // Defaults to https://pawplacer.com.
  timeout?: number; // Defaults to 30 seconds.
  retryLimit?: number; // Defaults to 2.
  retryBackoffLimit?: number; // Defaults to 3 seconds.
  debug?: boolean;
  allowBrowser?: boolean; // Defaults to false. Intended for local development only.
  cache?: {
    enabled?: boolean;
    /**
     * Minutes.
     *
     * @deprecated Use `refreshFrequencyMinutes` instead.
     */
    refreshFrequency?: number;
    refreshFrequencyMinutes?: number; // Minutes. Defaults to 180 (3 hours).
    maxSize?: number; // Defaults to 1000 entries.
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
  options?: unknown;
  section?: string | null;
  hidden?: boolean;
  internal_only?: boolean;
}

export interface CreateOptions {
  idempotencyKey?: string | false;
  retry?: boolean;
}

// ---------------------------------------------------------------------------
// Pet types
// ---------------------------------------------------------------------------

export type PetSpecies = "dog" | "cat" | "rabbit";
export type PetAgeCategory = "youngest" | "young" | "adult" | "senior";
export type PetSex = "male" | "female" | "unknown";
export type PetSize = "xSmall" | "small" | "medium" | "large" | "xLarge";
export type PetHealthStatus = "unknown" | "poor" | "good" | "great";
export type PetStatus =
  | "adopted"
  | "archived"
  | "available"
  | "deceased"
  | "escaped"
  | "euthanized"
  | "fostered"
  | "hold"
  | "intake"
  | "lost"
  | "medicalHold"
  | "medicalTreatment"
  | "other"
  | "pending"
  | "quarantine"
  | "recoveryPeriod"
  | "returnedToOwner"
  | "stray"
  | "surrendered"
  | "transferred";
export type PetCompatibility =
  | "activeLifestyle"
  | "cats"
  | "disabledMental"
  | "disabledPhysical"
  | "dogs"
  | "families"
  | "firstTimeOwners"
  | "frequentTravelers"
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

/**
 * Pet object returned by the API (list, get, and getById endpoints).
 */
export interface Pet {
  id: string;
  name: string;
  species: PetSpecies;
  age_category: PetAgeCategory;
  sex: PetSex;
  size: PetSize;
  status: PetStatus | (string & {});
  health: PetHealthStatus;
  breed: string[];
  color: string[];
  age_years: string | null;
  age_months: string | null;
  age_birthday: string | null;
  description: string;
  spayed: boolean;
  adoption_fee: string;
  global_adoption_fee?: number | null;
  microchip_id: string | null;
  good_with: PetCompatibility[];
  bad_with: PetCompatibility[];
  temperaments: PetTemperament[];
  image_urls: string[];
  image_url: string | null;
  coat_length: string | null;
  custom_field_data: Record<string, unknown>;
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
  created_at: string;
  updated_at: string;
}

export interface PetCreateInput {
  name: string;
  species: PetSpecies;
  age_category: PetAgeCategory;
  sex: PetSex;
  size: PetSize;
  status: PetStatus | (string & {});
  health: PetHealthStatus;
  breed?: string[];
  color?: string[];
  /**
   * @deprecated Use `breed` instead.
   */
  breeds?: string[];
  /**
   * @deprecated Use `color` instead.
   */
  colors?: string[];
  age_years?: string;
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
  custom_field_data?: Record<string, unknown>;
  custom_id?: string;
  custom_status_id?: string;
  intake_date?: string;
  location_found?: string;
  outcome_date?: string;
  primary_veterinarian_id?: string;
  reason_for_surrender?: string;
  show_public?: boolean;
  /**
   * @deprecated Use `show_public` instead.
   */
  is_published?: boolean;
  special_needs?: string[];
  status_change_notes?: string;
  template_id?: string;
  weight?: string;
}

export interface PetListParams {
  limit?: number;
  offset?: number;
  species?: string;
  status?: string;
  search?: string;
  updated_since?: string;
}

export type PetListResponse = PaginatedResponse<Pet>;

export type PetCustomField = CustomField;

export interface PetCustomFieldsResponse {
  custom_fields: PetCustomField[];
}

export type CreatePetOptions = CreateOptions;

// ---------------------------------------------------------------------------
// Person types (adopters, fosters, surrenders & volunteers)
// ---------------------------------------------------------------------------

export type PersonType = "adopter" | "foster" | "surrender" | "volunteer";
export type PersonStatus =
  | "pending"
  | "active"
  | "training"
  | "inactive"
  | "denied"
  | "suspended"
  | "blocked";
export type PersonCreateStatus = "pending" | "active" | "training" | "inactive";

/**
 * Person (adopter, foster, surrender, or volunteer) object returned by the API.
 */
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
  capacity: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonCreateInput {
  type: PersonType;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: PersonCreateStatus;
  custom_field_data?: Record<string, unknown>;
  capacity?: number | null;
  /** Surrender-only pet links to attach to the surrender record. */
  pets?: SurrenderPetCreateInput[];
}

export interface SurrenderPetCreateInput {
  /** Existing pet ID to link, or omit when using `create`. */
  pet_id?: string | null;
  /** Pet payload for the SDK to create and link to the surrender. */
  create?: PetCreateInput;
  reason?: string | null;
  urgency?: "low" | "normal" | "high" | "urgent" | (string & {});
  notes?: string | null;
  custom_data?: Record<string, unknown>;
}

export interface PersonListParams {
  type: PersonType;
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
  updated_since?: string;
}

export interface PersonListResponse extends PaginatedResponse<Person> {
  type: PersonType;
}

export type PersonCustomField = CustomField;

export interface PersonCustomFieldsResponse {
  type: PersonType;
  custom_fields: CustomField[];
}

export type CreatePersonOptions = CreateOptions;

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

export type ContractType = "adopter" | "foster" | "volunteer" | "surrender";

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
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface ApiResponseMeta {
  requestId?: string;
  apiVersion?: string;
  generatedAt?: string;
  rateLimit?: RateLimitInfo;
  idempotencyReplay?: boolean;
}
