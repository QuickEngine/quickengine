import { checkHealth } from "@quickengine/db/health";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	const report = await checkHealth();
	return NextResponse.json(report, {
		status: report.status === "ok" ? 200 : 503,
	});
}
