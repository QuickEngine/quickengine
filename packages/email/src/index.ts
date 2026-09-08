import { serverEnv } from "@quickengine/env/server";
import { Resend } from "resend";

export type EmailAddress = string;

export type SendEmailInput = {
	to: EmailAddress | EmailAddress[];
	from?: EmailAddress;
	replyTo?: EmailAddress;
	subject: string;
	text?: string;
	html?: string;
	tags?: Record<string, string>;
	/**
	 * The workspace whose business this mail belongs to.
	 *
	 * 🔴 Passing it is what makes a send BILLABLE, and leaving it out is what
	 * keeps platform mail free. Order confirmations, shipping notices, booking
	 * reminders and supplier handoffs are a customer's business sending mail, and
	 * every one costs us money with the provider. Password resets, sign-in links,
	 * email verification and organization invites are OUR mail about their
	 * account: charging somebody to reset their own password would be billing
	 * them for using the login screen.
	 *
	 * ⚠️ The split is enforced by construction rather than by a list of event
	 * names to keep in step. A new platform email is free by default, and a new
	 * business email is metered the moment it passes the workspace it belongs to,
	 * which is the safer direction for both mistakes.
	 */
	workspaceId?: string;
};

export type SendEmailResult = {
	id: string;
	provider: string;
};

export type EmailProvider = {
	send(input: SendEmailInput): Promise<SendEmailResult>;
};

// Default sender. Set EMAIL_FROM to a sender on a Resend-verified domain in prod
// (e.g. "QuickEngine <noreply@quickengine.xyz>") so mail reaches any recipient.
// Unset falls back to `onboarding@resend.dev`, which works in dev with just an
// API key but only delivers to the Resend account owner.
const DEFAULT_FROM =
	serverEnv.EMAIL_FROM ?? "QuickEngine <onboarding@resend.dev>";

// Accepts without sending when no provider is configured. Message content can
// contain verification links, reset tokens and customer data, so it is never
// written to the process log.
export const createConsoleEmailProvider = (): EmailProvider => ({
	async send(_input) {
		console.info("[email:console] message accepted (content redacted)");
		return { id: `console:${Date.now()}`, provider: "console" };
	},
});

export const createResendEmailProvider = (
	apiKey: string,
	from: EmailAddress = DEFAULT_FROM,
): EmailProvider => {
	const resend = new Resend(apiKey);

	const deliver = (sender: EmailAddress, input: SendEmailInput) =>
		resend.emails.send({
			from: sender,
			to: input.to,
			subject: input.subject,
			replyTo: input.replyTo,
			html: input.html ?? input.text ?? "",
			text: input.text,
		});

	return {
		async send(input) {
			let { data, error } = await deliver(input.from ?? from, input);

			/**
			 * 🔴 A business's own sender is REFUSED until its domain is verified with
			 * the provider, and that refusal is the security boundary — without it,
			 * setting a sender to somebody else's address would be a spoofing tool.
			 *
			 * ⚠️ But a refused send must not become NO send. A customer who receives
			 * nothing has lost their receipt or their tracking number; one who
			 * receives platform-branded mail has only lost the branding. So an
			 * unverified sender falls back rather than failing, and says so loudly
			 * enough that somebody fixes the domain.
			 */
			if (error && input.from && input.from !== from) {
				console.warn(
					`[email] sender "${input.from}" was refused, falling back to the platform sender. Verify the domain with the mail provider. Reason: ${error.message}`,
				);
				({ data, error } = await deliver(from, input));
			}

			if (error) {
				throw new Error(`Resend send failed: ${error.message}`);
			}

			return { id: data?.id ?? "unknown", provider: "resend" };
		},
	};
};

/**
 * Count a delivered message against the sending workspace's allowance.
 *
 * ⚠️ Wraps the provider rather than living at the call sites. There are fourteen
 * places in the product that send mail; metering at each would be fourteen
 * copies of two lines and fourteen chances to add a fifteenth without them. The
 * same reasoning as `record-allowance.ts` in the API.
 *
 * 🔴 The billing import is DYNAMIC. `@quickengine/email` is reachable from
 * route registration through `@quickengine/auth`, and pulling the billing
 * package (and the database client with it) into that module graph is exactly
 * the failure that broke CI three times in one day. Nothing about DEFINING a
 * send needs billing; only completing one does.
 *
 * ⚠️ Awaited, not fired and forgotten. A floating promise in a serverless
 * function is cancelled when the response is returned, so the usage would be
 * lost for precisely the accounts sending the most mail.
 */
const withMetering = (provider: EmailProvider): EmailProvider => ({
	async send(input) {
		const result = await provider.send(input);
		if (!input.workspaceId) return result;
		try {
			// One per recipient: the provider charges us per delivery, and a send
			// to three addresses is three deliveries however many API calls it took.
			const count = Array.isArray(input.to) ? input.to.length : 1;
			const { meterWorkspaceEmails } = await import("@quickengine/billing");
			await meterWorkspaceEmails({ workspaceId: input.workspaceId, count });
		} catch {
			// Deliberately silent. The mail is delivered and the customer's buyer
			// has their receipt; a usage row that could not be written is a number
			// to repair, never a reason to report a send as failed and have the
			// caller retry it into a duplicate.
		}
		return result;
	},
});

// Picks Resend when RESEND_API_KEY is set, otherwise the console provider (dev).
let cachedProvider: EmailProvider | undefined;

export const getEmailProvider = (): EmailProvider => {
	if (!cachedProvider) {
		const base =
			process.env.NODE_ENV !== "test" && serverEnv.RESEND_API_KEY
				? createResendEmailProvider(serverEnv.RESEND_API_KEY)
				: createConsoleEmailProvider();
		cachedProvider = withMetering(base);
	}

	return cachedProvider;
};

export const emailEvents = {
	welcome: "email/welcome",
	passwordReset: "email/password-reset",
	emailVerification: "email/verification",
} as const;

export type {
	EmailBrand,
	OrderLine,
	RenderedEmail,
} from "./templates";
export {
	bookingConfirmationEmail,
	operatorNotificationEmail,
	orderConfirmationEmail,
	organizationInviteEmail,
	paymentReceiptEmail,
	shippingNoticeEmail,
	signInLinkEmail,
} from "./templates";
