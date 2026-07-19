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

export async function notify(input: NotifyInput): Promise<NotificationRow> {
	const { email, ...notification } = input;
	const row = await createNotification(notification);

	if (email) {
		try {
			await getEmailProvider().send(email);
		} catch (error) {
			// Email is best-effort: the in-app row is the durable record, so a delivery
			// failure must never fail the notification (or the action that triggered it).
			// Moving delivery to a durable Inngest job is a later refinement.
			console.error("[notify] email delivery failed:", error);
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
		console.error("[notify] email delivery failed:", error);
	}
}
