import {
  PawPlacerApiError,
  PawPlacerClient,
  type PersonCreateInput,
} from "pawplacer-sdk";

const client = new PawPlacerClient({ apiKey: "test-api-key" });
const adopter: PersonCreateInput = { type: "adopter", name: "Jane" };
const isApiError = (error: unknown) => error instanceof PawPlacerApiError;

void client;
void adopter;
void isApiError;
