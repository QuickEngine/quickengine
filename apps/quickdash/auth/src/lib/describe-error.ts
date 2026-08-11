/**
 * Turns whatever a call failed with into something a person can act on.
 *
 * ⚠️ THE THREE FAILURES LOOK IDENTICAL TO THE CALLER and need completely
 * different responses:
 *
 *   - the device is offline          → reconnect, then retry
 *   - the API is unreachable         → nothing they can do; it is our outage
 *   - the API answered with a refusal → the answer is real, show it
 *
 * Without this they all surface as one generic sentence, so someone on a dropped
 * connection is told their code was wrong, and someone hitting a dead API is
 * told to check their password. Both then keep trying the thing that cannot
 * work.
 *
 * 🔴 A network-level failure is recognised by the ABSENCE of a status. `fetch`
 * rejects with a bare `TypeError` when it never reached a server — no status, no
 * body. Any real HTTP response, including a 500, carries one.
 */
export function describeError(
	error: unknown,
	fallback = "Something went wrong. Try again.",
): string {
	if (typeof navigator !== "undefined" && navigator.onLine === false) {
		return "You appear to be offline. Reconnect and try again.";
	}

	const status = (error as { status?: number } | null)?.status;
	const message = (error as { message?: string } | null)?.message;

	// No status at all: the request never reached anything.
	if (!status && isNetworkFailure(message)) {
		return "Can't reach QuickEngine right now. This is on our side, try again in a moment.";
	}

	if (status === 429) {
		return "Too many attempts. Wait a moment before trying again.";
	}

	// 5xx is ours, and the body is not worth showing — it is a stack trace or a
	// framework string, never an instruction.
	if (status && status >= 500) {
		return "Something went wrong on our side. Try again in a moment.";
	}

	return message ?? fallback;
}

function isNetworkFailure(message: string | undefined): boolean {
	if (!message) return true;
	const lower = message.toLowerCase();
	return (
		lower.includes("failed to fetch") ||
		lower.includes("networkerror") ||
		lower.includes("load failed") ||
		lower.includes("network request failed")
	);
}
