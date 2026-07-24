import { z } from "zod";

export const idempotencyKeySchema = z
	.string()
	.trim()
	.min(8)
	.max(200)
	.regex(
		/^[A-Za-z0-9._:-]+$/,
		"Use letters, numbers, periods, underscores, colons, or hyphens.",
	);

export type MutationAuditActor = {
	id: string;
	type: "api_key" | "user";
};

/**
 * Transport-neutral context every authoritative mutation receives. The abort signal is
 * cooperative: commands must pass it to providers and check it before opening a transaction.
 */
export type MutationExecutionContext = {
	abortSignal: AbortSignal;
	actor: MutationAuditActor;
	/** Unix epoch milliseconds. */
	deadlineAtMs: number;
	/** Hash of canonical, validated params and input. Never hash an unvalidated raw body. */
	fingerprint: string;
	idempotencyKey: string;
	operation: string;
	organizationId: string | null;
	requestId: string;
	source: "account" | "agent" | "api" | "job" | "quickdash" | "system";
	workspaceId: string;
};

export type AuditIntent = {
	action: string;
	metadata?: Record<string, string | number | boolean | null>;
	resourceId: string;
	resourceType: string;
};

export type OutboxIntent = {
	aggregateId: string;
	aggregateType: string;
	eventName: string;
	/** Minimal, version-schema-validated, secret-free payload. */
	payload: Record<string, unknown>;
	version: number;
};

export type MutationResult<TResult> =
	| {
			kind: "success";
			result: TResult;
			source: "executed" | "replayed";
			status: number;
	  }
	| { kind: "conflict" }
	| { kind: "in_progress"; retryAfterSeconds: number };

export type MutationCommit<TResult> = {
	result: TResult;
	status: number;
};

/**
 * The adapter must commit domain state, audit intents, and outbox intents in one database
 * transaction. External provider calls belong outside this transaction.
 */
export type MutationTransaction<DatabaseTransaction> = {
	audit(intent: AuditIntent): Promise<void>;
	db: DatabaseTransaction;
	outbox(intent: OutboxIntent): Promise<void>;
};

export type MutationUnitOfWork<DatabaseTransaction> = {
	/**
	 * The adapter owns the durable idempotency record and provenance fields. It must lock or
	 * create that record and commit it with domain state, audit, and outbox. A completed matching
	 * record replays; a mismatched fingerprint or pending record rejects without running work.
	 */
	execute<TResult>(
		context: MutationExecutionContext,
		work: (
			transaction: MutationTransaction<DatabaseTransaction>,
		) => Promise<MutationCommit<TResult>>,
	): Promise<MutationResult<TResult>>;
};

function canonicalize(value: unknown, seen = new WeakSet<object>()): string {
	if (value === null) return "null";
	if (typeof value === "string" || typeof value === "boolean")
		return JSON.stringify(value);
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
			return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child, seen)}`).join(",")}}`;
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
