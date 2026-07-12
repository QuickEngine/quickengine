// Invoice lifecycle, kept pure so the state machine is testable without a DB.

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Draft → sent → paid is the happy path; anything not yet paid can be voided. A
// paid or void invoice is terminal. Guards against illegal jumps (e.g. paid → draft).
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
	draft: ["sent", "void"],
	sent: ["paid", "void"],
	paid: [],
	void: [],
};

/** Whether an invoice may move from one status to another. */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
