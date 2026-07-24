import { provisionTestDb } from "@quickengine/db/testing";

export default async function setup() {
	await provisionTestDb();
}
