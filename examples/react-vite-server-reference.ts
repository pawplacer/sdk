import { PawPlacerClient, type PetSpecies } from "pawplacer-sdk";

// Server half of a React/Vite app: put this in your API route, serverless
// function, or backend. The SDK and PAWPLACER_API_KEY stay on the server.
const pawplacer = new PawPlacerClient();

export async function getAvailablePetsForReact(filters: {
  species?: PetSpecies;
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
      // global_adoption_fee is set when the account's fee rules apply.
      adoptionFee: pet.global_adoption_fee ?? pet.adoption_fee,
    })),
    total: result.total,
    hasMore: result.hasMore,
  };
}

export type AvailablePetsPayload = Awaited<
  ReturnType<typeof getAvailablePetsForReact>
>;
