import { checkHealth } from "@quickengine/db/health";
import { NextResponse } from "next/server";

// Liveness/readiness probe. Never cached (health must be live), and pinned to the
// Node runtime since the DB client uses Node sockets.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	const report = await checkHealth();
	return NextResponse.json(report, {
		status: report.status === "ok" ? 200 : 503,
	});
}
