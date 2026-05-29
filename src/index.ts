// Client
export { PawPlacerClient } from "./client";

// Types
export * from "./types";

// Errors
export {
  normalizeApiError,
  PawPlacerApiError,
  PawPlacerResponseValidationError,
  throwApiError,
  throwIfApiError,
} from "./errors";

// Resource APIs (for advanced usage / subclassing)
export { AdoptionFeesApi } from "./resources/adoption-fees";
export { ContractsApi } from "./resources/contracts";
export { PeopleApi } from "./resources/people";
export { PetsApi } from "./resources/pets";

// Cache (for advanced cache management)
export { CacheManager } from "./cache";
export type {
  CacheSettings,
  CachePolicy,
  CacheSnapshot,
  CacheMetrics,
} from "./cache";

// Request layer (for advanced usage)
export { RequestManager } from "./request-manager";
export type {
  RequestOptions,
  RequestCacheOptions,
  KyRequestOptions,
} from "./request-manager";

// Validators (for advanced usage / custom response handling)
export {
  validateAdoptionFeesResponse,
  validateContractResponse,
  validatePerson,
  validatePersonCustomFieldsResponse,
  validatePersonListResponse,
  validatePet,
  validatePetCustomFieldsResponse,
  validatePetListResponse,
} from "./validation";
