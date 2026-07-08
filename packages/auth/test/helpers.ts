import { createHmac } from "node:crypto";
import { testDbClient } from "@quickengine/db/testing";
import { auth } from "../src/server";

export { auth };

export type ApiResult = {
	res: Response;
	body: unknown;
	/** A `Cookie` header value (name=value pairs) rebuilt from Set-Cookie. */
	cookie: string;
};

const safeJson = async (res: Response): Promise<unknown> => {
	try {
		return await res.clone().json();
	} catch {
		return null;
	}
};

/** Rebuild a `Cookie` request header from a response's Set-Cookie headers. */
export const cookieHeaderFrom = (res: Response): string => {
	const setCookies = res.headers.getSetCookie?.() ?? [];
	return setCookies
		.map((cookie) => cookie.split(";")[0])
		.filter(Boolean)
		.join("; ");
};

const call = async (
	fn: (args: {
		body: Record<string, unknown>;
		headers?: Headers;
		asResponse: true;
	}) => Promise<Response>,
	body: Record<string, unknown>,
	cookie?: string,
): Promise<ApiResult> => {
	try {
		const res = await fn({
			body,
			asResponse: true,
			...(cookie ? { headers: new Headers({ cookie }) } : {}),
		});
		return { res, body: await safeJson(res), cookie: cookieHeaderFrom(res) };
	} catch (error) {
		// Better Auth throws APIError on some validation/error paths even with
		// asResponse. Normalize it to a Response so tests read status uniformly.
		const err = error as {
			statusCode?: number;
			status?: number;
			body?: unknown;
		};
		const status =
			typeof err.statusCode === "number"
				? err.statusCode
				: typeof err.status === "number"
					? err.status
					: 500;
		const payload = err.body ?? { message: (error as Error).message };
		return {
			res: new Response(JSON.stringify(payload), { status }),
			body: payload,
			cookie: "",
		};
	}
};

// --- Core auth flows ---------------------------------------------------------

export const apiSignUp = (
	email: string,
	password: string,
	name = "Test User",
): Promise<ApiResult> =>
	call((a) => auth.api.signUpEmail(a), { email, password, name });

export const apiSignIn = (
	email: string,
	password: string,
	cookie?: string,
): Promise<ApiResult> =>
	call((a) => auth.api.signInEmail(a), { email, password }, cookie);

export const apiSignOut = (cookie: string): Promise<ApiResult> =>
	call((a) => auth.api.signOut(a), {}, cookie);

/** Flip email_verified directly, for tests that need a usable account fast. */
export const markEmailVerified = async (email: string): Promise<void> => {
	await testDbClient()`
		UPDATE quickengine_users SET email_verified = true WHERE email = ${email}
	`;
};

/** Create a verified account and return a live session cookie. */
export const createVerifiedUser = async (
	email: string,
	password: string,
): Promise<string> => {
	await apiSignUp(email, password);
	await markEmailVerified(email);
	const { cookie } = await apiSignIn(email, password);
	return cookie;
};

// --- Two-factor --------------------------------------------------------------

export const apiEnableTwoFactor = (
	password: string,
	cookie: string,
): Promise<ApiResult> =>
	call((a) => auth.api.enableTwoFactor(a), { password }, cookie);

export const apiVerifyTotp = (
	code: string,
	cookie?: string,
): Promise<ApiResult> => call((a) => auth.api.verifyTOTP(a), { code }, cookie);

export const apiVerifyBackupCode = (
	code: string,
	cookie?: string,
): Promise<ApiResult> =>
	call((a) => auth.api.verifyBackupCode(a), { code }, cookie);

// --- TOTP generation (RFC 6238, SHA-1, 6 digits, 30s) ------------------------

const base32Decode = (input: string): Buffer => {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const char of input.replace(/=+$/, "").toUpperCase()) {
		const value = alphabet.indexOf(char);
		if (value < 0) continue;
		bits += value.toString(2).padStart(5, "0");
	}
	const bytes: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
	}
	return Buffer.from(bytes);
};

/** Compute the current TOTP code for a base32 secret. */
export const totp = (secret: string, forMs = Date.now()): string => {
	const key = base32Decode(secret);
	const counter = Buffer.alloc(8);
	let step = Math.floor(forMs / 1000 / 30);
	for (let i = 7; i >= 0; i--) {
		counter[i] = step & 0xff;
		step = Math.floor(step / 256);
	}
	const hmac = createHmac("sha1", key).update(counter).digest();
	const offset = hmac[hmac.length - 1] & 0xf;
	const code =
		((hmac[offset] & 0x7f) << 24) |
		((hmac[offset + 1] & 0xff) << 16) |
		((hmac[offset + 2] & 0xff) << 8) |
		(hmac[offset + 3] & 0xff);
	return (code % 1_000_000).toString().padStart(6, "0");
};

/** Pull the base32 secret out of an otpauth:// TOTP URI. */
export const totpSecretFromUri = (uri: string): string => {
	const match = uri.match(/[?&]secret=([A-Z2-7]+)/i);
	if (!match) throw new Error(`no secret in totp uri: ${uri}`);
	return match[1];
};
