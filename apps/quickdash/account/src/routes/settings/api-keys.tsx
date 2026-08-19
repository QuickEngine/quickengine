import { CaretDownIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequestFailure } from "../../components/page-state";
import { SkeletonRows } from "../../components/skeletons";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

/**
 * Security → API keys. The credentials a customer's own code presents.
 *
 * 🔴 **A key is shown once, at creation, and never again.** It is stored hashed,
 * so this is not a policy that could be relaxed — losing it means issuing a new
 * one. The screen therefore refuses to be dismissed accidentally.
 *
 * 🔑 Keys belong to a WORKSPACE, not the organization: one leaked key must not
 * reach another business's records. So the page starts by asking which workspace
 * you mean, rather than showing a mixed list that hides the distinction.
 *
 * ⚠️ A browser key with no allowed origins is refused everywhere. That is the
 * single most common way a storefront ends up "mysteriously" rejected, so the
 * page says it at the point of choosing.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

/** What each kind of key is FOR, in the terms somebody choosing one thinks in. */
/**
 * 🔴 What each key may DO. There is no default on the server, by design.
 *
 * `normalizeCapabilities` THROWS when the resulting set is empty rather than
 * granting the type's ceiling: silently filling in a forgotten field with full
 * access is the wrong direction to fail in.
 *
 * This screen sent `capabilities: []` for every key and offers a picker only for
 * scoped keys — so issuing a publishable, storefront or secret key was
 * IMPOSSIBLE here. It failed with "an API key needs at least one capability",
 * which reads like a validation quibble rather than "this page cannot do the one
 * thing it exists for". Connecting a storefront is the first thing a new
 * customer does, and it could not be completed.
 *
 * ⚠️ Mirrors `PUBLISHABLE_CAPABILITIES` and `STOREFRONT_CAPABILITIES` in
 * `@quickengine/auth/api-keys`, duplicated rather than imported because that
 * module reaches for Node's crypto and must never enter a browser bundle. The
 * server clamps whatever arrives to the same ceiling, so drift here can only
 * ever grant LESS than intended, never more.
 */
const KEY_TYPES = [
	{
		id: "publishable",
		label: "Publishable",
		detail: "Safe in a browser. Reads public catalog and content.",
		browser: true,
		capabilities: ["catalog:read", "events:write"],
	},
	{
		id: "storefront",
		label: "Storefront",
		detail: "Safe in a browser. Carts, checkout and customer sessions.",
		browser: true,
		capabilities: ["catalog:read", "events:write", "checkout:write"],
	},
	{
		id: "secret",
		label: "Secret",
		detail: "Server only. Full workspace access — never ship it to a browser.",
		browser: false,
		capabilities: ["catalog:read", "events:write", "checkout:write"],
	},
	{
		id: "scoped",
		label: "Scoped",
		detail: "Server only, limited to the capabilities you tick.",
		browser: false,
		capabilities: ["catalog:read"],
	},
] as const;

type KeyRow = {
	id: string;
	name: string;
	type: string;
	prefix: string;
	capabilities: string[];
	allowedOrigins: string[] | null;
	lastUsedAt: string | null;
	expiresAt: string | null;
	revokedAt: string | null;
	createdAt: string;
};

const used = (value: string | null) => {
	if (!value) return "never used";
	const days = Math.round(
		(Date.now() - new Date(value).getTime()) / 86_400_000,
	);
	if (days < 1) return "used today";
	return `used ${days}d ago`;
};

function ApiKeysPage() {
	const { active } = useActiveOrganization();
	const organizationId = active?.id ?? "";
	const queryClient = useQueryClient();
	const workspaces = useQuery(accountQueries.workspaces(organizationId));

	const [workspaceId, setWorkspaceId] = useState<string>("");
	const [name, setName] = useState("");
	const [type, setType] = useState<string>("publishable");
	const [origins, setOrigins] = useState("");
	const [issued, setIssued] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

	const chosen =
		workspaceId ||
		(workspaces.data?.items ?? []).find((item) => !item.archivedAt)?.id ||
		"";

	const keys = useQuery({
		queryKey: ["account", organizationId, "api-keys", chosen],
		queryFn: async () =>
			(
				await api.request<{ items: KeyRow[] }>(
					`/account/api-keys?organizationId=${encodeURIComponent(organizationId)}&workspaceId=${encodeURIComponent(chosen)}`,
				)
			).data,
		enabled: Boolean(organizationId && chosen),
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["account", organizationId, "api-keys", chosen],
		});

	const create = useMutation({
		mutationFn: async () =>
			// 🔴 `plaintext`, which is what `issueApiKey` actually returns and what
			// the route echoes back verbatim. This read `data.key` — a field that
			// has never existed — so `setIssued(undefined)` left the reveal panel
			// unrendered and every key ever issued was lost the instant it was
			// made. Nothing failed: the key was real, stored and working, just
			// unreachable. A typed response would have caught it, but the type was
			// written to match the mistake.
			api.request<{ plaintext: string }>(
				`/account/api-keys?organizationId=${encodeURIComponent(organizationId)}`,
				{
					method: "POST",
					body: {
						workspaceId: chosen,
						name: name.trim(),
						type,
						// The chosen type's own set, never an empty list.
						capabilities:
							KEY_TYPES.find((entry) => entry.id === type)?.capabilities ?? [],
						allowedOrigins: origins
							.split(/[,\s]+/)
							.map((value) => value.trim())
							.filter(Boolean),
					},
				},
			),
		onSuccess: ({ data }) => {
			setIssued(data.plaintext);
			setName("");
			setOrigins("");
			setFailure(null);
			void refresh();
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That key could not be issued."),
	});

	const revoke = useMutation({
		mutationFn: async (id: string) =>
			api.request(
				`/account/api-keys/${id}?organizationId=${encodeURIComponent(organizationId)}&workspaceId=${encodeURIComponent(chosen)}`,
				{ method: "DELETE" },
			),
		onSuccess: () => {
			setConfirmRevoke(null);
			void refresh();
		},
		onError: (error: { message?: string }) => {
			setConfirmRevoke(null);
			setFailure(error?.message ?? "That key could not be revoked.");
		},
	});

	const selectedType =
		KEY_TYPES.find((entry) => entry.id === type) ?? KEY_TYPES[0];
	const rows = keys.data?.items ?? [];
	const live = rows.filter((row) => !row.revokedAt);

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<Popover>
					<PopoverTrigger className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3.5 text-[12.5px] text-[var(--ink-70)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)]">
						{(workspaces.data?.items ?? []).find((item) => item.id === chosen)
							?.name ?? "Choose a workspace"}
						<CaretDownIcon size={11} className="text-[var(--ink-30)]" />
					</PopoverTrigger>
					<PopoverContent
						side="bottom"
						align="start"
						sideOffset={6}
						aria-label="Choose a workspace"
						className="w-60 rounded-lg border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
					>
						{(workspaces.data?.items ?? [])
							.filter((item) => !item.archivedAt)
							.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => setWorkspaceId(item.id)}
									className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--ink-75)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)]"
								>
									<span className="min-w-0 flex-1 truncate">{item.name}</span>
									{item.id === chosen ? (
										<CheckIcon size={12} className="text-[var(--ink-45)]" />
									) : null}
								</button>
							))}
					</PopoverContent>
				</Popover>
				<p className="text-[11.5px] text-[var(--ink-30)]">
					Keys belong to one workspace and cannot reach another.
				</p>
			</div>

			{failure ? (
				<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
			) : null}

			{/* 🔴 The only time this value exists in readable form. */}
			{issued ? (
				<div className="mb-6 rounded-lg border border-[#f5a623]/30 bg-[#f5a623]/[0.06] p-4">
					<p className="text-[12px] text-[#f5b44a]">
						Copy this key now. It is stored hashed and cannot be shown again.
					</p>
					<div className="mt-3 flex items-center gap-2">
						<p className="min-w-0 flex-1 select-all break-all rounded-md bg-[rgb(var(--console-ink)/0.06)] px-3 py-2 font-mono text-[12px] text-[var(--ink-90)]">
							{issued}
						</p>
						<button
							type="button"
							onClick={() => {
								void navigator.clipboard.writeText(issued);
								setCopied(true);
							}}
							className={quietAction}
						>
							<CopyIcon size={12} className="mr-1.5" />
							{copied ? "Copied" : "Copy"}
						</button>
					</div>
					<button
						type="button"
						onClick={() => {
							setIssued(null);
							setCopied(false);
						}}
						className={`${primaryAction} mt-3`}
					>
						I have saved it
					</button>
				</div>
			) : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Issue a key</p>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim() && chosen) create.mutate();
				}}
				className="border-[var(--console-line-soft)] border-t py-4"
			>
				<div className="flex flex-wrap items-center gap-2">
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="What is it for? e.g. our storefront"
						aria-label="Key name"
						className={`${field} min-w-64 flex-1`}
					/>
					<Popover>
						<PopoverTrigger className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3.5 text-[12.5px] text-[var(--ink-70)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)]">
							{selectedType.label}
							<CaretDownIcon size={11} className="text-[var(--ink-30)]" />
						</PopoverTrigger>
						<PopoverContent
							side="bottom"
							align="end"
							sideOffset={6}
							aria-label="Choose a key type"
							className="w-72 rounded-lg border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
						>
							{KEY_TYPES.map((entry) => (
								<button
									key={entry.id}
									type="button"
									onClick={() => setType(entry.id)}
									className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)]"
								>
									<span className="min-w-0 flex-1">
										<span className="block text-[12px] text-[var(--ink-85)]">
											{entry.label}
										</span>
										<span className="mt-0.5 block text-[10.5px] text-[var(--ink-30)] leading-4">
											{entry.detail}
										</span>
									</span>
									{entry.id === type ? (
										<CheckIcon
											size={12}
											className="mt-0.5 shrink-0 text-[var(--ink-45)]"
										/>
									) : null}
								</button>
							))}
						</PopoverContent>
					</Popover>
					<button
						type="submit"
						disabled={!name.trim() || !chosen || create.isPending}
						className={`${primaryAction} ${create.isPending ? "shimmer-busy" : ""}`}
					>
						{create.isPending ? "Issuing…" : "Issue key"}
					</button>
				</div>

				{/* ⚠️ A browser key with an empty origin list is refused from every
				    website, which reads as the key being broken. */}
				{selectedType.browser ? (
					<div className="mt-3">
						<input
							value={origins}
							onChange={(event) => setOrigins(event.target.value)}
							placeholder="https://caffeinate.ca, https://www.caffeinate.ca"
							aria-label="Allowed origins"
							className={`${field} w-full max-w-2xl`}
						/>
						<p className="mt-1.5 text-[11px] text-[var(--ink-30)]">
							Required. A browser key with no allowed origins is refused
							everywhere, including from your own site.
						</p>
					</div>
				) : (
					<p className="mt-3 text-[11px] text-[var(--ink-30)]">
						Server only. Never put this in a browser, a mobile app, or a public
						repository.
					</p>
				)}
			</form>

			<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Keys
				{live.length > 0 ? (
					<span className="text-[var(--ink-25)]">{` · ${live.length}`}</span>
				) : null}
			</p>
			{keys.isPending ? (
				<SkeletonRows rows={4} />
			) : keys.isError ? (
				<RequestFailure
					error={keys.error}
					onRetry={() => {
						void keys.refetch();
					}}
				/>
			) : rows.length === 0 ? (
				<p className="py-6 text-[12px] text-[var(--ink-30)]">
					No keys yet. A website or server needs one to reach this workspace.
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{rows.map((row) => (
						<div
							key={row.id}
							className="flex flex-wrap items-center gap-4 py-3"
						>
							<div className="min-w-0 flex-1">
								<p className="flex items-center gap-2 truncate text-[12.5px] text-[var(--ink-85)]">
									{row.name}
									{row.revokedAt ? (
										<span className="shrink-0 rounded-[3px] bg-[rgb(var(--console-ink)/0.07)] px-1.5 py-0.5 font-medium text-[9px] text-[var(--ink-40)] uppercase tracking-[0.09em]">
											Revoked
										</span>
									) : null}
								</p>
								<p className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--ink-30)]">
									{row.prefix}…
								</p>
							</div>
							<p className="w-24 shrink-0 text-[11.5px] text-[var(--ink-40)] capitalize">
								{row.type}
							</p>
							<p className="w-28 shrink-0 text-[11px] text-[var(--ink-30)]">
								{used(row.lastUsedAt)}
							</p>
							{row.revokedAt ? (
								<span className="w-20 shrink-0 text-right text-[11px] text-[var(--ink-25)]">
									revoked
								</span>
							) : confirmRevoke === row.id ? (
								<span className="flex shrink-0 items-center gap-1.5">
									<button
										type="button"
										disabled={revoke.isPending}
										onClick={() => revoke.mutate(row.id)}
										className="inline-flex h-7 items-center rounded-full border border-[#ff3b3b]/25 px-3 text-[11px] text-[#ff6b6b] transition-colors hover:bg-[#ff3b3b]/[0.08]"
									>
										{revoke.isPending ? "Revoking…" : "Confirm"}
									</button>
									<button
										type="button"
										onClick={() => setConfirmRevoke(null)}
										className={quietAction}
									>
										Cancel
									</button>
								</span>
							) : (
								<button
									type="button"
									onClick={() => {
										setFailure(null);
										setConfirmRevoke(row.id);
									}}
									className={quietAction}
								>
									Revoke
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/settings/api-keys")({
	component: ApiKeysPage,
});
