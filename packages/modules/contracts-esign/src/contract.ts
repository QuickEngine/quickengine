import { z } from "zod";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

function isRealCalendarDate(value: string): boolean {
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

export const contractCalendarDateSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(isRealCalendarDate, "Invalid calendar date");

export const contractSignerInputSchema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.string().trim().toLowerCase().pipe(z.email()),
	role: z.string().trim().min(1).max(100).nullable().default(null),
});

export type ContractSignerInput = z.input<typeof contractSignerInputSchema>;
export type ContractSigner = z.output<typeof contractSignerInputSchema>;

export const contractInputSchema = z
	.object({
		clientId: z.uuid(),
		fileVersionId: z.uuid(),
		title: z.string().trim().min(1).max(255),
		description: z.string().trim().max(10_000).nullable().default(null),
		effectiveOn: contractCalendarDateSchema.nullable().default(null),
		endsOn: contractCalendarDateSchema.nullable().default(null),
		signers: z.array(contractSignerInputSchema).min(1).max(10),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.superRefine((contract, context) => {
		if (
			contract.effectiveOn &&
			contract.endsOn &&
			contract.endsOn < contract.effectiveOn
		) {
			context.addIssue({
				code: "custom",
				message: "Contract end date cannot precede its effective date",
				path: ["endsOn"],
			});
		}
		const emails = new Set<string>();
		for (const [index, signer] of contract.signers.entries()) {
			if (emails.has(signer.email)) {
				context.addIssue({
					code: "custom",
					message: "A signer email can appear only once",
					path: ["signers", index, "email"],
				});
			}
			emails.add(signer.email);
		}
	});

export type ContractInput = z.input<typeof contractInputSchema>;
export type Contract = z.output<typeof contractInputSchema>;

export const signatureEvidenceInputSchema = z.object({
	typedName: z.string().trim().min(1).max(200),
	consentAccepted: z.literal(true),
	userAgent: z.string().trim().max(1_000).nullable().default(null),
	ipAddress: z.string().trim().min(1).max(64).nullable().default(null),
});

export type SignatureEvidenceInput = z.input<
	typeof signatureEvidenceInputSchema
>;

export function formatContractNumber(
	prefix: string,
	sequence: number,
	revision = 1,
): string {
	if (
		!Number.isInteger(sequence) ||
		sequence < 1 ||
		sequence > POSTGRES_INTEGER_MAX
	) {
		throw new Error("CONTRACT_SEQUENCE_INVALID");
	}
	if (!Number.isInteger(revision) || revision < 1 || revision > 999) {
		throw new Error("CONTRACT_REVISION_INVALID");
	}
	const base = `${prefix}-${sequence.toString().padStart(4, "0")}`;
	return revision === 1 ? base : `${base}-R${revision}`;
}
