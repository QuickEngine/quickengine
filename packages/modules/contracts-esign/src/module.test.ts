import { describe, expect, it } from "vitest";
import {
	contractInputSchema,
	formatContractNumber,
	signatureEvidenceInputSchema,
} from "./contract";
import { contractsEsignModule, contractsEsignSettingsSchema } from "./module";
import {
	canSupersedeContract,
	canTransitionContract,
	canTransitionContractSigner,
	contractStatusFromSigners,
	isContractEditable,
} from "./status";

const clientId = "00000000-0000-4000-8000-000000000301";
const fileVersionId = "00000000-0000-4000-8000-000000000302";

function contract(overrides: Record<string, unknown> = {}) {
	return {
		clientId,
		fileVersionId,
		title: "Website services agreement",
		effectiveOn: "2026-07-14",
		endsOn: "2027-07-14",
		signers: [
			{ name: "Ada Lovelace", email: " ADA@EXAMPLE.COM ", role: "Client" },
		],
		...overrides,
	};
}

describe("Contracts & E-sign module", () => {
	it("is shared, unmetered, and anchored to clients plus immutable files", () => {
		expect(contractsEsignModule).toMatchObject({
			id: "contracts-esign",
			kind: "shared",
			dependsOn: ["client-records", "files"],
			meteredAction: null,
		});
	});

	it("uses practical numbering, expiry, and consent defaults", () => {
		expect(contractsEsignSettingsSchema.parse({})).toEqual({
			contractNumberPrefix: "CTR",
			defaultSigningExpiryDays: 14,
			defaultConsentText:
				"I have reviewed this agreement and agree to sign it electronically.",
		});
	});
});

describe("contract document and signer contract", () => {
	it("normalizes signer identity and accepts real agreement dates", () => {
		expect(contractInputSchema.parse(contract())).toMatchObject({
			title: "Website services agreement",
			signers: [{ email: "ada@example.com", role: "Client" }],
		});
	});

	it("rejects impossible dates, reversed terms, and duplicate signer emails", () => {
		expect(() =>
			contractInputSchema.parse(contract({ effectiveOn: "2026-02-30" })),
		).toThrow();
		expect(() =>
			contractInputSchema.parse(
				contract({ effectiveOn: "2027-01-01", endsOn: "2026-01-01" }),
			),
		).toThrow();
		expect(() =>
			contractInputSchema.parse(
				contract({
					signers: [
						{ name: "Ada", email: "ada@example.com" },
						{ name: "Ada Again", email: "ADA@example.com" },
					],
				}),
			),
		).toThrow();
	});

	it("requires explicit consent and a typed signer name", () => {
		expect(
			signatureEvidenceInputSchema.parse({
				typedName: " Ada Lovelace ",
				consentAccepted: true,
			}),
		).toMatchObject({ typedName: "Ada Lovelace", consentAccepted: true });
		expect(() =>
			signatureEvidenceInputSchema.parse({
				typedName: "Ada Lovelace",
				consentAccepted: false,
			}),
		).toThrow();
	});
});

describe("contract lifecycle", () => {
	it("edits only drafts and locks the agreement after sending", () => {
		expect(isContractEditable("draft")).toBe(true);
		expect(isContractEditable("sent")).toBe(false);
		expect(canTransitionContract("draft", "sent")).toBe(true);
		expect(canTransitionContract("sent", "draft")).toBe(false);
	});

	it("derives progress from signer outcomes", () => {
		expect(contractStatusFromSigners(["pending", "pending"])).toBe("sent");
		expect(contractStatusFromSigners(["signed", "pending"])).toBe(
			"partially_signed",
		);
		expect(contractStatusFromSigners(["signed", "signed"])).toBe("completed");
		expect(contractStatusFromSigners(["signed", "declined"])).toBe("declined");
	});

	it("allows each signer exactly one terminal decision", () => {
		expect(canTransitionContractSigner("pending", "signed")).toBe(true);
		expect(canTransitionContractSigner("pending", "declined")).toBe(true);
		expect(canTransitionContractSigner("signed", "declined")).toBe(false);
		expect(canTransitionContractSigner("declined", "signed")).toBe(false);
	});

	it("supersedes presented history instead of rewriting it", () => {
		for (const status of [
			"sent",
			"partially_signed",
			"completed",
			"declined",
			"expired",
		] as const) {
			expect(canSupersedeContract(status)).toBe(true);
			expect(canTransitionContract(status, "superseded")).toBe(true);
		}
		expect(canSupersedeContract("draft")).toBe(false);
		expect(canSupersedeContract("voided")).toBe(false);
	});

	it("keeps revisions under a recognizable agreement number", () => {
		expect(formatContractNumber("CTR", 7)).toBe("CTR-0007");
		expect(formatContractNumber("CTR", 7, 2)).toBe("CTR-0007-R2");
	});
});
