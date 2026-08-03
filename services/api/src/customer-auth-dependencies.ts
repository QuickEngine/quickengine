import {
	bindMembership,
	consumeLoginToken,
	createCustomerSession,
	createLoginToken,
	findOrCreateIdentity,
	revokeCustomerSession,
} from "@quickengine/db";
import type { CustomerAuthDependencies } from "./customer-routes";

/**
 * The real implementations behind `/v1/customer/auth/*`.
 *
 * Kept out of the route file so the routes can be tested with fakes, and so the
 * HTTP layer never imports a mail client.
 */

/**
 * Where a sign-in link points.
 *
 * The portal, not the storefront. One deployment serves every workspace, and it
 * is the only surface that knows how to exchange a token for a session. A
 * workspace that later wants sign-in inline on its own site hits the same
 * endpoint from its own page — this default is about where the emailed link
 * lands, not about where a customer may authenticate.
 */
const portalBaseUrl = () =>
	process.env.CUSTOMER_PORTAL_URL ?? "http://localhost:3012";

export const customerAuthDependencies: CustomerAuthDependencies = {
	createLoginToken,
	consumeLoginToken,
	findOrCreateIdentity,
	bindMembership,
	createCustomerSession,
	revokeCustomerSession,

	async sendSignInLink(input) {
		// 🔴 Imported here, not at module top level.
		//
		// `registerAllRoutes` pulls this file in, so a top-level import dragged the
		// mail SDK into the module graph of every route registration — including
		// the OpenAPI route-table test, which then timed out in CI, and every cold
		// start in production. Nothing about defining a route needs a mail client.
		//
		// Same reasoning as the lazy billing import in `index.ts`.
		const { getEmailProvider } = await import("@quickengine/email");
		const { signInLinkEmail } = await import("@quickengine/email/templates");
		const { serverEnv } = await import("@quickengine/env/server");

		const url = new URL("/verify", portalBaseUrl());
		url.searchParams.set("token", input.token);
		// The workspace travels in the link because the portal is multi-tenant and
		// a bare token would not tell it which publishable key to verify against.
		url.searchParams.set("workspace", input.workspaceId);

		// 🔴 Branded as the WORKSPACE, never as QuickEngine. The recipient bought
		// from a gem shop; a "QuickEngine" email about an account they did not
		// knowingly create reads as phishing, and is the fastest way to have a
		// customer's sign-in link reported as spam.
		//
		// ⚠️ `supportEmail` currently falls back to the platform address because
		// workspaces have no branding fields yet. That is the one place this leaks,
		// and it is tracked — a `workspace_branding` table replaces it.
		const rendered = signInLinkEmail({
			brand: {
				name: input.workspaceName,
				supportEmail:
					serverEnv.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? "support@quickdash.xyz",
			},
			url: url.toString(),
			expiresInMinutes: input.expiresInMinutes,
		});

		// 🔴 DEV ONLY. Tokens are stored hashed, so a sign-in link exists exactly
		// once — in the email — and can never be recovered afterwards. That is
		// correct for production and unusable locally, where the mail either goes
		// to a sink address nobody can read or to a domain Resend refuses.
		//
		// Printing it in development is the difference between testing this flow
		// and not being able to.
		if (process.env.NODE_ENV !== "production") {
			console.info(
				`\n🔑 Sign-in link for ${input.email}:\n   ${url.toString()}\n`,
			);
		}

		await getEmailProvider().send({
			to: input.email,
			subject: rendered.subject,
			html: rendered.html,
			text: rendered.text,
		});
	},
};
