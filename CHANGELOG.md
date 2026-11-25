# Changelog

All notable changes to `pawplacer-sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-11-25

### Fixed

- After a 304 revalidation, cached responses stay fresh for the API's `max-age` (60 seconds). Before, they fell back to a 3-hour default.
- `pets.update(..., { retry: false })` and `{ idempotencyKey: false }` no longer retry the PATCH. The client retried every PATCH by default.
- Cached `ETag` bodies are no longer kept in a second, unbounded map when the cache is disabled.
- `lastResponseMeta.rateLimit` is omitted when the API reports `X-RateLimit-Remaining: -1`, which means usage wasn't known.

### Added

- `pets.listAll(params)` and `people.listAll(params)` return async iterators that fetch every page.
- `pets.update` can clear fields: `[]` clears lists and `""` clears text fields such as `description`, `weight`, and `intake_date`. Before, the SDK stripped empty values, so they never reached the API.
- Types now match what the API sends:
  - `PetSpecies` includes all 10 species (`horse`, `small_furry`, `bird`, `barnyard`, `reptile`, `scales_fins_other`, and `invertebrate` were missing).
  - `PetCompatibility` includes `houseTrained`.
  - `Pet` has `hold_until` and `is_sample`.
  - `Person` has the volunteer fields `skills`, `interests`, `preferred_roles`, and `languages`. `people.create` accepts them.
  - `PersonApplicationCreateInput` accepts `template_id` (the API returns 409 `form_changed` if the form changed since) and `external_user_id`.
- `PetUpdateInput`, `WriteOptions`, `PERSON_TYPES`, `CONTRACT_TYPES`, and `SDK_VERSION` are exported.
- `lastResponseMeta.sampleData` is `true` while the account has sample data active (from the `X-PawPlacer-Sample-Data` response header). API keys now work in sample workspaces, and responses include the sample records. `Pet.is_sample` marks sample pets.
- Requests send `User-Agent: pawplacer-sdk/<version>`.

### Changed

- **Node 22.12 or newer is required.** 1.6.x already depended on ky 2, which requires Node 22; the old `>=18` in package.json was wrong. 22.12 is the first release that can `require()` ky from the CommonJS build without a flag.
- Every non-2xx response throws `PawPlacerApiError`, including responses without a PawPlacer error body (`code` is `http_<status>`). `status` is always set. Code that caught ky's `HTTPError` should catch `PawPlacerApiError` instead.
- Caching follows the API's `Cache-Control` header: 60 seconds fresh, then 5 minutes of stale-while-revalidate. If a refresh fails, the SDK keeps serving the last good response. Eviction is now least-recently-used.
- `cache.refreshFrequencyMinutes` is replaced by `cache.ttlSeconds`. The old option was silently overridden by the API's `Cache-Control` header. `ttlSeconds` really does override it.
- `pets.create` no longer requires `health`, matching the API.
- `Pet.status` is typed `string`. The API returns the status label (for example `"Available"`), not the camelCase name. `PetStatus` lists the account's default status names, and accepts any other string.
- Pet enum fields (`species`, `sex`, `size`, `age_category`, `health`) are typed to allow `""`, which the API returns when they aren't set.
- `SurrenderPetCreateInput.urgency` only accepts `low`, `normal`, `high`, or `urgent`. The API rejects any other value.
- `PawPlacerClient.pets`, `.people`, `.adoptionFees`, and `.contracts` are `readonly`.
- The published build is no longer minified, so stack traces are readable.

### Removed

These were deprecated or duplicated:

| Removed | Use instead |
| ------- | ----------- |
| `client.getPetById(id)` | `client.pets.get(id)` |
| `client.findPets(filter, limit)` | `client.pets.list({ ...filter, limit })` |
| `pets.getById`, `people.getById` | `pets.get`, `people.get` |
| `pets.findMany`, `people.findMany` | `(await list(params)).data`, or `listAll` |
| `pets.search(query)` | `pets.list({ search: query })` |
| `pets.getByStatus(status)` | `pets.list({ status })` |
| `PetCreateInput.breeds`, `.colors`, `.is_published` | `breed`, `color`, `show_public` |
| `cache.refreshFrequency`, `cache.refreshFrequencyMinutes` | `cache.ttlSeconds` |
| `invalidateCache()` with no argument | `clearCache()` |
| `CreateOptions`, `CreatePetOptions`, `CreatePersonOptions` | `WriteOptions` |
| `PetCustomField`, `PersonCustomField` | `CustomField` |

These internals were also exported and are no longer: `RequestManager`, `CacheManager`, `KyRequestOptions`, `RequestOptions`, `RequestCacheOptions`, `CacheSettings`, `CachePolicy`, `CacheMetrics`, the `validate*` functions, `normalizeApiError`, `throwApiError`, and `throwIfApiError`. The API never returns an error body with a 2xx status, so `throwIfApiError` had nothing to catch. `PetsApi`, `PeopleApi`, `AdoptionFeesApi`, and `ContractsApi` are still exported, as types only.

### Known API behavior (unchanged, now documented)

- `Pet.custom_id` and `Pet.microchip_id` are always `null` in responses. You can still update a pet by its `custom_id`.
- `pets.get` needs the pet UUID. Only `pets.update` accepts a `custom_id`.

## [1.6.2] - 2026-11-25

### Fixed

- API errors throw `PawPlacerApiError` again, with the API's message, `code`, `status`, and `requestId`. Since 1.6.0, ky 2 read the error body before the SDK could, so every non-2xx response surfaced as ky's generic "Request failed with status code ..." `HTTPError` and the API's message was lost.

## [1.6.1] - 2026-08-12

### Changed

- Documented the raised per-key API rate limits: reads are now 2,000/hour for list endpoints and 5,000/hour for single-record endpoints, metadata endpoints (custom fields, adoption fees, contracts) are 50/hour, and writes are 250/hour. No SDK code changes are required. Limits are enforced server-side and still reported through `lastResponseMeta.rateLimit`.

## [1.6.0] - 2026-08-11

### Added

- `people.create` accepts adopter/foster `application` metadata with PawPlacer pet IDs and accepted terms, returning the created application alongside the pending person.
- Custom-field responses expose stable template, section, order, placeholder, and synced-column metadata for external form renderers.

### Fixed

- Request-layer declarations no longer force CommonJS NodeNext consumers to import the ESM-only `ky` type at runtime.

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
