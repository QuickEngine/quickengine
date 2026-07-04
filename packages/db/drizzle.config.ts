import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../.env.local" });
config({ path: "../../.env" });

const databaseUrl =
	process.env.DATABASE_URL ??
	"postgresql://quickengine:quickengine_dev_password@localhost:5435/quickengine";

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required for Drizzle commands");
}

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema",
	out: "./drizzle",
	dbCredentials: {
		url: databaseUrl,
	},
});
