import { closeTestDb, truncateAll } from "@quickengine/db/testing";
import { afterAll, beforeEach } from "vitest";

beforeEach(async () => {
	await truncateAll();
});

afterAll(async () => {
	await closeTestDb();
});
