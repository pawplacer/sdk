// Copy this into React browser code. It talks to your own API route, not to
// PawPlacer directly.
export interface AvailablePetCard {
  id: string;
  name: string;
  species: string;
  breed: string[];
  ageCategory: string;
  imageUrl: string | null;
  adoptionFee: string | number | null;
}

export interface AvailablePetsPayload {
  pets: AvailablePetCard[];
  total: number;
  hasMore: boolean;
}

export async function fetchAvailablePets(filters: {
  species?: string;
  search?: string;
}): Promise<AvailablePetsPayload> {
  const searchParams = new URLSearchParams();
  if (filters.species) searchParams.set("species", filters.species);
  if (filters.search) searchParams.set("search", filters.search);

  const suffix = searchParams.toString()
    ? `?${searchParams.toString()}`
    : "";
  const response = await fetch(`/api/pets${suffix}`);
  if (!response.ok) {
    throw new Error(`Failed to load pets: ${response.status}`);
  }

  return response.json() as Promise<AvailablePetsPayload>;
}

export interface AvailablePetsState {
  data: AvailablePetsPayload | null;
  error: string | null;
  loading: boolean;
}
