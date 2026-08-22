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

// Picks Resend when RESEND_API_KEY is set, otherwise the console provider (dev).
let cachedProvider: EmailProvider | undefined;

export const getEmailProvider = (): EmailProvider => {
	if (!cachedProvider) {
		cachedProvider =
			process.env.NODE_ENV !== "test" && serverEnv.RESEND_API_KEY
				? createResendEmailProvider(serverEnv.RESEND_API_KEY)
				: createConsoleEmailProvider();
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
