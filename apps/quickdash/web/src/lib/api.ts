import type {
	QuickBearerCredential,
	QuickSessionCredential,
} from "@quickengine/quick";
import { createQuickBrowser } from "@quickengine/quick/browser";
import { QueryClient } from "@tanstack/react-query";
import { getNativeToken } from "./native-auth";

/**
 * The credential this surface uses.
 *
 * A browser has a first-party cookie and needs nothing else. The native shell
 * has no cookie — its sign-in happened in the system browser, a different
 * process — so it carries the session token explicitly instead. Same session,
 * different transport; see `native-auth.ts`.
 */
const credential = (): QuickSessionCredential | QuickBearerCredential => {
	const token = getNativeToken();
	return token ? { type: "bearer", token } : { type: "session" };
};

/**
 * Development only: make every WRITE fail, so save states can be reviewed.
 *
 * 🔑 `?writeFail=409` on any page. `forcedFailure` in `page-state.tsx` does
 * this for reads, but a read is one query in one component and a write is
 * thirty-one hand-rolled messages spread across nineteen forms — wiring a
 * switch into each of them would be nineteen chances to wire it differently.
 *
 * 🔴 So it goes HERE, at the one door every mutation passes through. Every
 * panel, every settings form and every bulk action lights up from a single
 * query parameter, and none of them needed a line of code.
 *
 * ⚠️ GET is untouched. A page whose data would not load cannot show you what
 * its save button does, and `?fail=` already covers reads.
 */
function forcedWriteStatus(): number | null {
	if (!import.meta.env.DEV) return null;
	const asked = new URLSearchParams(window.location.search).get("writeFail");
	if (!asked) return null;
	const status = Number(asked);
	return Number.isFinite(status) ? status : null;
}

type Requester = { request: (...args: never[]) => Promise<unknown> };

function reviewable<T>(client: T): T {
	if (!import.meta.env.DEV) return client;
	const target = client as T & Requester;
	const original = target.request.bind(target);
	target.request = ((path: string, init?: { method?: string }) => {
		const status = forcedWriteStatus();
		const method = (init?.method ?? "GET").toUpperCase();
		if (status !== null && method !== "GET") {
			return Promise.reject(
				Object.assign(new Error(`HTTP ${status}`), {
					status,
					// Fixed, so the copy button can be tested and screenshots of a
					// review stay identical between visits.
					requestId: "3f2b91c4-8d17-4a6e-9c05-1b7e2d4a8f60",
				}),
			);
		}
		return original(...([path, init] as never[]));
	}) as Requester["request"];
	return client;
}

export const sessionApi = reviewable(
	createQuickBrowser({
		baseUrl: window.location.origin,
		credential: credential(),
	}),
);

export const workspaceApi = (workspaceId: string) =>
	reviewable(
		createQuickBrowser({
			baseUrl: window.location.origin,
			credential: credential(),
			workspaceId,
		}),
	);

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 15_000,
			retry: (count, error) => {
				const status = (error as { status?: number }).status;
				return !(status && status >= 400 && status < 500) && count < 2;
			},
		},
	},
});
