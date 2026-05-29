import { PawPlacerApiError, PawPlacerClient } from "pawplacer-sdk";

const runWriteExamples = process.env.PAWPLACER_EXAMPLE_WRITES === "true";

function createClient() {
  const apiKey = process.env.PAWPLACER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Set PAWPLACER_API_KEY before running this example. Generate a key in Settings > SDK & API.",
    );
  }

  return new PawPlacerClient({ apiKey });
}

async function pets(pawplacer: PawPlacerClient) {
  // List available dogs
  const result = await pawplacer.pets.list({
    status: "available",
    species: "dog",
    limit: 10,
  });
  console.log(`Found ${result.total} available dogs`);

  // Fetch a single pet
  if (result.data.length > 0) {
    const pet = await pawplacer.pets.get(result.data[0].id);
    console.log(pet.name, pet.status, pet.global_adoption_fee);
  }

  if (runWriteExamples) {
    // Create a pet
    const newPet = await pawplacer.pets.create({
      name: "Max",
      species: "dog",
      age_category: "young",
      sex: "male",
      size: "medium",
      status: "available",
      health: "good",
      breed: ["Labrador Retriever"],
      good_with: ["families", "kids"],
      temperaments: ["playful", "social"],
      adoption_fee: 250,
    });
    console.log("Created:", newPet.id);
  }

  // Custom fields for pet forms
  const fields = await pawplacer.pets.getCustomFields();
  console.log(
    "Pet custom fields:",
    fields.map((f) => f.field_key),
  );
}

async function people(pawplacer: PawPlacerClient) {
  // List active adopters
  const adopters = await pawplacer.people.list({
    type: "adopter",
    status: "active",
    limit: 25,
  });
  console.log(`Found ${adopters.total} active adopters`);

  // List fosters
  const fosters = await pawplacer.people.list({ type: "foster" });
  console.log(`Found ${fosters.total} fosters`);

  // List surrenders
  const surrenders = await pawplacer.people.list({ type: "surrender" });
  console.log(`Found ${surrenders.total} surrenders`);

  // List volunteers
  const volunteers = await pawplacer.people.list({ type: "volunteer" });
  console.log(`Found ${volunteers.total} volunteers`);

  // Get a single adopter
  if (adopters.data.length > 0) {
    const adopter = await pawplacer.people.get(adopters.data[0].id, "adopter");
    console.log(adopter.name, adopter.email, adopter.capacity);
  }

  // Custom fields for adopter/foster/surrender/volunteer forms
  const fields = await pawplacer.people.getCustomFields("adopter");
  console.log(
    "Adopter custom fields:",
    fields.map((f) => f.field_key),
  );

  if (!runWriteExamples) {
    return;
  }

  // Create a foster
  const foster = await pawplacer.people.create({
    type: "foster",
    name: "Jane Smith",
    email: "jane@example.com",
    capacity: 3,
    custom_field_data: { has_yard: true },
  });
  console.log("Created foster:", foster.id);

  // Create a surrender intake
  const surrender = await pawplacer.people.create({
    type: "surrender",
    name: "Sam Surrender",
    email: "sam@example.com",
    custom_field_data: { reason_for_surrender: "Moving" },
    pets: [
      {
        create: {
          name: "Buddy",
          species: "dog",
          age_category: "adult",
          sex: "male",
          size: "large",
          status: "intake",
          health: "unknown",
        },
        reason: "Moving",
      },
    ],
  });
  console.log("Created surrender:", surrender.id);

  // Create a volunteer
  const volunteer = await pawplacer.people.create({
    type: "volunteer",
    name: "Val Volunteer",
    email: "val@example.com",
    custom_field_data: { preferred_shift: "Saturday" },
  });
  console.log("Created volunteer:", volunteer.id);
}

async function adoptionFees(pawplacer: PawPlacerClient) {
  const fees = await pawplacer.adoptionFees.get();
  console.log(`${fees.length} fee rules configured`);
  for (const fee of fees) {
    console.log(
      `  ${fee.species} ${fee.attribute_type}=${fee.attribute_value}: $${fee.adjustment}`,
    );
  }
}

async function contracts(pawplacer: PawPlacerClient) {
  const contract = await pawplacer.contracts.get("adopter");
  console.log("Adoption contract:", contract.content.slice(0, 100));
  console.log("Last updated:", contract.updated_at);
}

async function main() {
  const pawplacer = createClient();

  try {
    await pets(pawplacer);
    await people(pawplacer);
    await adoptionFees(pawplacer);
    await contracts(pawplacer);

    // Rate limit info from last request
    console.log("Rate limit:", pawplacer.lastResponseMeta.rateLimit);
  } catch (error) {
    if (error instanceof PawPlacerApiError) {
      console.error(
        `API error ${error.status}: [${error.code}] ${error.message}`,
      );
    } else {
      throw error;
    }
  }
}

if (!runWriteExamples) {
  console.log(
    "Running read-only examples. Set PAWPLACER_EXAMPLE_WRITES=true to run create examples.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
