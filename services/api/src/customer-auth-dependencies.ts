import {
	bindMembership,
	consumeLoginToken,
	createCustomerSession,
	createLoginToken,
	db,
	eq,
	findOrCreateIdentity,
	resolveBrand,
	revokeCustomerSession,
	workspaceBranding,
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

		// 🔴 The workspace travels in the PATH, not a query parameter.
		//
		// The portal resolves which business a page belongs to from its first path
		// segment, and it needs that before it can fetch the publishable key that
		// `verify` requires. A link to a bare `/verify` lands on a page that cannot
		// tell whose token it is holding.
		const [published] = await db
			.select({ portalSlug: workspaceBranding.portalSlug })
			.from(workspaceBranding)
			.where(eq(workspaceBranding.workspaceId, input.workspaceId))
			.limit(1);

		// No published portal means no address the link could point at. Thrown
		// rather than guessed: `request-link` catches this, logs
		// `customer.sign_in_link_failed`, and still answers 202, so the enumeration
		// guarantee holds and the token remains available for a later retry.
		if (!published?.portalSlug) {
			throw new Error(
				`Workspace ${input.workspaceId} has no published portal, so a sign-in link has nowhere to land.`,
			);
		}

		const url = new URL(`/${published.portalSlug}/verify`, portalBaseUrl());
		url.searchParams.set("token", input.token);

		// 🔴 Branded as the WORKSPACE, never as QuickEngine. The recipient bought
		// from a gem shop; a "QuickEngine" email about an account they did not
		// knowingly create reads as phishing, and is the fastest way to have a
		// customer's sign-in link reported as spam.
		//
		// The workspace's own branding, with `resolveBrand` applying every fallback
		// — the same resolution the receipts use, so a sign-in link and an order
		// confirmation cannot disagree about who sent them.
		const brand = await resolveBrand(input.workspaceId);

		const rendered = signInLinkEmail({
			brand: brand ?? {
				// Unreachable in practice: a token was just minted for this workspace.
				// Kept so a deleted-mid-flight workspace cannot crash the send.
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
