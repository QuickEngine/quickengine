"use client";

import { useQueryState } from "nuqs";
import { resolveDestination } from "./_destination";

// Where to send the user after auth: the `?redirect=` target when it points at
// one of our own apps, otherwise the account dashboard. Read via nuqs so the
// target lives in the URL and survives the OAuth round-trip and refreshes.
// Shares its allow-list / open-redirect guard with the server guard via
// `resolveDestination`.
export function useAuthDestination(): string {
	const [redirect] = useQueryState("redirect");
	return resolveDestination(redirect);
}
