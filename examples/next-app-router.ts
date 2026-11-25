// Next.js App Router reference. Keep the SDK in route handlers, server
// actions, and server components. Never import it from a client component.

import {
  PawPlacerApiError,
  PawPlacerClient,
  type PersonCreateInput,
  type PetCreateInput,
  type PetSpecies,
} from "pawplacer-sdk";

const pawplacer = new PawPlacerClient();

// app/api/pets/route.ts
export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const result = await pawplacer.pets.list({
      status: "available",
      species: (url.searchParams.get("species") as PetSpecies | null) ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: 12,
    });

    return Response.json({
      pets: result.data,
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error instanceof PawPlacerApiError) {
      return Response.json(
        { error: error.message, requestId: error.requestId },
        { status: error.status >= 500 ? 502 : error.status },
      );
    }
    throw error;
  }
}

// app/pets/actions.ts
export async function createPetAction(
  input: PetCreateInput & { formSubmissionId: string },
) {
  "use server";

  const { formSubmissionId, ...pet } = input;
  // Key on the form submission, not on pet fields: two different dogs can
  // both be named Max.
  return pawplacer.pets.create(pet, {
    idempotencyKey: `create-pet:${formSubmissionId}`,
  });
}

// app/adopters/page.tsx
export async function getActiveAdopters() {
  const result = await pawplacer.people.list({
    type: "adopter",
    status: "active",
    limit: 50,
  });
  return result.data;
}

// app/adopt/[petId]/page.tsx
export async function getAdoptionFormData() {
  const [fields, contract] = await Promise.all([
    pawplacer.people.getCustomFields("adopter"),
    pawplacer.contracts.get("adopter"),
  ]);

  return {
    fields: fields.filter((field) => !field.hidden && !field.internal_only),
    contractMarkdown: contract.content,
  };
}

// app/adopt/[petId]/actions.ts
export async function submitAdoptionApplicationAction(
  input: Pick<
    PersonCreateInput,
    "name" | "email" | "phone" | "address" | "custom_field_data"
  > & {
    /** crypto.randomUUID() generated when the form loads, reused on retries. */
    submissionId: string;
    petId: string;
    termsAccepted: boolean;
  },
) {
  "use server";

  if (!input.termsAccepted) {
    throw new Error("The adoption contract must be accepted");
  }

  return pawplacer.people.create(
    {
      type: "adopter",
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      custom_field_data: input.custom_field_data,
      application: { pet_ids: [input.petId], terms_accepted: true },
    },
    { idempotencyKey: input.submissionId },
  );
}
