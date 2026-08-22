import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { workspaceEmailTemplates } from "./schema/workspace-email-templates";

/**
 * A business's own wording for one email.
 *
 * 🔴 Words only. Structure — line items, totals, tracking — stays generated, so
 * a business cannot send a receipt that disagrees with what was charged.
 */
export type EmailTemplateCopy = {
	subject?: string | null;
	/** The WHOLE email, as HTML the business wrote. Shell included. */
	html?: string | null;
};

/** Every override a workspace has set, keyed by template. */
export async function readEmailTemplateCopy(
	workspaceId: string,
): Promise<Record<string, EmailTemplateCopy>> {
	const rows = await db
		.select({
			templateKey: workspaceEmailTemplates.templateKey,
			subject: workspaceEmailTemplates.subject,
			html: workspaceEmailTemplates.html,
		})
		.from(workspaceEmailTemplates)
		.where(eq(workspaceEmailTemplates.workspaceId, workspaceId));

	return Object.fromEntries(
		rows.map(({ templateKey, ...copy }) => [templateKey, copy]),
	);
}

/**
 * Set or clear a business's wording for one email.
 *
 * ⚠️ Empty strings become NULL, and a row with nothing set is DELETED rather
 * than kept. "Cleared" and "never set" must behave identically — otherwise a
 * business that empties a field keeps overriding the built-in copy with
 * nothing, and its emails silently lose their heading.
 */
export async function saveEmailTemplateCopy(
	workspaceId: string,
	templateKey: string,
	copy: EmailTemplateCopy,
): Promise<void> {
	const clean = (value: string | null | undefined) => value?.trim() || null;
	const values = {
		subject: clean(copy.subject),
		html: clean(copy.html),
	};

	if (!values.subject && !values.html) {
		await db
			.delete(workspaceEmailTemplates)
			.where(
				and(
					eq(workspaceEmailTemplates.workspaceId, workspaceId),
					eq(workspaceEmailTemplates.templateKey, templateKey),
				),
			);
		return;
	}

	await db
		.insert(workspaceEmailTemplates)
		.values({ workspaceId, templateKey, ...values })
		.onConflictDoUpdate({
			target: [
				workspaceEmailTemplates.workspaceId,
				workspaceEmailTemplates.templateKey,
			],
			set: { ...values, updatedAt: new Date() },
		});
}
