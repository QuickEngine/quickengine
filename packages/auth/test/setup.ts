import { closeTestDb, truncateAll } from "@quickengine/db/testing";
import { afterAll, beforeEach } from "vitest";

// Every test starts from an empty database so cases can't leak into each other.
beforeEach(async () => {
	await truncateAll();
});

afterAll(async () => {
	await closeTestDb();
});
