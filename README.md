# PawPlacer SDK

TypeScript/JavaScript client for the PawPlacer API. Runs on the server (Node 22.12 or newer).

Upgrading from 1.x? See the [2.0.0 changelog](./CHANGELOG.md#200---2026-11-25).

## Install

```bash
npm install pawplacer-sdk
```

## Setup

Create an API key in PawPlacer under **Settings > SDK & API**. Use a `read` key for websites and dashboards, and a separate `write` key for jobs that create or update records.

Put the key in `PAWPLACER_API_KEY` on your server and create one client per process:

```typescript
import { PawPlacerClient } from "pawplacer-sdk";

export const pawplacer = new PawPlacerClient();
```

Pass `apiKey` if the key lives somewhere else. The client throws if it's constructed in a browser, because that would expose your key. Browser code should call your own backend route instead (see [examples](#examples)).

## Pets

### List

```typescript
const result = await pawplacer.pets.list({
  status: "available",
  species: "dog",
  limit: 12,
});

result.data; // Pet[]
result.total; // matching pets across all pages
result.hasMore; // true if there's another page
```

Filters: `status`, `species`, `search`, `updated_since` (ISO-8601), `limit` (1-100, default 20), and `offset`.

To go through every page, use `listAll`:

```typescript
for await (const pet of pawplacer.pets.listAll({ status: "available" })) {
  console.log(pet.name);
}
```

A pet's `status` comes back as its display label, such as `"Available"` or `"Medical Treatment"`. Filters and writes accept either the name (`"available"`) or the label.

### Get

```typescript
const pet = await pawplacer.pets.get("550e8400-e29b-41d4-a716-446655440001");
```

`get` takes the PawPlacer pet UUID.

### Create

```typescript
const pet = await pawplacer.pets.create({
  name: "Max",
  species: "dog",
  age_category: "young",
  sex: "male",
  size: "medium",
  status: "available",
});
```

Those six fields are required. Everything else is optional: `health`, `breed`, `color`, `description`, `adoption_fee`, `good_with`, `temperaments`, `image_urls`, `custom_id`, `custom_field_data`, and so on. See `PetCreateInput` for the full list.

If `status` doesn't match one of the account's statuses, the pet is created as `available`.

### Update

```typescript
const updated = await pawplacer.pets.update("DOG-2026-001", {
  description: "Loves long walks",
  image_urls: ["https://example.com/max.jpg"],
});
```

Pass the pet UUID or the `custom_id` you assigned. Send only the fields you want to change.

To clear a field, send an empty value: `[]` for lists like `image_urls` or `special_needs`, and `""` for text like `description`, `weight`, `intake_date`, or `adoption_fee`. `null` isn't accepted. `custom_field_data` is merged into the existing data, so keys you leave out are kept.

### Custom fields

```typescript
const fields = await pawplacer.pets.getCustomFields();
```

Returns the account's pet form fields. Use `field_key` as the key in `custom_field_data`. Skip fields with `hidden` or `internal_only` set when showing them to the public.

## People

People are adopters, fosters, surrenders, and volunteers. Every call takes a `type`: `"adopter"`, `"foster"`, `"surrender"`, or `"volunteer"`.

### List and get

```typescript
const adopters = await pawplacer.people.list({
  type: "adopter",
  status: "active",
  limit: 25,
});

const foster = await pawplacer.people.get("person-uuid", "foster");
```

`list` takes the same filters as pets (minus `species`), and `listAll` works the same way.

### Create

```typescript
const volunteer = await pawplacer.people.create({
  type: "volunteer",
  name: "Val Volunteer",
  email: "val@example.com",
  skills: ["dog walking"],
  custom_field_data: { preferred_shift: "Saturday" },
});
```

Only `type` and `name` are required. On create, `status` can be `pending`, `active`, `training` (not for adopters), or `inactive`. Review outcomes like `denied` are set in PawPlacer.

### Adoption and foster applications

To accept applications on your own site:

1. Load the form fields with `people.getCustomFields(type)` and the contract with `contracts.get(type)`.
2. Show both to the applicant, and have them accept the contract.
3. Call `people.create` with their answers and an `application`.

```typescript
const applicant = await pawplacer.people.create(
  {
    type: "adopter",
    name: "Jane Smith",
    email: "jane@example.com",
    custom_field_data: { housing_type: "house", has_yard: true },
    application: {
      pet_ids: ["550e8400-e29b-41d4-a716-446655440001"],
      terms_accepted: true,
    },
  },
  { idempotencyKey: submissionId },
);

applicant.status; // "pending"
applicant.application?.id;
```

An application can include 1 to 5 pets. It needs a UUID idempotency key. The SDK generates one if you don't pass it, but generating `submissionId` with `crypto.randomUUID()` when the form loads (and reusing it if the submit is retried) prevents duplicate applications.

### Surrenders

A surrender can link pets that already exist, or create new ones:

```typescript
await pawplacer.people.create(
  {
    type: "surrender",
    name: "Sam Surrender",
    email: "sam@example.com",
    pets: [
      {
        create: {
          name: "Buddy",
          species: "dog",
          age_category: "adult",
          sex: "male",
          size: "large",
          status: "intake",
        },
        reason: "Moving",
        urgency: "high",
      },
      { pet_id: "existing-pet-uuid", notes: "Already in PawPlacer" },
    ],
  },
  { idempotencyKey: `surrender:${intakeId}` },
);
```

Pets under `create` are created first with `pets.create`, and then the surrender is created with links to them. These are separate requests. If you pass an idempotency key, each pet gets a key derived from it (`<key>:pet:0`, `<key>:pet:1`, ...), so retrying the whole call won't create the pets twice.

## Adoption fees and contracts

```typescript
const fees = await pawplacer.adoptionFees.get();
// [{ species, attribute_type, attribute_value, adjustment }, ...]

const contract = await pawplacer.contracts.get("adopter");
contract.content; // markdown
contract.updated_at; // ISO-8601 or null
```

When an account has fee rules and a pet has no fee of its own, the pet's `global_adoption_fee` holds the computed fee.

## Writes, retries, and idempotency

Every `create` and `update` sends an `Idempotency-Key` header with a random UUID. That lets the SDK safely retry a write that timed out or got a 5xx or 429.

For jobs that might run again (a nightly sync, a queue worker), pass a key tied to your own record. A replay then returns the original result instead of writing twice:

```typescript
await pawplacer.pets.create(pet, { idempotencyKey: `pet-sync:${externalId}` });

pawplacer.lastResponseMeta.idempotencyReplay; // true if this was a replay
```

Reusing a key with a different payload returns a 409. Pass `{ idempotencyKey: false }` to send no key; the write is then not retried. Pass `{ retry: false }` to keep the key but turn off retries.

GETs are retried up to `retryLimit` times (default 2).

## Sample data

New PawPlacer workspaces can start with sample pets and people. Your account's API keys work while sample data is active, and responses include those sample records alongside any real ones. Partner keys are refused with 403 `sample_workspace_unavailable` until the sample data is gone. Use that to try the API, but don't point a website or sync job at it until you've chosen to keep the sample data or start fresh in **Settings > Danger Zone**.

You can check from code:

```typescript
const result = await pawplacer.pets.list();

pawplacer.lastResponseMeta.sampleData; // true while sample data is active
result.data.filter((pet) => !pet.is_sample); // just the real pets
```

Sample people don't have a per-record flag, so use `lastResponseMeta.sampleData` to decide whether to trust people data.

## Errors

```typescript
import {
  PawPlacerApiError,
  PawPlacerResponseValidationError,
} from "pawplacer-sdk";

try {
  await pawplacer.pets.update(id, { status: "adopted" });
} catch (error) {
  if (error instanceof PawPlacerApiError) {
    error.status; // 400
    error.code; // "validation_failed"
    error.message; // from the API
    error.requestId; // include this when contacting support
    error.apiError.details; // field-level problems, when there are any
  } else if (error instanceof PawPlacerResponseValidationError) {
    error.payload; // a 2xx response the SDK didn't recognize
  }
}
```

Every non-2xx response throws `PawPlacerApiError`. If the response has no PawPlacer error body (a gateway error, for example), `code` is `http_<status>`. Network failures and timeouts throw ky's `NetworkError` or `TimeoutError`.

Invalid input, such as a missing required field, throws a plain `Error` before any request is sent.

| Status | Usually means |
| ------ | ------------- |
| 400 | Invalid payload or query |
| 401 | Missing or invalid API key |
| 403 | The key's scope doesn't allow this (for example, a `read` key on a write) |
| 404 | Not found |
| 409 | Idempotency key reused with a different payload, or the application form changed |
| 429 | Rate limited. `lastResponseMeta.rateLimit.retryAfter` says how long to wait |

## Caching

GET responses are cached in memory, per process. The SDK follows the API's `Cache-Control` header. Today that means a response is reused for 60 seconds, then served for up to 5 more minutes while it's refreshed in the background. Refreshes send `If-None-Match`, so unchanged data comes back as a small 304. If a refresh fails, the last good response keeps being served.

Creates and updates clear the cached lists they affect.

```typescript
const pawplacer = new PawPlacerClient({
  cache: {
    ttlSeconds: 300, // reuse responses for 5 minutes instead of the API's 60 seconds
    maxSize: 1000, // max cached responses (default 1000)
  },
});

await pawplacer.pets.get(id, { forceRefresh: true }); // skip the cache once
pawplacer.invalidateCache("pets:list:"); // keys containing this string
pawplacer.invalidateCache(/^people:/); // or matching a regex
pawplacer.clearCache();
pawplacer.cacheStats(); // { hits, misses, refreshes, size, maxSize }
```

Turn it off with `cache: { enabled: false }`.

Cache keys are `pets:list:<query>`, `pets:get:<id>`, `pets:custom-fields`, `people:list:<query>`, `people:get:<type>:<id>`, `people:custom-fields:<type>`, `adoption-fees`, and `contracts:<type>`.

## Rate limits

Limits are per API key, per endpoint, per hour:

| Endpoint | Requests / hour |
| -------- | --------------- |
| `GET /api/pets`, `GET /api/people` | 2,000 |
| `GET /api/pets/{id}`, `GET /api/people/{id}` | 5,000 |
| `GET /api/pets/custom-fields`, `GET /api/people/custom-fields` | 50 |
| `GET /api/adoption-fees`, `GET /api/contracts` | 50 |
| `POST /api/pets`, `PATCH /api/pets/{id}`, `POST /api/people` | 250 |

Cache hits don't count. 304 revalidations do. Current usage is on `pawplacer.lastResponseMeta.rateLimit`:

```typescript
await pawplacer.pets.list();
pawplacer.lastResponseMeta.rateLimit; // { limit, remaining, reset }
pawplacer.lastResponseMeta.requestId;
```

`lastResponseMeta` reflects the most recent network response, so read it right after the call you care about.

## Configuration

```typescript
const pawplacer = new PawPlacerClient({
  apiKey: process.env.PAWPLACER_API_KEY, // default
  apiUrl: "https://pawplacer.com", // default
  timeout: 30_000, // ms per attempt
  retryLimit: 2,
  retryBackoffLimit: 3000, // max ms between retries
  debug: false, // log requests and retries with console.debug
  allowBrowser: false, // local testing only; exposes your key
  cache: { enabled: true, ttlSeconds: undefined, maxSize: 1000 },
});
```

## API reference

| Method | Request |
| ------ | ------- |
| `pets.list(params?)` | `GET /api/pets` |
| `pets.listAll(params?)` | `GET /api/pets`, every page |
| `pets.get(id)` | `GET /api/pets/{id}` |
| `pets.create(input, options?)` | `POST /api/pets` |
| `pets.update(idOrCustomId, input, options?)` | `PATCH /api/pets/{idOrCustomId}` |
| `pets.getCustomFields()` | `GET /api/pets/custom-fields` |
| `people.list(params)` | `GET /api/people?type=` |
| `people.listAll(params)` | `GET /api/people?type=`, every page |
| `people.get(id, type)` | `GET /api/people/{id}?type=` |
| `people.create(input, options?)` | `POST /api/people` |
| `people.getCustomFields(type)` | `GET /api/people/custom-fields?type=` |
| `adoptionFees.get()` | `GET /api/adoption-fees` |
| `contracts.get(type)` | `GET /api/contracts?type=` |

All request and response types are exported, for example `Pet`, `PetCreateInput`, `PetUpdateInput`, `PetListParams`, `Person`, `PersonCreateInput`, `CustomField`, `WriteOptions`, and `ApiResponseMeta`.

## Examples

- [`basic-usage.ts`](./examples/basic-usage.ts): reads, paging, syncing pets from another system, applications, surrenders, and error handling.
- [`next-app-router.ts`](./examples/next-app-router.ts): a Next.js route handler and server actions.
- [`react-vite-server-reference.ts`](./examples/react-vite-server-reference.ts) and [`react-vite-client-reference.ts`](./examples/react-vite-client-reference.ts): a backend route that uses the SDK, and the browser code that calls it.
- [`commonjs-reference.cjs`](./examples/commonjs-reference.cjs): `require` usage.

## More

- [SDK docs](https://pawplacer.com/docs/integrations/sdk)
- [Developer API overview](https://pawplacer.com/docs/integrations/developer-api)
- [OpenAPI spec](https://pawplacer.com/openapi/public-api-v1.yaml)
