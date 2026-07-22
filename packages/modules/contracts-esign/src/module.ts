import { z } from "zod";

export const contractNumberPrefixSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z][A-Z0-9-]{0,11}$/);

export const contractsEsignSettingsSchema = z.object({
	contractNumberPrefix: contractNumberPrefixSchema.default("CTR"),
	defaultSigningExpiryDays: z.number().int().min(1).max(90).default(14),
	defaultConsentText: z
		.string()
		.trim()
		.min(1)
		.max(1_000)
		.default(
			"I have reviewed this agreement and agree to sign it electronically.",
		),
});

export type ContractsEsignSettings = z.infer<
	typeof contractsEsignSettingsSchema
>;

export const contractsEsignModule = {
	id: "contracts-esign",
	name: "Contracts & E-sign",
	description:
		"Send an immutable agreement file to named signers and preserve consent, signature evidence, and an append-only audit history.",
	kind: "shared",
	dependsOn: ["client-records", "files"] as const,
	// Signing is a business outcome. Storage and delivered email are metered by
	// their owning infrastructure boundaries rather than charging per signature.
	meteredAction: null,
	settingsSchema: contractsEsignSettingsSchema,
	defaultSettings: contractsEsignSettingsSchema.parse({}),
	firstActions: [
		{
			id: "contracts-esign:create",
			version: 1,
			label: "Create your first contract",
			description: "Prepare an agreement for a client to review and sign.",
			moduleId: "contracts-esign",
			intent: "create",
			priority: 40,
			requires: ["client-records:create", "files:upload"],
			steps: [
				{
					id: "contracts-esign:create:draft",
					version: 1,
					label: "Prepare the agreement",
					description:
						"Choose the client, document, signers, and signing terms.",
					intent: "create",
				},
				{
					id: "contracts-esign:create:send",
					version: 1,
					label: "Send it for signature",
					description:
						"Review the agreement and send the immutable signing request.",
					intent: "send",
				},
			],
		},
	] as const,
} as const;
