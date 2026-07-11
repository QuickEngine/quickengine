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

// Logs instead of sending, so dev auth flows (verification / reset URLs) are
// visible in the server console without a live inbox.
export const createConsoleEmailProvider = (): EmailProvider => ({
	async send(input) {
		const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;
		console.info(`\n[email:console] to=${to} subject="${input.subject}"`);
		if (input.text) {
			console.info(input.text);
		}
		return { id: `console:${Date.now()}`, provider: "console" };
	},
});

export const createResendEmailProvider = (
	apiKey: string,
	from: EmailAddress = DEFAULT_FROM,
): EmailProvider => {
	const resend = new Resend(apiKey);

	return {
		async send(input) {
			const { data, error } = await resend.emails.send({
				from: input.from ?? from,
				to: input.to,
				subject: input.subject,
				replyTo: input.replyTo,
				html: input.html ?? input.text ?? "",
				text: input.text,
			});

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
		cachedProvider = serverEnv.RESEND_API_KEY
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
