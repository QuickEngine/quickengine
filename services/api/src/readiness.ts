import type { Context } from "hono";
import type { PlatformEnv } from "./platform-types";
import { respond } from "./respond";

export type ReadinessCheck = {
	critical: boolean;
	name: string;
	run(signal: AbortSignal): Promise<void>;
};

type CheckResult = { name: string; status: "error" | "ok" };

async function runBounded(
	check: ReadinessCheck,
	timeoutMs: number,
): Promise<CheckResult> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort(new DOMException("Readiness deadline", "TimeoutError"));
			reject(new Error("readiness timeout"));
		}, timeoutMs);
	});
	try {
		await Promise.race([check.run(controller.signal), timeout]);
		return { name: check.name, status: "ok" };
	} catch {
		return { name: check.name, status: "error" };
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export async function respondReadiness(
	c: Context<PlatformEnv>,
	checks: readonly ReadinessCheck[],
	timeoutMs: number,
) {
	const results = await Promise.all(
		checks.map((check) => runBounded(check, timeoutMs)),
	);
	const failedCritical = checks.some(
		(check) =>
			check.critical &&
			results.find((result) => result.name === check.name)?.status === "error",
	);
	const degraded = results.some((result) => result.status === "error");

	return respond(
		c,
		{
			checks: results,
			service: "quickengine-api",
			status: failedCritical ? "not_ready" : degraded ? "degraded" : "ready",
		},
		failedCritical ? 503 : 200,
	);
}
