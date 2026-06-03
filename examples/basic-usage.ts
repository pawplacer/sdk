import {
  PawPlacerApiError,
  PawPlacerClient,
  type PersonCreateInput,
  type PetCreateInput,
} from "pawplacer-sdk";

export function createPawPlacerClient(apiKey = process.env.PAWPLACER_API_KEY) {
  const trimmedApiKey = apiKey?.trim();
  if (!trimmedApiKey) {
    throw new Error(
      "Set PAWPLACER_API_KEY on the server. Generate a key in Settings > SDK & API.",
    );
  }

  return new PawPlacerClient({
    apiKey: trimmedApiKey,
    cache: { enabled: true, refreshFrequencyMinutes: 180 },
  });
}

export async function listAvailableDogs(pawplacer: PawPlacerClient) {
  const result = await pawplacer.pets.list({
    status: "available",
    species: "dog",
    limit: 12,
  });

  return {
    pets: result.data,
    total: result.total,
    hasMore: result.hasMore,
    rateLimit: pawplacer.lastResponseMeta.rateLimit,
  };
}

export async function loadPetProfile(
  pawplacer: PawPlacerClient,
  petId: string,
) {
  const pet = await pawplacer.pets.get(petId);
  const fields = await pawplacer.pets.getCustomFields();

  return {
    pet,
    customFieldKeys: fields.map((field) => field.field_key),
  };
}

export async function listPeopleByRole(pawplacer: PawPlacerClient) {
  const [adopters, fosters, volunteers] = await Promise.all([
    pawplacer.people.list({ type: "adopter", status: "active", limit: 25 }),
    pawplacer.people.list({ type: "foster", status: "active", limit: 25 }),
    pawplacer.people.list({
      type: "volunteer",
      status: "active",
      limit: 25,
    }),
  ]);

  return {
    adopters: adopters.data,
    fosters: fosters.data,
    volunteers: volunteers.data,
  };
}

export async function loadAccountReferenceData(pawplacer: PawPlacerClient) {
  const [adoptionFees, adopterFields, contract] = await Promise.all([
    pawplacer.adoptionFees.get(),
    pawplacer.people.getCustomFields("adopter"),
    pawplacer.contracts.get("adopter"),
  ]);

  return {
    adoptionFees,
    adopterFieldKeys: adopterFields.map((field) => field.field_key),
    adoptionContractMarkdown: contract.content,
  };
}

export const petCreatePayload = {
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

export async function createPetFromBackendJob(
  pawplacer: PawPlacerClient,
  externalPetId: string,
) {
  return pawplacer.pets.create(petCreatePayload, {
    idempotencyKey: `pet-sync:${externalPetId}`,
  });
}

export async function updatePetFromWebsiteSync(
  pawplacer: PawPlacerClient,
  externalPetId: string,
) {
  return pawplacer.pets.update(
    externalPetId,
    {
      description: "Updated bio from the website CMS.",
      status: "available",
      image_urls: ["https://example.com/max.jpg"],
      show_public: true,
      custom_id: externalPetId,
    },
    {
      idempotencyKey: `pet-sync:${externalPetId}:update`,
    },
  );
}

export const surrenderCreatePayload = {
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
  ],
} satisfies PersonCreateInput;

export async function createSurrenderIntake(
  pawplacer: PawPlacerClient,
  intakeId: string,
) {
  return pawplacer.people.create(surrenderCreatePayload, {
    idempotencyKey: `surrender-intake:${intakeId}`,
  });
}

export function formatPawPlacerError(error: unknown) {
  if (error instanceof PawPlacerApiError) {
    return `PawPlacer API error ${error.status}: [${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
