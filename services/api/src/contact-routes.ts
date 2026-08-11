import type { Hono } from "hono";
import { z } from "zod";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * The marketing site's contact form.
 *
 * 🔴 THE ONLY PUBLIC, UNAUTHENTICATED WRITE ON THIS API BESIDES CHECKOUT.
 *
 * That is the whole reason this file is careful. Anyone on the internet can call
 * it, and it causes an email to be sent from our Resend account — so abuse costs
 * us deliverability on the sending domain, which is slow and painful to repair.
 * Read the guards below before changing any of them.
 *
 * It exists because the marketing site is a static SPA with no server runtime.
 * Email needs the Resend key, a key in page source is public, and a public key
 * that sends mail is a key anyone can send mail as us with. So the browser posts
 * here and the secret stays server-side. There is no shortcut around that.
 *
 * ⚠️ The message is delivered to us and NEVER stored. There is no table, no
 * queue and no admin screen. That is deliberate: a contact form is the easiest
 * way for a stranger's personal data to end up in a database nobody remembers
 * owning. Mail is already where we would read it.
 */

/**
 * ⚠️ Hard caps, not advice. Every one of these is the difference between a form
 * and an open mail relay:
 *
 * - Lengths are bounded so a single request cannot post a megabyte of text.
 * - `email` is checked loosely on purpose — see the note in the marketing app.
 *   Anything stricter rejects real addresses, and this one is only used as a
 *   reply-to.
 * - `website` is a HONEYPOT. It is hidden from people and left empty by them;
 *   bots fill every field they find. A filled honeypot is answered with success
 *   and dropped, because telling a bot it failed teaches it to try again.
 */
const contactSchema = z.object({
	name: z.string().trim().min(1).max(120),
	email: z
		.string()
		.trim()
		.min(3)
		.max(254)
		.regex(/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/),
	topic: z.string().trim().min(1).max(80),
	message: z.string().trim().min(10).max(4000),
	website: z.string().max(0).optional(),
});

export function registerContactRoutes(
	app: Hono<PlatformEnv>,
	options: { logger: ApiLogger },
) {
	app.post("/v1/contact", async (context) => {
		const body = await context.req.json().catch(() => null);
		const parsed = contactSchema.safeParse(body);

		if (!parsed.success) {
			// 🔴 No field detail in the response. The client already validated the
			// same rules and can say something useful; echoing which rule failed
			// only helps someone probing the endpoint map its limits.
			return context.json({ error: "INVALID_CONTACT_REQUEST" }, 400);
		}

		// The honeypot was filled. Answer exactly as success would, and send
		// nothing. A distinguishable rejection is a signal to retry differently.
		if (parsed.data.website) return context.json({ ok: true }, 202);

		const { name, email, topic, message } = parsed.data;

		// 🔴 LAZY IMPORT, non-negotiable. This file is reachable from
		// `registerAllRoutes`, so a top-level import would pull the mail SDK into
		// the module graph of route registration, of every cold start, and of the
		// OpenAPI route-table test. That exact mistake broke CI three times on
		// 2026-08-03, and the symptom was `openapi.test.ts` timing out — which
		// reads as a missing route and is not.
		const { getEmailProvider } = await import("@quickengine/email");

		try {
			await getEmailProvider().send({
				to: "quickenginesw@gmail.com",
				subject: `Contact: ${topic} — ${name}`,
				// Plain text. The body is a stranger's input, and rendering it as HTML
				// in our own inbox is a needless injection surface for zero benefit.
				// `Reply-To` is what makes answering one click rather than a
				// copy-paste.
				text: `${message}\n\n---\nFrom: ${name}\nEmail: ${email}\nTopic: ${topic}`,
				replyTo: email,
			});
		} catch (error) {
			// 🔴 The provider error is logged as a TYPE, never as a message. Provider
			// failures can carry request payloads and credentials, and the security
			// pass spent a slice keeping raw exception text out of logs and Sentry.
			options.logger.error("contact.send_failed", {
				reason: error instanceof Error ? error.name : "unknown",
			});
			return context.json({ error: "CONTACT_SEND_FAILED" }, 502);
		}

		return context.json({ ok: true }, 202);
	});
}
