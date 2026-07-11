import { sql } from "drizzle-orm";
import { db } from "./client";

export type HealthReport = {
	status: "ok" | "degraded";
	checks: Record<string, "ok" | "error">;
	timestamp: string;
};

// Probes the app's critical dependencies for a health-check endpoint. Currently
// the database (the dependency all apps share); add Redis/etc. here once a client
// for them is wired. Never throws — a failed probe is reported, not raised.
export async function checkHealth(): Promise<HealthReport> {
	const checks: Record<string, "ok" | "error"> = {};
	let healthy = true;

	try {
		await db.execute(sql`select 1`);
		checks.database = "ok";
	} catch {
		checks.database = "error";
		healthy = false;
	}

	return {
		status: healthy ? "ok" : "degraded",
		checks,
		timestamp: new Date().toISOString(),
	};
}
