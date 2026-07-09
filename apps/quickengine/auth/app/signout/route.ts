import { auth } from "@quickengine/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveDestination } from "../_destination";

// Server-side sign-out for the centralized IdP. Clients (the dashboard, etc.)
// link here instead of calling the auth API cross-origin — same-origin on the
// auth app, so no CORS and it works across subdomains. We clear the session and
// redirect to a validated destination (open-redirect guard reused).
export async function GET(request: Request) {
	const redirectParam = new URL(request.url).searchParams.get("redirect");
	const target = resolveDestination(redirectParam);
	try {
		const result = await auth.api.signOut({
			headers: await headers(),
			asResponse: true,
		});
		const response = NextResponse.redirect(target);
		// Carry the session-clearing Set-Cookie headers onto the redirect.
		for (const cookie of result.headers.getSetCookie()) {
			response.headers.append("set-cookie", cookie);
		}
		return response;
	} catch {
		// No active session (or already signed out) — just bounce to the target.
		return NextResponse.redirect(target);
	}
}
