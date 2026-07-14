export const CONTRACT_STATUSES = [
	"draft",
	"sent",
	"partially_signed",
	"completed",
	"declined",
	"expired",
	"voided",
	"superseded",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_SIGNER_STATUSES = [
	"pending",
	"signed",
	"declined",
] as const;
export type ContractSignerStatus = (typeof CONTRACT_SIGNER_STATUSES)[number];

const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> =
	{
		draft: ["sent", "voided"],
		sent: [
			"partially_signed",
			"completed",
			"declined",
			"expired",
			"voided",
			"superseded",
		],
		partially_signed: [
			"completed",
			"declined",
			"expired",
			"voided",
			"superseded",
		],
		completed: ["superseded"],
		declined: ["superseded"],
		expired: ["superseded"],
		voided: [],
		superseded: [],
	};

const SIGNER_TRANSITIONS: Record<
	ContractSignerStatus,
	readonly ContractSignerStatus[]
> = {
	pending: ["signed", "declined"],
	signed: [],
	declined: [],
};

export function canTransitionContract(
	from: ContractStatus,
	to: ContractStatus,
): boolean {
	return CONTRACT_TRANSITIONS[from].includes(to);
}

export function canTransitionContractSigner(
	from: ContractSignerStatus,
	to: ContractSignerStatus,
): boolean {
	return SIGNER_TRANSITIONS[from].includes(to);
}

export function isContractEditable(status: ContractStatus): boolean {
	return status === "draft";
}

export function canSupersedeContract(status: ContractStatus): boolean {
	return [
		"sent",
		"partially_signed",
		"completed",
		"declined",
		"expired",
	].includes(status);
}

export function contractStatusFromSigners(
	statuses: readonly ContractSignerStatus[],
): "sent" | "partially_signed" | "completed" | "declined" {
	if (statuses.length === 0) throw new Error("CONTRACT_REQUIRES_SIGNERS");
	if (statuses.includes("declined")) return "declined";
	const signed = statuses.filter((status) => status === "signed").length;
	if (signed === statuses.length) return "completed";
	return signed > 0 ? "partially_signed" : "sent";
}
