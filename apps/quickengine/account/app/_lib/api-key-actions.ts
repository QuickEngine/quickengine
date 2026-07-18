"use server";

import {
	API_CAPABILITIES,
	issueApiKey,
	revokeApiKey,
} from "@quickengine/auth/api-keys";
import { getSession } from "@quickengine/auth/server";
import { and, db, eq } from "@quickengine/db";
import type { QuickEngineApiKeyType } from "@quickengine/db/schema/quickengine";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export type CreatedApiKey = {
	name: string;
	type: QuickEngineApiKeyType;
	prefix: string;
	/** The full secret — shown to the operator exactly once. */
	plaintext: string;
};

export type CreateApiKeyState = {
	error: string | null;
	created: CreatedApiKey | null;
};

export type RevokeApiKeyState = { error: string | null };

const KEY_TYPES: readonly QuickEngineApiKeyType[] = [
	"publishable",
	"secret",
	"scoped",
];

// Named expiry windows the UI offers. Kept server-side so a client can't ask for an
// arbitrary one.
const EXPIRY_DAYS: Record<string, number | null> = {
	never: null,
	"30": 30,
	"90": 90,
	"365": 365,
};

const isKnownCapability = (value: string): boolean =>
	(API_CAPABILITIES as readonly string[]).includes(value);

// Owner-only workspace lookup, mirroring the other workspace actions.
async function ownedWorkspace(
	userId: string,
	workspaceId: string,
	slug: string,
) {
	const [workspace] = await db
		.select({
			id: quickengineWorkspaces.id,
			archivedAt: quickengineWorkspaces.archivedAt,
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				eq(quickengineWorkspaces.slug, slug),
				eq(quickengineWorkspaces.ownerId, userId),
			),
		)
		.limit(1);
	return workspace ?? null;
}

export async function createApiKeyAction(
	_previous: CreateApiKeyState,
	formData: FormData,
): Promise<CreateApiKeyState> {
	const session = await getSession(await headers());
	if (!session) {
		return {
			error: "Your session expired. Please sign in again.",
			created: null,
		};
	}

	const workspaceId = String(formData.get("workspaceId") ?? "");
	const slug = String(formData.get("slug") ?? "");
	const name = String(formData.get("name") ?? "").trim();
	const type = String(formData.get("type") ?? "") as QuickEngineApiKeyType;
	const expiryChoice = String(formData.get("expiry") ?? "never");
	const capabilities = formData.getAll("capability").map(String);

	if (!name) return { error: "Give the key a name.", created: null };
	if (name.length > 80) {
		return {
			error: "Key names must be 80 characters or fewer.",
			created: null,
		};
	}
	if (!KEY_TYPES.includes(type)) {
		return { error: "Choose a valid key type.", created: null };
	}
	if (!(expiryChoice in EXPIRY_DAYS)) {
		return { error: "Choose a valid expiry.", created: null };
	}
	if (!capabilities.some(isKnownCapability)) {
		return { error: "Select at least one capability.", created: null };
	}

	const workspace = await ownedWorkspace(session.user.id, workspaceId, slug);
	if (!workspace) return { error: "Workspace not found.", created: null };
	if (workspace.archivedAt) {
		return {
			error: "Restore this workspace before creating API keys.",
			created: null,
		};
	}

	const days = EXPIRY_DAYS[expiryChoice];
	const expiresAt = days
		? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
		: null;

	// issueApiKey clamps capabilities to what the key type may hold and stores only a hash.
	const issued = await issueApiKey({
		workspaceId: workspace.id,
		createdByUserId: session.user.id,
		name,
		type,
		capabilities,
		expiresAt,
	});

	revalidatePath(`/workspaces/${slug}`);
	return {
		error: null,
		created: { name, type, prefix: issued.prefix, plaintext: issued.plaintext },
	};
}

export async function revokeApiKeyAction(
	_previous: RevokeApiKeyState,
	formData: FormData,
): Promise<RevokeApiKeyState> {
	const session = await getSession(await headers());
	if (!session) {
		return { error: "Your session expired. Please sign in again." };
	}

	const workspaceId = String(formData.get("workspaceId") ?? "");
	const slug = String(formData.get("slug") ?? "");
	const keyId = String(formData.get("keyId") ?? "");

	const workspace = await ownedWorkspace(session.user.id, workspaceId, slug);
	if (!workspace) return { error: "Workspace not found." };

	const revoked = await revokeApiKey(workspace.id, keyId);
	if (!revoked) {
		return { error: "That key was already revoked or no longer exists." };
	}

	revalidatePath(`/workspaces/${slug}`);
	return { error: null };
}
