import { PawPlacerClient, type KyRequestOptions } from "pawplacer-sdk";

const client = new PawPlacerClient({ apiKey: "test-api-key" });
const requestOptions: KyRequestOptions = { retry: { limit: 1 } };

void client;
void requestOptions;
