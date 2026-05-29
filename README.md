# PawPlacer SDK

TypeScript/JavaScript client for the PawPlacer API. Server-side only.

---

## Installation

```bash
npm install pawplacer-sdk
```

## Setup

Generate an API key in **Settings > SDK & API**. Use a `read` key for websites and dashboards. Use a separate `write` key only for backend jobs that create records.

Store the key in a server-only environment variable and create one client per process:

```typescript
import { PawPlacerClient } from "pawplacer-sdk";

export const pawplacer = new PawPlacerClient({
  cache: { enabled: true, refreshFrequencyMinutes: 180 },
});
```

By default, the client reads `process.env.PAWPLACER_API_KEY`. You can also pass `apiKey` explicitly when you need to use a different environment variable or credential source.

---

## Pets

### List pets

```typescript
const result = await pawplacer.pets.list({
  status: "available",
  species: "dog",
  limit: 12,
});

result.data; // Pet[]
result.total; // total count
result.hasMore; // pagination
```

Filters: `limit`, `offset`, `species`, `status`, `search`, `updated_since` (ISO-8601). The API clamps `limit` to 100.

### Get a pet

```typescript
const pet = await pawplacer.pets.get("pet-uuid");
```

### Create a pet

```typescript
const pet = await pawplacer.pets.create({
  name: "Max",
  species: "dog",
  age_category: "young",
  sex: "male",
  size: "medium",
  status: "available",
  health: "good",
});
```

All fields above are required. Optional: `breed`, `color`, `description`, `adoption_fee`, `good_with`, `temperaments`, `image_urls`, `custom_field_data`, and more.

### Custom fields

```typescript
const fields = await pawplacer.pets.getCustomFields();
// Use to validate custom_field_data before creating pets
```

---

## People (Adopters, Fosters, Surrenders & Volunteers)

All people endpoints require a `type` parameter: `"adopter"`, `"foster"`, `"surrender"`, or `"volunteer"`.

### List people

```typescript
const result = await pawplacer.people.list({
  type: "adopter",
  status: "active",
  limit: 25,
});

result.data; // Person[]
result.type; // "adopter"
result.total;
result.hasMore;
```

Filters: `type` (required), `limit`, `offset`, `status`, `search`, `updated_since`.

### Get a person

```typescript
const adopter = await pawplacer.people.get("person-uuid", "adopter");
```

### Create a person

```typescript
const adopter = await pawplacer.people.create({
  type: "adopter",
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "555-0100",
  status: "active",
  custom_field_data: { has_yard: true },
});
```

Only `type` and `name` are required. Optional: `email`, `phone`, `address`, `status`, `status_change_notes`, `custom_field_data`, `capacity`.

```typescript
const surrender = await pawplacer.people.create({
  type: "surrender",
  name: "Sam Surrender",
  email: "sam@example.com",
  custom_field_data: { reason_for_surrender: "Moving" },
  pets: [
    {
      create: {
        name: "Buddy",
        species: "dog",
        age_category: "adult",
        sex: "male",
        size: "large",
        status: "intake",
        health: "unknown",
        breed: ["Lab Mix"],
      },
      reason: "Moving",
      urgency: "high",
    },
    {
      pet_id: "existing-pet-uuid",
      notes: "Link this surrender to an existing pet profile",
    },
  ],
});
```

For surrenders, `pets` creates related surrender pet links in the same workflow. Use `create` with the normal pet create payload when the SDK should create and link a new pet, or `pet_id` to link an existing pet.

```typescript
const volunteer = await pawplacer.people.create({
  type: "volunteer",
  name: "Val Volunteer",
  email: "val@example.com",
  custom_field_data: { preferred_shift: "Saturday" },
});
```

### Custom fields

```typescript
const fields = await pawplacer.people.getCustomFields("adopter");
// Returns custom fields configured for adopter, foster, surrender, or volunteer forms
```

---

## Adoption Fees

Returns the account's full adoption fee configuration (species + attribute + adjustment rules).

```typescript
const fees = await pawplacer.adoptionFees.get();
// AdoptionFeeEntry[] — { species, attribute_type, attribute_value, adjustment }
```

Pets also include a `global_adoption_fee` field when the account has fee rules configured and the pet has no manual override.

---

## Contracts

Returns terms & conditions content for a given contract type. Content is markdown.

```typescript
const contract = await pawplacer.contracts.get("adopter");
contract.type; // "adopter"
contract.content; // markdown string
contract.updated_at; // ISO-8601 or null
```

Valid types: `"adopter"`, `"foster"`, `"volunteer"`, `"surrender"`.

---

## API Surface

| Method                            | HTTP                                         |
| --------------------------------- | -------------------------------------------- |
| `pets.list(params?)`              | `GET /api/pets`                              |
| `pets.get(id)`                    | `GET /api/pets/{id}`                         |
| `pets.getById(id)`                | `GET /api/pets/{id}`                         |
| `pets.findMany(params?, limit?)`  | `GET /api/pets` (returns `Pet[]`)            |
| `pets.search(query)`              | `GET /api/pets` (returns `Pet[]`)            |
| `pets.getByStatus(status)`        | `GET /api/pets` (returns `Pet[]`)            |
| `pets.getCustomFields()`          | `GET /api/pets/custom-fields`                |
| `pets.create(payload)`            | `POST /api/pets`                             |
| `people.list(params)`             | `GET /api/people?type=`                      |
| `people.get(id, type)`            | `GET /api/people/{id}?type=`                 |
| `people.getById(id, type)`        | `GET /api/people/{id}?type=`                 |
| `people.findMany(params, limit?)` | `GET /api/people?type=` (returns `Person[]`) |
| `people.create(payload)`          | `POST /api/people`                           |
| `people.getCustomFields(type)`    | `GET /api/people/custom-fields?type=`        |
| `adoptionFees.get()`              | `GET /api/adoption-fees`                     |
| `contracts.get(type)`             | `GET /api/contracts?type=`                   |

---

## Idempotency

Every `create` call automatically sends an `Idempotency-Key` header, which makes SDK-managed retries safe. For background jobs that may replay across restarts, pass a stable key:

```typescript
const pet = await pawplacer.pets.create(
  {
    name: "Max",
    species: "dog",
    age_category: "young",
    sex: "male",
    size: "medium",
    status: "available",
    health: "good",
  },
  { idempotencyKey: `nightly-sync:${externalId}` },
);

pawplacer.lastResponseMeta.idempotencyReplay; // true if replayed
```

Pass `{ idempotencyKey: false }` to opt out.

---

## Caching

GET responses are cached in memory with stale-while-revalidate. The cache is per-process.

```typescript
cache: {
  enabled: true,
  refreshFrequencyMinutes: 60, // minutes; defaults to 180
}
```

When the API returns `Cache-Control` headers, those take precedence. `no-store` or `max-age=0` bypasses the cache entirely.

```typescript
pawplacer.clearCache(); // drop everything
pawplacer.invalidateCache("pets:list:"); // substring match
pawplacer.invalidateCache(/^people:/); // regex match
pawplacer.cacheStats(); // { hits, misses, size }
```

---

## Error Handling

```typescript
import {
  PawPlacerApiError,
  PawPlacerResponseValidationError,
} from "pawplacer-sdk";

try {
  await pawplacer.pets.create({
    name: "Max",
    species: "dog",
    age_category: "young",
    sex: "male",
    size: "medium",
    status: "available",
    health: "good",
  });
} catch (error) {
  if (error instanceof PawPlacerApiError) {
    console.error(error.status, error.code, error.message);
  } else if (error instanceof PawPlacerResponseValidationError) {
    console.error("Unexpected response shape:", error.payload);
  }
}
```

`PawPlacerApiError` is thrown for structured API errors (non-2xx). `PawPlacerResponseValidationError` is thrown when a 2xx response doesn't match the expected shape.

Custom parsing: `throwIfApiError(payload)` throws `PawPlacerApiError` for error payloads.

Common status codes:

| Status | Cause                                           |
| ------ | ----------------------------------------------- |
| 400    | Validation or payload error                     |
| 401    | Missing or invalid API key                      |
| 403    | Key doesn't have scope for this endpoint        |
| 404    | Resource not found                              |
| 409    | Idempotency key reused with a different payload |
| 429    | Rate limited                                    |

---

## Rate Limits

Rate limits are per API key. Headers are exposed via `pawplacer.lastResponseMeta.rateLimit`.

| Endpoint                        | Requests / hour |
| ------------------------------- | --------------- |
| `GET /api/pets`                 | 100             |
| `GET /api/pets/{id}`            | 400             |
| `GET /api/pets/custom-fields`   | 15              |
| `POST /api/pets`                | 10              |
| `GET /api/people`               | 100             |
| `GET /api/people/{id}`          | 400             |
| `GET /api/people/custom-fields` | 15              |
| `POST /api/people`              | 10              |
| `GET /api/adoption-fees`        | 15              |
| `GET /api/contracts`            | 15              |

---

## Response Metadata

```typescript
const result = await pawplacer.pets.list({ status: "available" });

pawplacer.lastResponseMeta.rateLimit; // { limit, remaining, reset }
pawplacer.lastResponseMeta.requestId; // for support tickets
pawplacer.lastResponseMeta.idempotencyReplay; // true if replayed
```

`lastResponseMeta` reflects the most recent API call.

---

## Configuration

```typescript
const client = new PawPlacerClient({
  apiKey: process.env.PAWPLACER_API_KEY, // optional when PAWPLACER_API_KEY is set
  apiUrl: "https://pawplacer.com",
  timeout: 30000,
  retryLimit: 2,
  retryBackoffLimit: 3000,
  debug: false,
  allowBrowser: false,
  cache: {
    enabled: true,
    refreshFrequencyMinutes: 180,
    maxSize: 1000,
  },
});
```

The SDK blocks browser usage by default to protect your API key. Set `allowBrowser: true` only for local development.
`cache.refreshFrequency` is accepted for backward compatibility, but deprecated. Use `cache.refreshFrequencyMinutes` for new code.

Deprecated aliases:

| Alias                         | Use instead                     |
| ----------------------------- | ------------------------------- |
| `client.getPetById(...)`      | `client.pets.get(...)`          |
| `client.findPets(...)`        | `client.pets.findMany(...)`     |
| `cache.refreshFrequency`      | `cache.refreshFrequencyMinutes` |
| `PetCreateInput.breeds`       | `PetCreateInput.breed`          |
| `PetCreateInput.colors`       | `PetCreateInput.color`          |
| `PetCreateInput.is_published` | `PetCreateInput.show_public`    |

---

## Next.js

```typescript
// app/api/pets/route.ts
import { PawPlacerClient } from "pawplacer-sdk";

const client = new PawPlacerClient({});

export async function GET() {
  const pets = await client.pets.list({ status: "available", limit: 12 });
  return Response.json(pets);
}
```

Keep the SDK in API routes, server actions, or `getServerSideProps`. Never use it in client components.

---

## Types

All types are exported directly:

**Shared:** `CustomField`, `PaginatedResponse<T>`, `CreateOptions`, `ApiError`, `RateLimitInfo`, `ApiResponseMeta`

**Pets:** `Pet`, `PetCreateInput`, `PetListParams`, `PetSpecies`, `PetAgeCategory`, `PetSex`, `PetSize`, `PetHealthStatus`, `PetCompatibility`, `PetTemperament`, `PetCustomField` (alias for `CustomField`), `CreatePetOptions` (alias for `CreateOptions`)

**People:** `Person`, `PersonCreateInput`, `PersonListParams`, `PersonListResponse`, `PersonType`, `PersonStatus`, `PersonCustomField` (alias for `CustomField`), `PersonCustomFieldsResponse`, `CreatePersonOptions` (alias for `CreateOptions`)

**Adoption Fees:** `AdoptionFeeEntry`, `AdoptionFeesResponse`

**Contracts:** `ContractResponse`, `ContractType`

---

## CommonJS

```javascript
const { PawPlacerClient } = require("pawplacer-sdk");

const client = new PawPlacerClient();

async function main() {
  const pets = await client.pets.list({ status: "available" });
  const adopters = await client.people.list({ type: "adopter" });

  console.log({ pets: pets.total, adopters: adopters.total });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

## Examples

- [`examples/basic-usage.ts`](./examples/basic-usage.ts): Node/TypeScript usage across pets, people, adoption fees, and contracts. Create examples only run when `PAWPLACER_EXAMPLE_WRITES=true`.
- [`examples/next-app-router.ts`](./examples/next-app-router.ts): Next.js App Router server-only usage.

---

## Resources

- [SDK documentation](https://pawplacer.com/docs/integrations/sdk)
- [Developer API overview](https://pawplacer.com/docs/integrations/developer-api)
- [OpenAPI spec](https://pawplacer.com/openapi/public-api-v1.yaml)
