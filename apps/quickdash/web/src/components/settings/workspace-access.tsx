import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { sessionApi, workspaceApi } from "../../lib/api";
import { webhookQueries } from "../../lib/webhooks-api";
import { FailureStatusLine, WriteFailure } from "../page-state";
import { Choice, Group, Row } from "./controls";

/**
 * The three lists that decide who and what may reach this workspace: keys,
 * people, and the endpoints events are posted to.
 *
 * 🔴 Every endpoint behind these has existed since Step 8 with no screen. They
 * were "settings that live in Account", which in practice meant leaving the
 * workspace to do them and — for webhooks — that a signing secret shown once
 * was shown on a page nobody visited.
 */

const input =
	"h-9 w-full field rounded-md px-3 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors";
const primary =
	"flex h-8 shrink-0 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-90 disabled:opacity-40";
const quiet =
	"flex h-7 shrink-0 items-center rounded-md border border-[var(--console-line-strong)] px-2.5 text-[11.5px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

/**
 * 🔴 No error is ever raw text on the background.
 *
 * This was a bare red `<p>`: no container, no request id, and identical for a
 * 403, a 409 and a 500. `WriteFailure` is the one shape a failed write takes
 * anywhere in this console, so a local one-off is just a place for the design
 * to fall behind.
 */
function Failure({
	failure,
}: {
	failure: { error: unknown; fallback: string } | null;
}) {
	if (!failure) return null;
	return <WriteFailure error={failure.error} message={failure.fallback} />;
}

/* ── Webhooks ─────────────────────────────────────────────────────────── */

export function WorkspaceWebhooks({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const endpoints = useQuery(webhookQueries.endpoints(workspaceId));
	const [url, setUrl] = useState("");
	const [description, setDescription] = useState("");
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	/**
	 * 🔴 Held in state because it is returned ONCE and there is no route to read
	 * it back. Losing it means deleting the endpoint and making another.
	 */
	const [secret, setSecret] = useState<string | null>(null);

	const create = useMutation({
		mutationFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ id: string; secret: string }>(
					"/webhook-endpoints",
					{
						method: "POST",
						body: {
							url: url.trim(),
							description: description.trim() || undefined,
						},
						idempotencyKey: crypto.randomUUID(),
					},
				)
			).data,
		onMutate: () => {
			setFailure(null);
			setSecret(null);
		},
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That endpoint could not be registered.",
			}),
		onSuccess: async (created) => {
			setSecret(created.secret);
			setUrl("");
			setDescription("");
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "webhook-endpoints"],
			});
		},
	});

	const setEnabled = useMutation({
		mutationFn: async (row: { id: string; enabled: boolean }) => {
			await workspaceApi(workspaceId).request(`/webhook-endpoints/${row.id}`, {
				method: "PATCH",
				body: { enabled: row.enabled },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That endpoint could not be changed.",
			}),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "webhook-endpoints"],
			}),
	});

	return (
		<div className="flex flex-col gap-5">
			<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
				Every event this workspace produces is posted to each endpoint below,
				signed, and retried when it fails. An endpoint with no event list takes
				all of them.
			</p>

			<Failure failure={failure} />

			{secret ? (
				<div className="rounded-xl border border-[var(--console-line-strong)] p-3">
					<p className="text-[11.5px] text-[var(--ink-70)]">
						Signing secret: copy it now
					</p>
					<p className="mt-1 text-[11px] text-[var(--ink-35)] leading-4">
						This is the only time it is shown. There is no way to read it back.
					</p>
					<code className="mt-2 block overflow-x-auto rounded-lg border border-[var(--console-line)] bg-[rgb(var(--console-ink)/0.04)] p-2 font-mono text-[11px] text-[var(--ink-85)]">
						{secret}
					</code>
				</div>
			) : null}

			<Group title="Register an endpoint">
				<Row label="URL" description="Where this workspace posts its events.">
					<input
						value={url}
						aria-label="Endpoint URL"
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://yoursite.com/hooks"
						className={input}
					/>
				</Row>
				<Row
					label="What is it for"
					description="Optional, for your own reference."
				>
					<input
						value={description}
						aria-label="Description"
						onChange={(event) => setDescription(event.target.value)}
						placeholder="optional"
						className={input}
					/>
				</Row>
				<div className="pt-3">
					<button
						type="button"
						data-hint={
							url.trim() ? undefined : "Enter the address to send events to"
						}
						disabled={!url.trim() || create.isPending}
						onClick={() => create.mutate()}
						className={primary}
					>
						{create.isPending ? "Registering…" : "Register endpoint"}
					</button>
				</div>
			</Group>

			{endpoints.isPending ? (
				<p className="text-[12px] text-[var(--ink-30)]">Loading…</p>
			) : (endpoints.data ?? []).length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)]">
					No endpoints registered yet.
				</p>
			) : (
				<Group title="Registered">
					{(endpoints.data ?? []).map((endpoint) => (
						<Row
							key={endpoint.id}
							label={endpoint.url}
							description={
								endpoint.description ??
								(endpoint.eventNames.length === 0
									? "Every event"
									: `${endpoint.eventNames.length} events`)
							}
						>
							<div className="flex items-center gap-3">
								<span
									aria-hidden="true"
									className={`size-1.5 shrink-0 rounded-full ${endpoint.enabled ? "bg-[var(--signal-success)]" : "bg-[var(--ink-25)]"}`}
								/>
								<button
									type="button"
									className={quiet}
									disabled={setEnabled.isPending}
									onClick={() =>
										setEnabled.mutate({
											id: endpoint.id,
											enabled: !endpoint.enabled,
										})
									}
								>
									{endpoint.enabled ? "Pause" : "Resume"}
								</button>
							</div>
						</Row>
					))}
				</Group>
			)}
		</div>
	);
}

/* ── API keys ─────────────────────────────────────────────────────────── */

type ApiKey = {
	id: string;
	name: string;
	type: string;
	lastUsedAt: string | null;
	createdAt: string;
	revokedAt: string | null;
};

export function WorkspaceApiKeys({
	workspaceId,
	organizationId,
}: {
	workspaceId: string;
	organizationId: string | null | undefined;
}) {
	const queryClient = useQueryClient();
	const org = encodeURIComponent(organizationId ?? "");
	const [name, setName] = useState("");
	const [type, setType] = useState("secret");
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	/** Same one-time rule as a webhook secret: shown once, never readable. */
	const [issued, setIssued] = useState<string | null>(null);

	const keys = useQuery({
		queryKey: ["quickdash", workspaceId, "api-keys", organizationId],
		queryFn: async () =>
			(
				await sessionApi.request<{ items: ApiKey[] }>(
					`/account/api-keys?workspaceId=${workspaceId}&organizationId=${org}`,
				)
			).data,
		enabled: Boolean(organizationId),
	});

	const create = useMutation({
		mutationFn: async () =>
			(
				await sessionApi.request<{ key: string }>(
					`/account/api-keys?organizationId=${org}`,
					{
						method: "POST",
						body: { workspaceId, name: name.trim(), type, capabilities: [] },
					},
				)
			).data,
		onMutate: () => {
			setFailure(null);
			setIssued(null);
		},
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That key could not be issued." }),
		onSuccess: async (created) => {
			setIssued(created.key);
			setName("");
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "api-keys"],
			});
		},
	});

	const revoke = useMutation({
		mutationFn: async (id: string) => {
			await sessionApi.request(
				`/account/api-keys/${id}?workspaceId=${workspaceId}&organizationId=${org}`,
				{ method: "DELETE" },
			);
		},
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That key could not be revoked." }),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "api-keys"],
			}),
	});

	const live = (keys.data?.items ?? []).filter((key) => !key.revokedAt);

	return (
		<div className="flex flex-col gap-5">
			<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
				Keys let your own site and tools reach this workspace. A secret key
				belongs on a server; a storefront key is safe in a browser and is locked
				to the addresses you name on the Developers page.
			</p>

			<Failure failure={failure} />

			{issued ? (
				<div className="rounded-xl border border-[var(--console-line-strong)] p-3">
					<p className="text-[11.5px] text-[var(--ink-70)]">
						Copy this key now
					</p>
					<p className="mt-1 text-[11px] text-[var(--ink-35)] leading-4">
						It is shown once and stored only as a hash.
					</p>
					<code className="mt-2 block overflow-x-auto rounded-lg border border-[var(--console-line)] bg-[rgb(var(--console-ink)/0.04)] p-2 font-mono text-[11px] text-[var(--ink-85)]">
						{issued}
					</code>
				</div>
			) : null}

			<Group title="Issue a key">
				<Row
					label="Name it"
					description="So you can tell your keys apart later."
				>
					<input
						value={name}
						aria-label="Key name"
						onChange={(event) => setName(event.target.value)}
						placeholder="Website, server"
						className={input}
					/>
				</Row>
				<Row
					label="Kind"
					description="A secret key belongs on a server and must never reach a browser."
				>
					{/* 🔴 Our own dropdown. A native select is drawn by the operating
					    system and ignores the theme entirely. */}
					<Choice
						label="Key kind"
						value={type}
						onChange={setType}
						options={[
							{ value: "secret", label: "Secret", hint: "server" },
							{ value: "storefront", label: "Storefront", hint: "browser" },
							{ value: "publishable", label: "Publishable", hint: "public" },
						]}
					/>
				</Row>
				<div className="pt-3">
					<button
						type="button"
						data-hint={
							name.trim()
								? undefined
								: "Name this key so you can recognise it later"
						}
						disabled={!name.trim() || create.isPending}
						onClick={() => create.mutate()}
						className={primary}
					>
						{create.isPending ? "Issuing…" : "Issue a key"}
					</button>
				</div>
			</Group>

			{keys.isPending ? (
				<p className="text-[12px] text-[var(--ink-30)]">Loading…</p>
			) : live.length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)]">No keys yet.</p>
			) : (
				<Group title="In use">
					{live.map((key) => (
						<Row
							key={key.id}
							label={key.name}
							description={`${key.type} · ${
								key.lastUsedAt
									? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
									: "never used"
							}`}
						>
							<button
								type="button"
								className={quiet}
								disabled={revoke.isPending}
								onClick={() => revoke.mutate(key.id)}
							>
								Revoke
							</button>
						</Row>
					))}
				</Group>
			)}
		</div>
	);
}

/* ── People ───────────────────────────────────────────────────────────── */

type Member = {
	id: string;
	name: string | null;
	email: string;
	role: string;
};

export function WorkspaceMembers({
	organizationId,
}: {
	organizationId: string | null | undefined;
}) {
	const org = encodeURIComponent(organizationId ?? "");
	const members = useQuery({
		queryKey: ["quickdash", "members", organizationId],
		queryFn: async () =>
			(
				await sessionApi.request<{ items: Member[] }>(
					`/account/members?organizationId=${org}`,
				)
			).data,
		enabled: Boolean(organizationId),
	});

	if (members.isPending) {
		return <p className="text-[12px] text-[var(--ink-30)]">Loading…</p>;
	}
	if (members.isError) {
		return (
			<FailureStatusLine
				error={members.error}
				onRetry={() => void members.refetch()}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
				Everybody who can open this workspace. People are invited and removed in
				Account, where they belong to the organisation rather than to one
				workspace.
			</p>
			<Group title="Everybody here">
				{(members.data?.items ?? []).map((member) => (
					<Row
						key={member.id}
						label={member.name ?? member.email}
						description={member.email}
					>
						<span className="shrink-0 rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)] capitalize">
							{member.role}
						</span>
					</Row>
				))}
			</Group>
		</div>
	);
}

type Role = {
	id: string;
	name: string;
	description: string | null;
	permissions: string[];
};

export function WorkspaceRoles({
	organizationId,
}: {
	organizationId: string | null | undefined;
}) {
	const org = encodeURIComponent(organizationId ?? "");
	const roles = useQuery({
		queryKey: ["quickdash", "roles", organizationId],
		queryFn: async () =>
			(
				await sessionApi.request<{ items: Role[] }>(
					`/account/roles?organizationId=${org}`,
				)
			).data,
		enabled: Boolean(organizationId),
	});

	if (roles.isPending) {
		return <p className="text-[12px] text-[var(--ink-30)]">Loading…</p>;
	}
	if (roles.isError) {
		return (
			<FailureStatusLine
				error={roles.error}
				onRetry={() => void roles.refetch()}
			/>
		);
	}

	const items = roles.data?.items ?? [];

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
				A role is any set of permissions, under any name you like. Roles are
				created and edited in Account because they belong to the organisation,
				not to one workspace.
			</p>
			{items.length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)]">
					No custom roles. Everybody has their organisation role.
				</p>
			) : (
				<div className="flex flex-col ">
					{items.map((role) => (
						<div key={role.id} className="py-3">
							<p className="text-[12.5px] text-[var(--ink-85)]">{role.name}</p>
							<p className="mt-0.5 text-[11px] text-[var(--ink-30)] leading-4">
								{role.description ?? `${role.permissions.length} permissions`}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
