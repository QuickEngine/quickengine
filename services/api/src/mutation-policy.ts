import type { MutationExecutionContext } from "@quickengine/api-contracts/mutations";
import { idempotencyKeySchema } from "@quickengine/api-contracts/mutations";
import type { AuthorizedApiContext } from "./platform-types";

export class MutationPolicyError extends Error {
	constructor(
		readonly code: "IDEMPOTENCY_REQUIRED" | "VALIDATION_ERROR",
		message: string,
	) {
		super(message);
		this.name = "MutationPolicyError";
	}
}

function canonicalize(value: unknown, seen = new WeakSet<object>()): string {
	if (value === null) return "null";
	if (typeof value === "string" || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value))
			throw new TypeError("Canonical input must be finite");
		return JSON.stringify(value);
	}
	if (value instanceof Date) return JSON.stringify(value.toISOString());
	if (Array.isArray(value)) {
		if (seen.has(value))
			throw new TypeError("Canonical input must not be cyclic");
		seen.add(value);
		try {
			return `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
		} finally {
			seen.delete(value);
		}
	}
	if (typeof value === "object") {
		if (seen.has(value))
			throw new TypeError("Canonical input must not be cyclic");
		seen.add(value);
		try {
			const entries = Object.entries(value as Record<string, unknown>)
				.filter(([, child]) => child !== undefined)
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
			return `{${entries
				.map(
					([key, child]) =>
						`${JSON.stringify(key)}:${canonicalize(child, seen)}`,
				)
				.join(",")}}`;
		} finally {
			seen.delete(value);
		}
	}
	throw new TypeError("Canonical input must be JSON-compatible");
}

export async function fingerprintCanonicalInput(
	value: unknown,
): Promise<string> {
	const bytes = new TextEncoder().encode(canonicalize(value));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

/** Call only after authorization, route rate limiting, and schema validation. */
export async function buildMutationContext(input: {
	authorized: AuthorizedApiContext;
	abortSignal: AbortSignal;
	canonicalInput: unknown;
	deadlineAtMs: number;
	idempotencyKey?: string;
	operation: string;
	requestId: string;
}): Promise<MutationExecutionContext> {
	if (!input.idempotencyKey) {
		throw new MutationPolicyError(
			"IDEMPOTENCY_REQUIRED",
			"An Idempotency-Key header is required for this operation.",
		);
	}
	const parsedKey = idempotencyKeySchema.safeParse(input.idempotencyKey);
	if (!parsedKey.success) {
		throw new MutationPolicyError(
			"VALIDATION_ERROR",
			"The Idempotency-Key header is invalid.",
		);
	}
	if (!/^[a-z0-9][a-z0-9._-]*$/.test(input.operation)) {
		throw new TypeError(
			"Mutation operation IDs must be stable lowercase identifiers",
		);
	}

	return {
		abortSignal: input.abortSignal,
		actor: input.authorized.auditActor,
		deadlineAtMs: input.deadlineAtMs,
		fingerprint: await fingerprintCanonicalInput(input.canonicalInput),
		idempotencyKey: parsedKey.data,
		operation: input.operation,
		organizationId: input.authorized.workspace.organizationId,
		requestId: input.requestId,
		source: "api",
		workspaceId: input.authorized.workspaceId,
	};
}
