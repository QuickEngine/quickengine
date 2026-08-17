import { authClient } from "./client";

/**
 * Resolving who you are, at most once every few seconds.
 *
 * 🔴 THIS EXISTS BECAUSE CLICKING AROUND SIGNED PEOPLE OUT.
 *
 * The route guard asks for the session on every navigation. Better Auth rate
 * limits its endpoints at 100 requests per 60 seconds, and a browse through
 * twenty sidebar pages — doubled by React's development double-render — goes
 * straight through that. The session check then answered 429, the guard read a
 * missing session as "not signed in", and the operator was thrown to sign-in
 * mid-task with nothing having actually changed.
 *
 * Two independent faults, fixed together:
 *
 * 1. **Volume.** One answer is cached briefly and shared by every navigation in
 *    that window, so a burst of clicks costs ONE request rather than twenty.
 *    Concurrent callers share a single in-flight promise instead of racing.
 *
 * 2. **Meaning.** "The server says you have no session" and "the server did not
 *    answer" are different facts. Better Auth's client does NOT throw on an
 *    HTTP error — it returns `{ data: null, error }` — so the previous guard's
 *    try/catch only ever caught network failures, and every 429 or 500 fell
 *    through the same branch as a genuine sign-out.
 */

/**
 * ⚠️ Mirrors what Better Auth actually returns rather than what a caller would
 * prefer. `name` and `email` are always present on a real session, and typing
 * them as optional pushed a needless narrowing onto every consumer.
 */
export type SessionUser = { id: string; name: string; email: string };

/**
 * Extra headers for the session request.
 *
 * The native shell has no cookie — its sign-in happened in the system browser,
 * a different process — so it carries the session token explicitly. A browser
 * passes nothing and relies on the cookie.
 */
export type SessionHeaders = () => Record<string, string>;

export type SessionResult =
	/** The server answered, and there is a session. */
	| { status: "signed-in"; user: SessionUser }
	/** The server answered, and there is no session. Redirecting is correct. */
	| { status: "signed-out" }
	/** Nobody answered usefully. NOT a sign-out; do not throw anybody anywhere. */
	| { status: "unknown" };

/**
 * How long one answer is reused.
 *
 * Short enough that a sign-out elsewhere takes effect almost immediately, long
 * enough that a burst of navigation costs a single request. The API enforces
 * authorization on every call regardless, so this cache is about how often the
 * SHELL asks, never about what anybody is allowed to see.
 */
const CACHE_MS = 5_000;

let cached: { at: number; result: SessionResult } | null = null;
let inFlight: Promise<SessionResult> | null = null;

/** Drop the cache — after signing out, or when a request proves it is stale. */
export function forgetSession() {
	cached = null;
	inFlight = null;
}

async function ask(headers: SessionHeaders): Promise<SessionResult> {
	try {
		const { data, error } = await authClient.getSession({
			fetchOptions: { headers: headers() },
		});

		if (data?.session && data.user) {
			return { status: "signed-in", user: data.user as SessionUser };
		}

		/**
		 * 🔴 An error status is NOT a sign-out.
		 *
		 * 401 is the only answer that means "you are not signed in". A 429 means
		 * we asked too often; a 5xx means the service is unwell. Treating either
		 * as a sign-out is what threw somebody out mid-task.
		 */
		const status = (error as { status?: number } | null)?.status;
		if (error && status !== 401) return { status: "unknown" };

		return { status: "signed-out" };
	} catch {
		// Could not reach the service at all.
		return { status: "unknown" };
	}
}

const noHeaders: SessionHeaders = () => ({});

export async function resolveSession(
	headers: SessionHeaders = noHeaders,
): Promise<SessionResult> {
	const now = Date.now();
	// ⚠️ An `unknown` answer is deliberately NOT cached: it is a failure, and
	// the next navigation deserves a fresh attempt rather than a stale shrug.
	if (
		cached &&
		now - cached.at < CACHE_MS &&
		cached.result.status !== "unknown"
	) {
		return cached.result;
	}
	if (inFlight) return inFlight;

	inFlight = ask(headers)
		.then((result) => {
			cached = { at: Date.now(), result };
			return result;
		})
		.finally(() => {
			inFlight = null;
		});

	return inFlight;
}
