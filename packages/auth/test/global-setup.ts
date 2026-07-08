import { provisionTestDb } from "@quickengine/db/testing";

// Runs once before the whole suite: create `quickengine_test` and apply the
// committed migrations. Requires the docker postgres to be up (`pnpm docker:up`).
export default async function setup() {
	await provisionTestDb();
}
