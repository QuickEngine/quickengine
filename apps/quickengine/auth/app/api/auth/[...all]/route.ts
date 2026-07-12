import { auth, isAllowedOrigin } from "@quickengine/auth/server";

// Sibling surfaces (account/web) call this auth API cross-origin, so the browser
// sends a preflight OPTIONS and expects Access-Control-* headers on every
// response. Better Auth validates the Origin for CSRF, but Next doesn't add CORS
// headers — so we add them here for our own trusted origins (credentialed, so the
// allow-origin must echo the caller, never "*").
function corsHeaders(req: Request): Record<string, string> {
	const origin = req.headers.get("origin");
	if (!origin || !isAllowedOrigin(origin)) {
		return {};
	}
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type,Authorization",
		Vary: "Origin",
	};
}

async function handle(req: Request): Promise<Response> {
	const res = await auth.handler(req);
	const cors = corsHeaders(req);
	if (Object.keys(cors).length === 0) {
		return res;
	}
	// Clone so we can add headers (a returned Response's headers can be immutable).
	const headers = new Headers(res.headers);
	for (const [key, value] of Object.entries(cors)) {
		headers.set(key, value);
	}
	return new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers,
	});
}

export const GET = handle;
export const POST = handle;

export function OPTIONS(req: Request): Response {
	return new Response(null, { status: 204, headers: corsHeaders(req) });
}
