export type ActionState = {
	error: string | null;
	completionId: string | null;
};

export async function actionResult(
	operation: () => Promise<unknown>,
	fallback: string,
): Promise<ActionState> {
	try {
		await operation();
		return { error: null, completionId: crypto.randomUUID() };
	} catch (cause) {
		return {
			error: cause instanceof Error ? cause.message : fallback,
			completionId: null,
		};
	}
}

export const idempotencyKey = (form: FormData) =>
	String(form.get("idempotencyKey") ?? "") || crypto.randomUUID();

export function cents(value: FormDataEntryValue | null): number | null {
	const text = String(value ?? "")
		.trim()
		.replace(/^[\p{Sc}]\s*/u, "")
		.replaceAll(",", "");
	if (!text) return null;
	if (!/^\d+(\.\d{1,2})?$/.test(text)) {
		throw new Error(
			"Enter a valid price, such as 24.00, with no more than two decimals.",
		);
	}
	const [whole, fraction = ""] = text.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
