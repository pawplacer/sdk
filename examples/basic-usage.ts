// Node/TypeScript reference. Each function takes a client so you can call it
// from a script, a job, or an API route.

import {
  PawPlacerApiError,
  PawPlacerClient,
  type Pet,
  type PersonCreateInput,
  type PetCreateInput,
} from "pawplacer-sdk";

// Reads PAWPLACER_API_KEY. Create one client per process and reuse it.
export const pawplacer = new PawPlacerClient();

export async function listAvailableDogs(client: PawPlacerClient) {
  const result = await client.pets.list({
    status: "available",
    species: "dog",
    limit: 12,
  });

  return {
    pets: result.data,
    total: result.total,
    hasMore: result.hasMore,
    rateLimit: client.lastResponseMeta.rateLimit,
  };
}

// listAll pages through every result for you.
export async function exportAllAvailablePets(client: PawPlacerClient) {
  const pets: Pet[] = [];
  for await (const pet of client.pets.listAll({ status: "available" })) {
    pets.push(pet);
  }
  return pets;
}

export async function loadPetProfile(client: PawPlacerClient, petId: string) {
  const [pet, fields] = await Promise.all([
    client.pets.get(petId),
    client.pets.getCustomFields(),
  ]);

  return {
    pet,
    customFields: fields
      .filter((field) => !field.hidden && !field.internal_only)
      .map((field) => ({
        label: field.label,
        value: pet.custom_field_data[field.field_key],
      })),
  };
}

export async function listActivePeople(client: PawPlacerClient) {
  const [adopters, fosters, volunteers] = await Promise.all([
    client.people.list({ type: "adopter", status: "active", limit: 25 }),
    client.people.list({ type: "foster", status: "active", limit: 25 }),
    client.people.list({ type: "volunteer", status: "active", limit: 25 }),
  ]);

  return {
    adopters: adopters.data,
    fosters: fosters.data,
    volunteers: volunteers.data,
  };
}

// Everything an adoption form needs: the questions, the contract to accept,
// and the fee rules.
export async function loadAdoptionFormData(client: PawPlacerClient) {
  const [fields, contract, fees] = await Promise.all([
    client.people.getCustomFields("adopter"),
    client.contracts.get("adopter"),
    client.adoptionFees.get(),
  ]);

  return {
    fields: fields.filter((field) => !field.hidden && !field.internal_only),
    contractMarkdown: contract.content,
    fees,
  };
}

export async function submitAdoptionApplication(
  client: PawPlacerClient,
  input: {
    /** UUID generated once per form submission and reused on retries. */
    submissionId: string;
    petId: string;
    name: string;
    email: string;
    phone?: string;
    answers: Record<string, unknown>;
  },
) {
  // Only call this after the applicant has seen and accepted the contract
  // from loadAdoptionFormData().
  return client.people.create(
    {
      type: "adopter",
      name: input.name,
      email: input.email,
      phone: input.phone,
      custom_field_data: input.answers,
      application: { pet_ids: [input.petId], terms_accepted: true },
    },
    { idempotencyKey: input.submissionId },
  );
}

export const examplePet = {
  name: "Max",
  species: "dog",
  age_category: "young",
  sex: "male",
  size: "medium",
  status: "available",
  health: "good",
  breed: ["Labrador Retriever"],
  color: ["Black"],
  good_with: ["families", "kids"],
  temperaments: ["playful", "social"],
  adoption_fee: 250,
} satisfies PetCreateInput;

// Stable keys make a re-run of the same job return the original result
// instead of creating a duplicate pet.
export async function syncPetFromYourSystem(
  client: PawPlacerClient,
  externalId: string,
  pet: PetCreateInput,
) {
  return client.pets.create(
    { ...pet, custom_id: externalId },
    { idempotencyKey: `pet-sync:${externalId}` },
  );
}

// Updates accept the custom_id you assigned. Send only what changed.
export async function updatePetFromYourSystem(
  client: PawPlacerClient,
  externalId: string,
  changes: { description?: string; imageUrls?: string[] },
) {
  return client.pets.update(externalId, {
    description: changes.description,
    image_urls: changes.imageUrls,
  });
}

export const exampleSurrender = {
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
        breed: ["Lab Mix"],
      },
      reason: "Moving",
      urgency: "high",
    },
  ],
} satisfies PersonCreateInput;

export async function createSurrenderIntake(
  client: PawPlacerClient,
  intakeId: string,
) {
  return client.people.create(exampleSurrender, {
    idempotencyKey: `surrender-intake:${intakeId}`,
  });
}

export function describeError(error: unknown): string {
  if (error instanceof PawPlacerApiError) {
    // error.requestId is what PawPlacer support will ask for.
    return `PawPlacer API ${error.status} ${error.code}: ${error.message} (request ${error.requestId})`;
  }
  return error instanceof Error ? error.message : String(error);
}
