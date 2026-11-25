// CommonJS reference.
const { PawPlacerApiError, PawPlacerClient } = require("pawplacer-sdk");

// Reads PAWPLACER_API_KEY. Create one client per process and reuse it.
const pawplacer = new PawPlacerClient();

async function listAvailablePets() {
  const result = await pawplacer.pets.list({ status: "available", limit: 12 });
  return { pets: result.data, total: result.total, hasMore: result.hasMore };
}

async function syncPet(externalId, pet) {
  return pawplacer.pets.create(
    { ...pet, custom_id: externalId },
    { idempotencyKey: `pet-sync:${externalId}` },
  );
}

function describeError(error) {
  if (error instanceof PawPlacerApiError) {
    return `PawPlacer API ${error.status} ${error.code}: ${error.message} (request ${error.requestId})`;
  }
  return error instanceof Error ? error.message : String(error);
}

module.exports = { describeError, listAvailablePets, pawplacer, syncPet };
