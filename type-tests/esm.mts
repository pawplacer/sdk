import {
  PawPlacerApiError,
  PawPlacerClient,
  type Pet,
  type PetsApi,
  type WriteOptions,
} from "pawplacer-sdk";

const client = new PawPlacerClient({ apiKey: "test-api-key" });
const pets: PetsApi = client.pets;
const options: WriteOptions = { idempotencyKey: "sync:1" };
const isApiError = (error: unknown) => error instanceof PawPlacerApiError;
const firstPet = async (): Promise<Pet | undefined> =>
  (await pets.list({ limit: 1 })).data[0];

void options;
void isApiError;
void firstPet;
