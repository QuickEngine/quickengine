// Invoice lifecycle, kept pure so the state machine is testable without a DB.

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Draft → sent → paid is the happy path. A draft can also be paid directly (a
// payment link settles it before it was formally "sent"). Anything not yet paid can
// be voided. Paid and void are terminal — guards against illegal jumps (e.g.
// paid → draft).
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
	draft: ["sent", "paid", "void"],
	sent: ["paid", "void"],
	paid: [],
	void: [],
};

/** Whether an invoice may move from one status to another. */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
