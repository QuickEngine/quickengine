import {
	createNotification,
	type NotificationInput,
	type NotificationRow,
} from "@quickengine/db";
import { getEmailProvider, type SendEmailInput } from "@quickengine/email";

// notify() is the one seam apps call to tell a user something. It always writes the
// durable in-app row, and optionally sends an email alongside it. Triggers (membership,
// later assignments/payments/security) call this rather than touching db + email directly.
export type NotifyInput = NotificationInput & {
	// Optional email delivery alongside the in-app notification.
	email?: SendEmailInput;
};

/**
 * Returns null when the notification was already in the inbox.
 *
 * 🔑 That happens when the caller supplied a `sourceKey` and this exact fact has
 * been recorded before — a redelivered event, usually. The email still sends: a
 * caller reaching for `notify` with an email attached wants the person told, and
 * suppressing it here would silently drop the first email if the row happened to
 * be written by another path first. Callers that must not repeat an email should
 * check the result.
 */
export async function notify(
	input: NotifyInput,
): Promise<NotificationRow | null> {
	const { email, ...notification } = input;
	const row = await createNotification(notification);

	if (email) {
		try {
			await getEmailProvider().send(email);
		} catch (error) {
			// Email is best-effort: the in-app row is the durable record, so a delivery
			// failure must never fail the notification (or the action that triggered it).
			// Moving delivery to a durable Inngest job is a later refinement.
			console.error(
				`[notify] email delivery failed (${error instanceof Error ? error.name : "UnknownError"})`,
			);
		}
	}

	return row;
}

// Email-only send, for recipients who have no account yet (e.g. an invitee). There's
// no in-app inbox to write to, so this is a thin, best-effort wrapper over the provider.
export async function sendNotificationEmail(
	email: SendEmailInput,
): Promise<void> {
	try {
		await getEmailProvider().send(email);
	} catch (error) {
		console.error(
			`[notify] email delivery failed (${error instanceof Error ? error.name : "UnknownError"})`,
		);
	}
}
