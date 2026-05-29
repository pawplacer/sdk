// Example: Next.js App Router API routes using the PawPlacer SDK.
// All SDK usage runs on the server — never expose your API key to the client.

import { PawPlacerClient } from "pawplacer-sdk";

const pawplacer = new PawPlacerClient({
  cache: { enabled: true, refreshFrequency: 60 },
});

// GET /api/pets — list available pets
export async function GET(request: Request) {
  const url = new URL(request.url);
  const species = url.searchParams.get("species") ?? undefined;

  const result = await pawplacer.pets.list({
    status: "available",
    species,
    limit: 12,
  });

  return Response.json({
    pets: result.data,
    total: result.total,
    hasMore: result.hasMore,
  });
}

// GET /api/adopters — list active adopters
export async function getAdopters() {
  const result = await pawplacer.people.list({
    type: "adopter",
    status: "active",
    limit: 50,
  });
  return result.data;
}

// GET /api/adoption-fees — fee rules for pricing display
export async function getAdoptionFees() {
  return pawplacer.adoptionFees.get();
}

// GET /api/contracts — render adoption agreement
export async function getAdoptionContract() {
  const contract = await pawplacer.contracts.get("adopter");
  return contract.content; // markdown
}
