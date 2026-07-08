import { describe, expect, it } from "vitest";
import {
	apiEnableTwoFactor,
	apiSignIn,
	apiVerifyBackupCode,
	apiVerifyTotp,
	auth,
	createVerifiedUser,
	totp,
	totpSecretFromUri,
} from "./helpers";

type EnableBody = { totpURI?: string; backupCodes?: string[] };

/** Create a verified user with 2FA fully enabled (TOTP confirmed once). */
const enrolTwoFactor = async (email: string) => {
	const cookie = await createVerifiedUser(email, "password123");
	const { body } = await apiEnableTwoFactor("password123", cookie);
	const totpURI = (body as EnableBody).totpURI ?? "";
	const backupCodes = (body as EnableBody).backupCodes ?? [];
	const secret = totpSecretFromUri(totpURI);
	// Enabling requires confirming one code before 2FA is actually active.
	await apiVerifyTotp(totp(secret), cookie);
	return { secret, backupCodes };
};

describe("two-factor (TOTP + recovery codes)", () => {
	it("enable requires the correct password", async () => {
		const cookie = await createVerifiedUser(
			"2fa-pw@example.com",
			"password123",
		);
		const { res } = await apiEnableTwoFactor("wrongpassword", cookie);
		expect(res.status).toBeGreaterThanOrEqual(400);
	});

	it("password sign-in alone does NOT issue a session once 2FA is on", async () => {
		await enrolTwoFactor("2fa-enforce@example.com");

		const { res, body, cookie } = await apiSignIn(
			"2fa-enforce@example.com",
			"password123",
		);

		expect(res.status).toBe(200);
		expect((body as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(
			true,
		);
		// The challenge cookie must NOT be a usable session.
		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
		});
		expect(session).toBeNull();
	});

	it("rejects a wrong TOTP code", async () => {
		await enrolTwoFactor("2fa-wrong@example.com");
		const { cookie: challenge } = await apiSignIn(
			"2fa-wrong@example.com",
			"password123",
		);

		const { res } = await apiVerifyTotp("000000", challenge);
		expect(res.status).toBeGreaterThanOrEqual(400);
	});

	it("accepts a valid TOTP code and completes sign-in", async () => {
		const { secret } = await enrolTwoFactor("2fa-ok@example.com");
		const { cookie: challenge } = await apiSignIn(
			"2fa-ok@example.com",
			"password123",
		);

		const { res, cookie } = await apiVerifyTotp(totp(secret), challenge);
		expect(res.status).toBe(200);
		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
		});
		expect(session?.user.email).toBe("2fa-ok@example.com");
	});

	it("accepts a backup code once, then rejects its reuse", async () => {
		const { backupCodes } = await enrolTwoFactor("2fa-backup@example.com");
		const code = backupCodes[0];

		const { cookie: firstChallenge } = await apiSignIn(
			"2fa-backup@example.com",
			"password123",
		);
		const first = await apiVerifyBackupCode(code, firstChallenge);
		expect(first.res.status).toBe(200);

		// A fresh challenge, reusing the now-consumed code, must fail.
		const { cookie: secondChallenge } = await apiSignIn(
			"2fa-backup@example.com",
			"password123",
		);
		const second = await apiVerifyBackupCode(code, secondChallenge);
		expect(second.res.status).toBeGreaterThanOrEqual(400);
	});
});
