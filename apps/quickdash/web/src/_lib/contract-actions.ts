import { workspaceApi } from "../lib/api";
import type { QuickDashContext } from "../lib/quickdash-api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type ContractSignerLink = { name: string; email: string; url: string };
export type ContractActionState = ActionState & {
	invitations: ContractSignerLink[] | null;
};

const state = async (
	operation: () => Promise<unknown>,
): Promise<ContractActionState> => ({
	...(await actionResult(operation, "We couldn't save this agreement.")),
	invitations: null,
});

const contractInput = (form: FormData) => ({
	clientId: String(form.get("clientId") ?? ""),
	fileVersionId: String(form.get("fileVersionId") ?? ""),
	title: String(form.get("title") ?? ""),
	description: String(form.get("description") ?? "") || null,
	effectiveOn: String(form.get("effectiveOn") ?? "") || null,
	endsOn: String(form.get("endsOn") ?? "") || null,
	signers: form.getAll("signerName").map((name, index) => ({
		name: String(name),
		email: String(form.getAll("signerEmail")[index] ?? ""),
		role: String(form.getAll("signerRole")[index] ?? "") || null,
	})),
});

export function createContractAction(
	_previous: ContractActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return state(async () => {
		const context = (await api.request<QuickDashContext>("/quickdash/context"))
			.data;
		const settings = context.modules.find(
			(module) => module.id === "contracts-esign",
		)?.settings as { contractNumberPrefix?: string } | undefined;
		await api.request("/contracts", {
			method: "POST",
			body: {
				...contractInput(form),
				numberPrefix: settings?.contractNumberPrefix ?? "CTR",
			},
			idempotencyKey: idempotencyKey(form),
		});
	});
}

export function updateContractAction(
	_previous: ContractActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return state(() =>
		api.contracts.update(
			String(form.get("contractId") ?? ""),
			contractInput(form),
			idempotencyKey(form),
		),
	);
}

export async function sendContractAction(
	_previous: ContractActionState,
	form: FormData,
): Promise<ContractActionState> {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	try {
		const response = await api.request<{
			invitations: Array<{ name: string; email: string; token: string }>;
		}>(`/quickdash/contracts/${String(form.get("contractId") ?? "")}/send`, {
			method: "POST",
		});
		return {
			error: null,
			completionId: crypto.randomUUID(),
			invitations: response.data.invitations.map((invitation) => ({
				name: invitation.name,
				email: invitation.email,
				url: `${window.location.origin}/sign/${invitation.token}`,
			})),
		};
	} catch (cause) {
		return {
			error:
				cause instanceof Error
					? cause.message
					: "We couldn't send this agreement.",
			completionId: null,
			invitations: null,
		};
	}
}

export function changeContractStatusAction(
	_previous: ContractActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const id = String(form.get("contractId") ?? "");
	const target = String(form.get("target") ?? "");
	const key = idempotencyKey(form);
	return state(() => {
		switch (target) {
			case "void":
				return api.contracts.void(id, key);
			case "expire":
				return api.contracts.expire(id, key);
			case "revise":
				return api.contracts.revise(id, key);
			case "delete":
				return api.contracts.delete(id, key);
			default:
				throw new Error("Invalid agreement action.");
		}
	});
}
