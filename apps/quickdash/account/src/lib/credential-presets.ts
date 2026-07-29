export type CredentialPurpose =
	| "public-storefront"
	| "trusted-backend"
	| "reporting"
	| "webhook-worker"
	| "custom";

export type CredentialPreset = {
	label: string;
	description: string;
	type: "publishable" | "secret" | "scoped";
	selectCapabilities: (available: readonly string[]) => string[];
};

export const credentialPresets: Record<CredentialPurpose, CredentialPreset> = {
	"public-storefront": {
		label: "Public storefront",
		description:
			"Browser-safe catalog reads and privacy-minimal traffic events only.",
		type: "publishable",
		selectCapabilities: (available) =>
			["catalog:read", "events:write"].filter((item) =>
				available.includes(item),
			),
	},
	"trusted-backend": {
		label: "Trusted backend",
		description:
			"Full workspace access for a private server. Never expose this key to a browser or mobile bundle.",
		type: "secret",
		selectCapabilities: (available) => [...available],
	},
	reporting: {
		label: "Reporting / read-only",
		description:
			"Read-only access for reporting, exports, and data warehouses.",
		type: "scoped",
		selectCapabilities: (available) =>
			available.filter((item) => item.endsWith(":read")),
	},
	"webhook-worker": {
		label: "Webhook worker",
		description:
			"Manage webhook endpoints and deliveries without access to unrelated business records.",
		type: "scoped",
		selectCapabilities: (available) =>
			["webhooks:read", "webhooks:write"].filter((item) =>
				available.includes(item),
			),
	},
	custom: {
		label: "Custom least privilege",
		description: "Choose only the operations this integration genuinely needs.",
		type: "scoped",
		selectCapabilities: () => [],
	},
};
