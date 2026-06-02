const { PawPlacerApiError, PawPlacerClient } = require("pawplacer-sdk");

function createPawPlacerClient(apiKey = process.env.PAWPLACER_API_KEY) {
  const trimmedApiKey = apiKey && apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error(
      "Set PAWPLACER_API_KEY on the server. Generate a key in Settings > SDK & API.",
    );
  }

  return new PawPlacerClient({
    apiKey: trimmedApiKey,
    cache: { enabled: true, refreshFrequencyMinutes: 180 },
  });
}

async function listAvailablePets(pawplacer) {
  const result = await pawplacer.pets.list({
    status: "available",
    limit: 12,
  });

  return {
    pets: result.data,
    total: result.total,
    hasMore: result.hasMore,
  };
}

async function createPetFromBackendJob(pawplacer, externalPetId) {
  return pawplacer.pets.create(
    {
      name: "Max",
      species: "dog",
      age_category: "young",
      sex: "male",
      size: "medium",
      status: "available",
      health: "good",
    },
    { idempotencyKey: `pet-sync:${externalPetId}` },
  );
}

function formatPawPlacerError(error) {
  if (error instanceof PawPlacerApiError) {
    return `PawPlacer API error ${error.status}: [${error.code}] ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

module.exports = {
  createPawPlacerClient,
  createPetFromBackendJob,
  formatPawPlacerError,
  listAvailablePets,
};
