// Next.js App Router reference.
// Keep this code in API routes, server actions, or other server-only files.

import { PawPlacerClient, type PetCreateInput } from "pawplacer-sdk";

const pawplacer = new PawPlacerClient({
  cache: { enabled: true, refreshFrequencyMinutes: 60 },
});

// app/api/pets/route.ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const species = url.searchParams.get("species") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;

  const result = await pawplacer.pets.list({
    status: "available",
    species,
    search,
    limit: 12,
  });

  return Response.json({
    pets: result.data,
    total: result.total,
    hasMore: result.hasMore,
    requestId: pawplacer.lastResponseMeta.requestId,
  });
}

// app/pets/actions.ts
export async function createPetAction(input: PetCreateInput) {
  "use server";

  return pawplacer.pets.create(input, {
    idempotencyKey: `next-create-pet:${input.name}:${input.species}`,
  });
}

// app/adopters/page.tsx or a server component helper
export async function getActiveAdopters() {
  const result = await pawplacer.people.list({
    type: "adopter",
    status: "active",
    limit: 50,
  });

  return result.data;
}

// app/api/adoption-reference/route.ts
export async function getAdoptionReferenceData() {
  const [fees, contract, customFields] = await Promise.all([
    pawplacer.adoptionFees.get(),
    pawplacer.contracts.get("adopter"),
    pawplacer.people.getCustomFields("adopter"),
  ]);

  return {
    fees,
    contractMarkdown: contract.content,
    customFields,
  };
}
