import { testDbClient } from "@quickengine/db/testing";
import { createInvoice, setInvoiceStatus } from "@quickengine/mod-invoicing";

/**
 * The seeded world every e2e test runs against. Fixed ids so tests can address rows
 * directly without threading return values around.
 */
export const FIXTURE = {
	email: "e2e-owner@example.com",
	password: "e2e-password-Aa1!",
	name: "E2E Owner",
	workspaceId: "00000000-0000-4000-8000-00000000e001",
	clientId: "00000000-0000-4000-8000-00000000e002",
	// A second workspace the same user owns. The switching flow bounces between the two
	// and asserts neither ever renders the other's records.
	secondWorkspaceId: "00000000-0000-4000-8000-00000000e003",
	secondClientId: "00000000-0000-4000-8000-00000000e004",
	clientName: "Ada Lovelace",
	secondClientName: "Grace Murray",
	// Payments and Invoicing are the modules the retry/double-submit flows exercise;
	// client-records backs the client each record hangs off.
	modules: ["client-records", "invoicing", "payments"],
} as const;

/**
 * Create the workspace the signed-in user owns, enable its modules, and give it one
 * client. `requireWorkspaceAccess` admits the owner directly, so no org membership row
 * is needed beyond the personal org Better Auth's sign-up hook already created.
 */
export async function seedWorkspace(ownerId: string): Promise<void> {
	await seedOneWorkspace(ownerId, {
		workspaceId: FIXTURE.workspaceId,
		name: "E2E Workspace",
		clientId: FIXTURE.clientId,
		clientName: FIXTURE.clientName,
	});
}

/**
 * A second workspace owned by the same user, holding a DIFFERENT client. The switching
 * flow uses the distinct client names to prove one workspace's data never bleeds into
 * the other's page while navigating quickly between them.
 */
export async function seedSecondWorkspace(ownerId: string): Promise<void> {
	await seedOneWorkspace(ownerId, {
		workspaceId: FIXTURE.secondWorkspaceId,
		name: "E2E Second Workspace",
		clientId: FIXTURE.secondClientId,
		clientName: FIXTURE.secondClientName,
	});
}

async function seedOneWorkspace(
	ownerId: string,
	workspace: {
		workspaceId: string;
		name: string;
		clientId: string;
		clientName: string;
	},
): Promise<void> {
	const sql = testDbClient();
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspace.workspaceId}, ${ownerId}, ${workspace.name}, 'agency')
	`;
	for (const moduleId of FIXTURE.modules) {
		await sql`
			insert into workspace_modules (workspace_id, module_id, enabled)
			values (${workspace.workspaceId}, ${moduleId}, true)
		`;
	}
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (
			${workspace.clientId}, ${workspace.workspaceId},
			${workspace.clientName}, 'client@example.com', 'Analytical Engines'
		)
	`;
}

/**
 * Insert a throwaway client. Tests that destroy a record must create their own rather
 * than consuming the shared fixture — the switching flow asserts on the seeded clients
 * still being present, so deleting one out from under it breaks an unrelated test.
 */
export async function insertClientRecord(
	workspaceId: string,
	clientId: string,
	name: string,
): Promise<void> {
	const sql = testDbClient();
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, ${name}, 'throwaway@example.com', 'Throwaway')
	`;
}

/** Delete a client record out of band — how the stale-data flow ages an open page. */
export async function deleteClientRecordDirect(
	clientId: string,
): Promise<void> {
	const sql = testDbClient();
	await sql`delete from client_records where id = ${clientId}`;
}

/** The invoice total the retry flow pays against, in cents. */
export const INVOICE_TOTAL_CENTS = 10_000;

/**
 * An issued invoice for the seeded client. Payments reject anything but an issued
 * invoice (`INVOICE_NOT_PAYABLE`), so the draft is moved to `sent` before returning.
 */
export async function seedIssuedInvoice(): Promise<string> {
	const invoice = await createInvoice(FIXTURE.workspaceId, {
		clientId: FIXTURE.clientId,
		currency: "USD",
		taxCents: 0,
		notes: "",
		dueAt: null,
		numberPrefix: "INV",
		lineItems: [
			{
				description: "Consulting",
				quantity: 1,
				unitPriceCents: INVOICE_TOTAL_CENTS,
				position: 0,
			},
		],
	});
	await setInvoiceStatus(FIXTURE.workspaceId, invoice.id, "sent");
	return invoice.id;
}

/** Count rows in a workspace-scoped table — how the flows assert "exactly one". */
export async function countRows(
	table: "payments" | "client_records" | "invoices",
): Promise<number> {
	const sql = testDbClient();
	const rows =
		table === "payments"
			? await sql`select count(*)::int as n from payments where workspace_id = ${FIXTURE.workspaceId}`
			: table === "invoices"
				? await sql`select count(*)::int as n from invoices where workspace_id = ${FIXTURE.workspaceId}`
				: await sql`select count(*)::int as n from client_records where workspace_id = ${FIXTURE.workspaceId}`;
	return rows[0]?.n ?? 0;
}
