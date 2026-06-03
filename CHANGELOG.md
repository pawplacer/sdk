# Changelog

All notable changes to `pawplacer-sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-06-12

### Changed

- `people.create` now types create-time `status` as `PersonCreateStatus` (`pending`, `active`, `training`, or `inactive`) and no longer accepts `status_change_notes`; admin review states remain controlled by the PawPlacer API. This was already being stripped in the rpc, so this is effectively a non-change.

### Added

- `pets.update(idOrCustomId, payload, options?)` for partial pet updates through `PATCH /api/pets/{idOrCustomId}`.

## [1.4.0] - 2026-05-31

### Added

- Example files are now typechecked as part of `npm run check`.

### Fixed

- Deprecated duplicate aliases are now marked in TypeScript docs and README guidance while remaining backward compatible.
- `examples/basic-usage.ts` now keeps create calls opt-in so running the example is read-only by default.
- Create payload validation now rejects malformed `adoption_fee`, `custom_field_data`, `capacity`, and surrender pet `custom_data` values before sending a request.
- README snippets now use copyable, complete examples for configuration, idempotent creates, error handling, and CommonJS usage.
- `people.create` now rejects `pets` on non-surrender people before any pet creation side effects.
- Surrender pet links are fully validated before the SDK creates any new pets for a surrender intake.

### Added

- Surrender support in the People API. `PersonType` now accepts `"surrender"` for `people.list`, `people.get`, `people.getById`, `people.findMany`, `people.create`, and `people.getCustomFields`.
- Surrender pet intake items can be included during `people.create({ type: "surrender", pets: [...] })`.
- Volunteer support in the People API. `PersonType` now accepts `"volunteer"` for `people.list`, `people.get`, `people.getById`, `people.findMany`, `people.create`, and `people.getCustomFields`.

## [1.3.1] - 2026-05-02

### Added

- `hidden` and `internal_only` metadata on `CustomField` responses when returned by the API, so SDK consumers can filter fields without matching labels.

## [1.3.0] - 2026-04-10

### Added

- **People API** (`client.people`) — list, get, create, and getCustomFields for adopters and fosters via `GET/POST /api/people`. All endpoints require a `type` parameter (`"adopter"` or `"foster"`).
- **Adoption Fees API** (`client.adoptionFees`) — fetch the account's adoption fee configuration via `GET /api/adoption-fees`.
- **Contracts API** (`client.contracts`) — fetch terms & conditions markdown via `GET /api/contracts?type=adopter|foster|volunteer|surrender`.
- `global_adoption_fee` field on `Pet` responses — the resolved fee from the account's fee rules when no manual override is set.
- New types: `Person`, `PersonCreateInput`, `PersonListParams`, `PersonListResponse`, `PersonType`, `PersonStatus`, `PersonCustomField`, `PersonCustomFieldsResponse`, `CreatePersonOptions`, `AdoptionFeeEntry`, `AdoptionFeesResponse`, `ContractResponse`, `ContractType`.
- Shared types: `CustomField` (base for both pet and person custom fields), `CreateOptions` (base for pet and person create options), `PetListResponse` (type alias for `PaginatedResponse<Pet>`).
- `throwIfApiError(payload)` utility for one-line API error checking.

### Changed

- Internal custom field and create option helpers are shared across resources. Existing `PetCustomField` and `CreatePetOptions` interfaces remain available.

### Compatibility Notes

- This is a semver-minor upgrade and is fully backward compatible.
- Existing `PetCustomField` and `CreatePetOptions` imports continue to work as before.
- No existing methods were changed or removed.

## [1.2.0] - 2026-03-15

### Added

- Idempotency key support for `pets.create(data, { idempotencyKey })`. When provided, the API guarantees at-most-once creation even if the request is retried. Keys are valid for 24 hours. POST requests are automatically retried on transient failures when an idempotency key is present.
- `lastResponseMeta` on `PawPlacerClient` exposing rate limit info (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`), request ID, API version, and idempotency replay status from the most recent API response.
- New types: `CreatePetOptions`, `RateLimitInfo`, `ApiResponseMeta`.
- `PawPlacerApiError` class extending `Error` with first-class `code`, `requestId`, and `apiError` properties for structured error handling.
- ETag / conditional request support: the SDK stores `ETag` headers from API responses and sends `If-None-Match` on subsequent cached GET requests. When the API responds with `304 Not Modified`, the SDK returns cached data without re-downloading the payload.
- `CacheManager.peek(key)` method for reading cached values regardless of TTL.

### Changed

- `throwApiError` now throws `PawPlacerApiError` (extends `Error`) instead of a plain `Error`. The `code` and `requestId` fields are now accessible directly on the error object, in addition to the existing `apiError` property.
- Cache invalidation (`invalidate`, `invalidateMatching`, `clearCache`) now also clears stored ETags for the affected entries.

### Compatibility Notes

- This is a semver-minor upgrade and is intended to be backward compatible.
- `pets.create(data)` continues to work without the second argument.
- `PawPlacerApiError` extends `Error`, so existing `catch` blocks continue to work. The new `.code` and `.requestId` properties are additive.

## [1.1.0] - 2026-02-17

### Added

- Expanded `Pet` response typing to match the full public pet payload from `GET /api/pets` and `GET /api/pets/{id}`.
- Added `tags` to `Pet` as a string array of pet tag labels.
- Added `updated_since` filter support to `pets.list(...)` for incremental sync workflows.
- Published OpenAPI 3.1 contract URL in docs for non-JS client generation and tooling imports.
- Added `allowBrowser?: boolean` config guard for explicit browser opt-in during local development.
- Added normalized API error support for `{ error }`, `{ message }`, and `{ errors }` payloads with details attached to `error.apiError`.
- Added `is_published` as an input alias for `show_public` in `pets.create(...)`.

### Changed

- Request deduplication now applies only to `GET` requests, avoiding mutation coupling.
- API base URL is normalized to avoid duplicate slashes.

### Removed

- No SDK methods were removed in this release.

### Compatibility Notes

- This is a semver-minor upgrade and is intended to be backward compatible.
- Existing integrations continue to work without code changes.

## [1.0.1] - 2026-02-16

### Changed

- Initial stable SDK packaging and docs polish.

## [1.0.0] - 2026-02-15

### Added

- First stable release of the official PawPlacer SDK.
