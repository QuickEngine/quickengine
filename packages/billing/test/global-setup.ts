import { provisionTestDb } from "@quickengine/db/testing";

// Create `quickengine_test` and apply migrations once before the suite.
// Requires docker postgres up (`pnpm docker:up`).
export default async function setup() {
	await provisionTestDb();
}
