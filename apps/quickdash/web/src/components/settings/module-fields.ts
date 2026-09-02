/**
 * What each module lets a workspace configure, in words a person recognises.
 *
 * 🔴 Hand-written, not generated from the zod schemas. The API validates with
 * those schemas and they are the authority on what is ACCEPTED — but a schema
 * knows a field is `z.number().int().min(0).max(10_000)`, not that it is sales
 * tax in basis points and that 1300 means 13%. The labels are the whole point
 * of a settings screen; a generated form would produce "taxRateBasisPoints" and
 * a number box, which is exactly the screen nobody can use.
 *
 * ⚠️ Every field here MUST exist in that module's `settingsSchema`, and the
 * whole object is sent on save — the route parses the complete schema, not a
 * patch. A field named wrongly here is a 400, not a silent no-op.
 */

export type Field =
	| {
			kind: "text";
			path: string;
			label: string;
			hint?: string;
			max?: number;
			placeholder?: string;
	  }
	| {
			kind: "number";
			path: string;
			label: string;
			hint?: string;
			min?: number;
			max?: number;
			suffix?: string;
	  }
	| { kind: "toggle"; path: string; label: string; hint?: string }
	| {
			kind: "select";
			path: string;
			label: string;
			hint?: string;
			options: ReadonlyArray<{ value: string; label: string }>;
	  }
	/** Sales tax held as basis points, shown and typed as a percentage. */
	| { kind: "percent"; path: string; label: string; hint?: string }
	/** An integer number of cents, shown and typed as a decimal amount. */
	| { kind: "money"; path: string; label: string; hint?: string }
	/** ISO 4217, picked from a searchable list rather than typed. */
	| { kind: "currency"; path: string; label: string; hint?: string };

export type ModuleSettings = {
	/** One line under the heading saying what this section governs. */
	blurb: string;
	fields: readonly Field[];
};

const CURRENCY: Field = {
	kind: "currency",
	path: "defaultCurrency",
	label: "Currency",
	hint: "What this workspace prices and bills in.",
};

export const MODULE_SETTINGS: Readonly<Record<string, ModuleSettings>> = {
	orders: {
		blurb: "How orders are numbered, priced and confirmed.",
		fields: [
			{
				kind: "text",
				path: "numberPrefix",
				label: "Order number prefix",
				hint: "Orders read ORD-0001.",
				max: 12,
				placeholder: "ORD",
			},
			CURRENCY,
			{
				kind: "toggle",
				path: "autoConfirm",
				label: "Confirm paid orders automatically",
				hint: "Off means every paid order waits for somebody to accept it.",
			},
			{
				kind: "percent",
				path: "taxRateBasisPoints",
				label: "Sales tax",
				hint: "One flat rate. Correct inside a single jurisdiction, wrong across several.",
			},
		],
	},
	inventory: {
		blurb: "When stock counts as low, and whether it can go below zero.",
		fields: [
			{
				kind: "number",
				path: "defaultLowStockThreshold",
				label: "Low stock at",
				min: 0,
				suffix: "units",
				hint: "Anything at or under this is flagged.",
			},
			{
				kind: "toggle",
				path: "allowNegativeStock",
				label: "Let stock go below zero",
				hint: "On lets you sell what you have not counted yet.",
			},
		],
	},
	invoicing: {
		blurb: "How invoices are numbered, billed and when they fall due.",
		fields: [
			{
				kind: "text",
				path: "numberPrefix",
				label: "Invoice number prefix",
				max: 12,
				placeholder: "INV",
			},
			CURRENCY,
			{
				kind: "number",
				path: "defaultDueInDays",
				label: "Payable within",
				min: 0,
				max: 365,
				suffix: "days",
			},
		],
	},
	payments: {
		blurb: "What you collect in, and what the customer's bank shows them.",
		fields: [
			CURRENCY,
			{
				kind: "text",
				path: "statementDescriptor",
				label: "Statement descriptor",
				hint: "What appears on a card statement. 22 characters at most.",
				max: 22,
			},
		],
	},
	"products-services": {
		blurb: "What you call the things you sell, and how they are priced.",
		fields: [
			CURRENCY,
			{
				kind: "text",
				path: "productLabelPlural",
				label: "Products are called",
				max: 40,
				placeholder: "Products",
			},
			{
				kind: "text",
				path: "serviceLabelPlural",
				label: "Services are called",
				max: 40,
				placeholder: "Services",
			},
			{
				kind: "toggle",
				path: "showSku",
				label: "Show SKUs",
				hint: "Off hides the code column for a business that does not use them.",
			},
		],
	},
	"client-records": {
		blurb:
			"What you call the people you deal with, and what you record about them.",
		fields: [
			{
				kind: "text",
				path: "recordLabelSingular",
				label: "One of them is a",
				hint: "Customer, client, patient, student.",
				max: 40,
				placeholder: "Customer",
			},
			{
				kind: "text",
				path: "recordLabelPlural",
				label: "Many of them are",
				max: 40,
				placeholder: "Customers",
			},
			{ kind: "toggle", path: "fields.phone", label: "Record a phone number" },
			{ kind: "toggle", path: "fields.company", label: "Record a company" },
			{ kind: "toggle", path: "fields.notes", label: "Record notes" },
		],
	},
	"quotes-estimates": {
		blurb:
			"How quotes, estimates and proposals are numbered and how long they stand.",
		fields: [
			{
				kind: "text",
				path: "quoteNumberPrefix",
				label: "Quote prefix",
				max: 12,
				placeholder: "QTE",
			},
			{
				kind: "text",
				path: "estimateNumberPrefix",
				label: "Estimate prefix",
				max: 12,
				placeholder: "EST",
			},
			{
				kind: "text",
				path: "proposalNumberPrefix",
				label: "Proposal prefix",
				max: 12,
				placeholder: "PRO",
			},
			CURRENCY,
			{
				kind: "number",
				path: "defaultValidityDays",
				label: "Valid for",
				min: 1,
				max: 365,
				suffix: "days",
			},
		],
	},
	"contracts-esign": {
		blurb:
			"How agreements are numbered, how long a signing link lasts, and what a signer agrees to.",
		fields: [
			{
				kind: "text",
				path: "contractNumberPrefix",
				label: "Contract prefix",
				max: 12,
				placeholder: "CTR",
			},
			{
				kind: "number",
				path: "defaultSigningExpiryDays",
				label: "Signing link lasts",
				min: 1,
				max: 90,
				suffix: "days",
			},
			{
				kind: "text",
				path: "defaultConsentText",
				label: "Consent wording",
				hint: "Shown above the signature. This is what they are agreeing to.",
				max: 1000,
			},
		],
	},
	bookings: {
		blurb:
			"How long an appointment runs, and whether a customer can cancel it.",
		fields: [
			{
				kind: "text",
				path: "defaultTimeZone",
				label: "Time zone",
				hint: "An IANA name, e.g. America/Toronto.",
				placeholder: "UTC",
			},
			{
				kind: "number",
				path: "defaultDurationMinutes",
				label: "Appointments last",
				min: 1,
				max: 10080,
				suffix: "minutes",
			},
			{
				kind: "toggle",
				path: "allowClientCancellation",
				label: "Customers can cancel their own booking",
			},
			{
				kind: "number",
				path: "cancellationNoticeHours",
				label: "Notice required",
				min: 0,
				max: 8760,
				suffix: "hours",
			},
		],
	},
	"time-tracking": {
		blurb:
			"Whether time is billable by default, at what rate, and how it rounds.",
		fields: [
			{
				kind: "toggle",
				path: "defaultBillable",
				label: "New entries are billable",
			},
			{
				kind: "money",
				path: "defaultHourlyRateCents",
				label: "Hourly rate",
				hint: "Leave blank to set it per project.",
			},
			CURRENCY,
			{
				kind: "text",
				path: "defaultTimeZone",
				label: "Time zone",
				placeholder: "UTC",
			},
			{
				kind: "select",
				path: "billingRounding.mode",
				label: "Round time",
				options: [
					{ value: "none", label: "Not at all" },
					{ value: "nearest", label: "To the nearest increment" },
					{ value: "up", label: "Up to the next increment" },
				],
			},
			{
				kind: "number",
				path: "billingRounding.incrementMinutes",
				label: "Rounding increment",
				min: 1,
				max: 480,
				suffix: "minutes",
			},
			{
				kind: "toggle",
				path: "requireApprovalBeforeInvoicing",
				label: "Approve time before it can be invoiced",
			},
		],
	},
	"projects-tasks": {
		blurb:
			"Whether work can exist without a customer, and how tasks start out.",
		fields: [
			{
				kind: "toggle",
				path: "allowInternalProjects",
				label: "Allow projects with no customer",
			},
			{ kind: "toggle", path: "allowSubtasks", label: "Allow subtasks" },
			{
				kind: "select",
				path: "defaultTaskPriority",
				label: "New tasks start at",
				options: [
					{ value: "low", label: "Low" },
					{ value: "normal", label: "Normal" },
					{ value: "high", label: "High" },
					{ value: "urgent", label: "Urgent" },
				],
			},
		],
	},
	fulfillment: {
		blurb:
			"What kind of thing you usually deliver, and what you call it when it lands.",
		fields: [
			{
				kind: "select",
				path: "defaultKind",
				label: "Usually",
				options: [
					{ value: "physical", label: "Something physical" },
					{ value: "digital", label: "Something digital" },
					{ value: "service", label: "A service" },
					{ value: "pickup", label: "Collected in person" },
					{ value: "other", label: "Something else" },
				],
			},
			{
				kind: "text",
				path: "completionLabel",
				label: "Finished means",
				hint: "Delivered, Collected, Completed.",
				max: 40,
				placeholder: "Delivered",
			},
		],
	},
	files: {
		blurb:
			"What happens to a document already attached somewhere when you replace it.",
		fields: [
			{
				kind: "select",
				path: "defaultAttachmentMode",
				label: "An attachment points at",
				hint: "Pinned keeps the file an invoice was sent with. Latest silently updates it.",
				options: [
					{ value: "pinned", label: "The version it was attached with" },
					{ value: "latest", label: "Whatever the newest version is" },
				],
			},
		],
	},
	content: {
		blurb: "Whether edits to your site go live as you save them.",
		fields: [
			{
				kind: "toggle",
				path: "publishOnSave",
				label: "Publish the moment I save",
				hint: "Off means publishing is a second, deliberate action.",
			},
		],
	},
	"reporting-analytics": {
		blurb:
			"Which day a week starts on, and the clock your numbers are counted against.",
		fields: [
			{
				kind: "text",
				path: "defaultTimeZone",
				label: "Time zone",
				hint: "An IANA name, e.g. America/Toronto.",
				placeholder: "UTC",
			},
			{
				kind: "select",
				path: "weekStartsOn",
				label: "Weeks start on",
				options: [
					{ value: "monday", label: "Monday" },
					{ value: "sunday", label: "Sunday" },
				],
			},
		],
	},
	shipping: {
		blurb:
			"Your default carrier, and whether a shipment must carry a tracking number.",
		fields: [
			{
				kind: "text",
				path: "defaultCarrier",
				label: "Default carrier",
				hint: "Leave blank to choose per shipment.",
				max: 80,
			},
			{
				kind: "toggle",
				path: "requireTracking",
				label: "A shipment must have a tracking number",
			},
		],
	},
};
