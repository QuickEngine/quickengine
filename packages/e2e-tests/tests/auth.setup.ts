import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";
import { auth } from "@quickengine/auth/server";
import { testDbClient, truncateAll } from "@quickengine/db/testing";
import { STORAGE_STATE } from "../playwright.config";
import {
	FIXTURE,
	seedIssuedInvoice,
	seedSecondWorkspace,
	seedWorkspace,
} from "./fixture";

/**
 * Mints a REAL signed-in session and saves it for every other project.
 *
 * QuickDash doesn't host the Better Auth handler (the auth app is the single authority),
 * so there's no endpoint here to sign in against. Instead we drive the same `auth`
 * instance the server uses as a library: sign up, verify, sign in. Better Auth computes
 * the Set-Cookie itself, so nothing about the cookie format is reimplemented here — and
 * because the app shares BETTER_AUTH_SECRET, it validates the cookie we produce.
 */
setup("seed the workspace and sign in", async () => {
	await truncateAll();

	// Sign-up creates the user + password account, and the `user.create.after` hook
	// gives the user their personal organization.
	await auth.api.signUpEmail({
		body: {
			email: FIXTURE.email,
			password: FIXTURE.password,
			name: FIXTURE.name,
		},
	});

	// Password sign-in requires a verified email (requireEmailVerification: true).
	// Verify directly rather than round-tripping a token through the console mailer.
	const sql = testDbClient();
	const [user] = await sql<{ id: string }[]>`
		update quickengine_users set email_verified = true
		where email = ${FIXTURE.email}
		returning id
	`;
	if (!user) throw new Error("Seeded user was not created.");

	await seedWorkspace(user.id);
	await seedSecondWorkspace(user.id);
	await seedIssuedInvoice();

	const response = await auth.api.signInEmail({
		body: { email: FIXTURE.email, password: FIXTURE.password },
		asResponse: true,
	});
	const cookies = parseSetCookie(response.headers.getSetCookie());
	if (cookies.length === 0) {
		throw new Error("Sign-in returned no session cookie.");
	}

	await mkdir(dirname(STORAGE_STATE), { recursive: true });
	await writeFile(
		STORAGE_STATE,
		JSON.stringify({ cookies, origins: [] }, null, 2),
	);
});

/** Convert Set-Cookie header strings into Playwright's storageState cookie shape. */
function parseSetCookie(headers: string[]) {
	return headers.map((header) => {
		const [pair, ...attributes] = header.split(";");
		const separator = pair.indexOf("=");
		const attribute = (name: string) =>
			attributes
				.map((part) => part.trim())
				.find((part) => part.toLowerCase().startsWith(`${name}=`))
				?.slice(name.length + 1);
		const expires = attribute("Max-Age");
		return {
			name: pair.slice(0, separator).trim(),
			value: pair.slice(separator + 1).trim(),
			domain: "localhost",
			path: attribute("Path") ?? "/",
			expires: expires ? Date.now() / 1000 + Number(expires) : -1,
			httpOnly: attributes.some(
				(part) => part.trim().toLowerCase() === "httponly",
			),
			secure: false,
			sameSite: "Lax" as const,
		};
	});
}
