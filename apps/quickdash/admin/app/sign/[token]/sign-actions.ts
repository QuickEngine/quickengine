"use server";

import {
	declineContract,
	signContract,
} from "@quickengine/mod-contracts-esign";
import { headers } from "next/headers";

export type SigningActionState = {
	error: string | null;
	done: "signed" | "declined" | null;
};

const friendlyFailure = (error: unknown) => {
	if (!(error instanceof Error))
		return "Something went wrong. Please try again.";
	switch (error.message) {
		case "SIGNING_TOKEN_INVALID":
		case "CONTRACT_NOT_FOUND":
			return "This signing link is no longer valid.";
		case "SIGNING_TOKEN_USED":
			return "This link has already been used.";
		case "SIGNING_TOKEN_EXPIRED":
			return "This signing link has expired.";
		case "CONTRACT_CONCURRENT_UPDATE":
			return "This agreement just changed. Please refresh and try again.";
		default:
			break;
	}
	if (error.name === "ZodError") {
		return "Type your full legal name and accept the consent to sign.";
	}
	return "We couldn't record that. Please try again.";
};

async function requestEvidence() {
	const requestHeaders = await headers();
	const forwarded = requestHeaders.get("x-forwarded-for");
	return {
		userAgent: requestHeaders.get("user-agent"),
		ipAddress:
			forwarded?.split(",")[0]?.trim() ??
			requestHeaders.get("x-real-ip") ??
			null,
	};
}

export async function signAction(
	_previous: SigningActionState,
	formData: FormData,
): Promise<SigningActionState> {
	const token = String(formData.get("token") ?? "");
	const typedName = String(formData.get("typedName") ?? "").trim();
	const consentAccepted = formData.get("consent") === "on";
	if (!consentAccepted) {
		return { error: "You must accept the consent to sign.", done: null };
	}
	try {
		const evidence = await requestEvidence();
		await signContract(token, {
			typedName,
			consentAccepted: true,
			userAgent: evidence.userAgent,
			ipAddress: evidence.ipAddress,
		});
	} catch (error) {
		return { error: friendlyFailure(error), done: null };
	}
	return { error: null, done: "signed" };
}

export async function declineAction(
	_previous: SigningActionState,
	formData: FormData,
): Promise<SigningActionState> {
	const token = String(formData.get("token") ?? "");
	try {
		await declineContract(token);
	} catch (error) {
		return { error: friendlyFailure(error), done: null };
	}
	return { error: null, done: "declined" };
}
