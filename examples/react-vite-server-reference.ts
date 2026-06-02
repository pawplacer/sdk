import { PawPlacerClient } from "pawplacer-sdk";

// Copy this shape into your Node API route, serverless function, or BFF layer.
// The SDK and PAWPLACER_API_KEY stay on the server.
const pawplacer = new PawPlacerClient({
  cache: { enabled: true, refreshFrequencyMinutes: 60 },
});

export async function getAvailablePetsForReact(filters: {
  species?: string;
  search?: string;
}) {
  const result = await pawplacer.pets.list({
    status: "available",
    species: filters.species,
    search: filters.search,
    limit: 12,
  });

  return {
    pets: result.data.map((pet) => ({
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      ageCategory: pet.age_category,
      imageUrl: pet.image_url,
      adoptionFee: pet.global_adoption_fee ?? pet.adoption_fee,
    })),
    total: result.total,
    hasMore: result.hasMore,
  };
}

export type AvailablePetsPayload = Awaited<
  ReturnType<typeof getAvailablePetsForReact>
>;
