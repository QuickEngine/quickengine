import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import { clientRecords } from "./schema/client-records";
import {
	customerIdentities,
	customerLoginTokens,
	customerSessions,
	workspaceCustomers,
} from "./schema/customers";

/**
 * End-customer identity — the data layer for our USERS' USERS.
 *
 * Nothing here touches `quickengine_users`. A shopper is not an operator, never
 * consumes a seat, and cannot reach QuickDash.
 *
 * 🔴 TOKENS ARE STORED HASHED, NEVER RAW. The plaintext exists for exactly as
 * long as it takes to put it in an email or a response body. A database dump
 * must not hand anybody a working session, and nothing in this file ever needs
 * the original back — verification hashes what was presented and compares.
 */

/** How long a sign-in link stays valid. */
export const LOGIN_TOKEN_TTL_MINUTES = 15;
/** How long a session lasts. Long, because re-authenticating is a magic link. */
export const SESSION_TTL_DAYS = 60;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** URL-safe, 32 bytes of entropy. Long enough that guessing is not a strategy. */
const mintToken = () => randomBytes(32).toString("base64url");

/**
 * Addresses are compared case-insensitively and stored lowercased.
 *
 * Without this, `Ash@x.com` and `ash@x.com` become two identities, and the
 * second one silently has none of the first one's order history.
 */
const normaliseEmail = (email: string) => email.trim().toLowerCase();

/**
 * Constant-time comparison of two hex digests.
 *
 * Overkill for a hash lookup, but `timingSafeEqual` throws on length mismatch,
 * so the guard is needed regardless and the property comes free.
 */
const digestsMatch = (a: string, b: string) => {
	if (a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
};

export type CustomerSessionResolution = {
	workspaceCustomerId: string;
	workspaceId: string;
	identityId: string;
	clientRecordId: string | null;
};

/** The person, independent of any workspace. Created unverified on first sight. */
export async function findOrCreateIdentity(email: string) {
	const normalised = normaliseEmail(email);
	const existing = await db
		.select()
		.from(customerIdentities)
		.where(eq(customerIdentities.email, normalised))
		.limit(1);
	if (existing[0]) return existing[0];

	const [created] = await db
		.insert(customerIdentities)
		.values({ email: normalised })
		.onConflictDoNothing({ target: customerIdentities.email })
		.returning();
	if (created) return created;

	// Lost a race with a concurrent sign-in for the same address. The row now
	// exists; read it rather than failing a request that did nothing wrong.
	const [raced] = await db
		.select()
		.from(customerIdentities)
		.where(eq(customerIdentities.email, normalised))
		.limit(1);
	if (!raced) throw new Error("Identity vanished after conflict.");
	return raced;
}

/**
 * Mint a sign-in link token.
 *
 * Returns the RAW token, which is the only moment it exists in plaintext. The
 * caller emails it and forgets it.
 */
export async function createLoginToken(input: {
	workspaceId: string;
	email: string;
}): Promise<{ token: string; expiresAt: Date }> {
	const token = mintToken();
	const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60_000);

	await db.insert(customerLoginTokens).values({
		workspaceId: input.workspaceId,
		email: normaliseEmail(input.email),
		tokenHash: hash(token),
		expiresAt,
	});

	return { token, expiresAt };
}

/**
 * Redeem a sign-in link, once.
 *
 * The consume is a conditional UPDATE rather than read-then-write: two clicks
 * arriving together would both pass a read check and both be honoured. Only one
 * UPDATE can match `consumed_at IS NULL`, so the second gets nothing back.
 *
 * ⚠️ Scoped to the workspace as well as the token. A link minted for one
 * storefront must not be redeemable at another.
 */
export async function consumeLoginToken(input: {
	workspaceId: string;
	token: string;
}): Promise<{ email: string } | null> {
	const tokenHash = hash(input.token);

	const [row] = await db
		.select()
		.from(customerLoginTokens)
		.where(
			and(
				eq(customerLoginTokens.tokenHash, tokenHash),
				eq(customerLoginTokens.workspaceId, input.workspaceId),
			),
		)
		.limit(1);

	if (!row) return null;
	if (!digestsMatch(row.tokenHash, tokenHash)) return null;
	if (row.consumedAt) return null;
	if (row.expiresAt.getTime() <= Date.now()) return null;

	const claimed = await db
		.update(customerLoginTokens)
		.set({ consumedAt: new Date() })
		.where(
			and(
				eq(customerLoginTokens.id, row.id),
				isNull(customerLoginTokens.consumedAt),
			),
		)
		.returning({ id: customerLoginTokens.id });

	// Another request claimed it between the read and the write.
	if (claimed.length === 0) return null;

	return { email: row.email };
}

/**
 * Bind a verified identity to a workspace, and to its client record.
 *
 * 🔴 THIS IS WHERE GUEST ORDERS ARE CLAIMED. `orders.client_id` already points
 * at `client_records`, so attaching the membership to a record that already
 * carries this email makes every past purchase appear with no data migration
 * whatsoever. A verified email is sufficient proof of ownership — the same
 * evidence a password reset relies on.
 *
 * If no record exists, one is created. They are a contact of this business now,
 * and future orders need somewhere to attach.
 */
export async function bindMembership(input: {
	workspaceId: string;
	identityId: string;
	email: string;
}): Promise<CustomerSessionResolution> {
	const email = normaliseEmail(input.email);

	await db
		.update(customerIdentities)
		.set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
		.where(
			and(
				eq(customerIdentities.id, input.identityId),
				isNull(customerIdentities.emailVerifiedAt),
			),
		);

	const [existing] = await db
		.select()
		.from(workspaceCustomers)
		.where(
			and(
				eq(workspaceCustomers.workspaceId, input.workspaceId),
				eq(workspaceCustomers.identityId, input.identityId),
			),
		)
		.limit(1);

	if (existing) {
		await db
			.update(workspaceCustomers)
			.set({ lastSeenAt: new Date() })
			.where(eq(workspaceCustomers.id, existing.id));
		return {
			workspaceCustomerId: existing.id,
			workspaceId: existing.workspaceId,
			identityId: existing.identityId,
			clientRecordId: existing.clientRecordId,
		};
	}

	// Case-insensitive: a guest checkout may have stored the address however the
	// customer typed it, and an exact match would miss their own history.
	const [record] = await db
		.select({ id: clientRecords.id })
		.from(clientRecords)
		.where(
			and(
				eq(clientRecords.workspaceId, input.workspaceId),
				sql`lower(${clientRecords.email}) = ${email}`,
			),
		)
		.limit(1);

	const clientRecordId =
		record?.id ??
		(
			await db
				.insert(clientRecords)
				.values({
					workspaceId: input.workspaceId,
					name: email,
					email,
				})
				.returning({ id: clientRecords.id })
		)[0]?.id ??
		null;

	const [created] = await db
		.insert(workspaceCustomers)
		.values({
			workspaceId: input.workspaceId,
			identityId: input.identityId,
			clientRecordId,
			lastSeenAt: new Date(),
		})
		.returning();

	if (!created) throw new Error("Membership insert returned nothing.");

	return {
		workspaceCustomerId: created.id,
		workspaceId: created.workspaceId,
		identityId: created.identityId,
		clientRecordId: created.clientRecordId,
	};
}

/** Mint a session. Returns the RAW token — its only appearance in plaintext. */
export async function createCustomerSession(
	workspaceCustomerId: string,
): Promise<{ token: string; expiresAt: Date }> {
	const token = mintToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

	await db.insert(customerSessions).values({
		workspaceCustomerId,
		tokenHash: hash(token),
		expiresAt,
	});

	return { token, expiresAt };
}

/**
 * Resolve a presented session token.
 *
 * This is the function the API boundary depends on. It returns the MEMBERSHIP,
 * including its workspace, so the middleware can refuse a session minted for a
 * different storefront.
 */
export async function resolveCustomerSession(
	token: string,
): Promise<CustomerSessionResolution | null> {
	const tokenHash = hash(token);

	const [row] = await db
		.select({
			sessionId: customerSessions.id,
			expiresAt: customerSessions.expiresAt,
			revokedAt: customerSessions.revokedAt,
			tokenHash: customerSessions.tokenHash,
			workspaceCustomerId: workspaceCustomers.id,
			workspaceId: workspaceCustomers.workspaceId,
			identityId: workspaceCustomers.identityId,
			clientRecordId: workspaceCustomers.clientRecordId,
		})
		.from(customerSessions)
		.innerJoin(
			workspaceCustomers,
			eq(customerSessions.workspaceCustomerId, workspaceCustomers.id),
		)
		.where(eq(customerSessions.tokenHash, tokenHash))
		.limit(1);

	if (!row) return null;
	if (!digestsMatch(row.tokenHash, tokenHash)) return null;
	if (row.revokedAt) return null;
	if (row.expiresAt.getTime() <= Date.now()) return null;

	return {
		workspaceCustomerId: row.workspaceCustomerId,
		workspaceId: row.workspaceId,
		identityId: row.identityId,
		clientRecordId: row.clientRecordId,
	};
}

/** Sign out. Revoked rather than deleted, so a replay can be told apart from a
    token that never existed. */
export async function revokeCustomerSession(token: string): Promise<void> {
	await db
		.update(customerSessions)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(customerSessions.tokenHash, hash(token)),
				isNull(customerSessions.revokedAt),
			),
		);
}
