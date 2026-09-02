import { ArrowUpRightIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	type ConnectTarget,
	envBlock,
	exampleCall,
	installLine,
	suggestedKeyName,
} from "../_lib/connect-config";
import { Card } from "../components/dash-card";
import { OutletError, OutletNotFound } from "../components/outlet-error";
import { SkeletonRows } from "../components/skeletons";
import { WorkingSpinner } from "../components/working-spinner";
import { sessionApi, workspaceApi } from "../lib/api";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";
import { webhookQueries } from "../lib/webhooks-api";

/**
 * Connect — wiring a customer's own code to this workspace.
 *
 * 🔑 The page is ordered the way the job is done: what am I connecting, what do
 * I paste, does it work, and what happens when it breaks. A reference organised
 * by feature instead of by task reads fine and helps nobody at 2am.
 *
 * 🔴 The environment block and the example come from `connect-config.ts`, which
 * is a pure function shared with the future GitHub App. If this page printed its
 * own strings, the bot that opens a pull request would eventually write
 * something the docs never mentioned.
 */

const TARGETS: ReadonlyArray<{
	id: ConnectTarget;
	label: string;
	detail: string;
}> = [
	{
		id: "selling-storefront",
		label: "A shop",
		detail: "Sells things. Carts, checkout, customer accounts.",
	},
	{
		id: "public-site",
		label: "A website",
		detail: "Reads catalog and content. Takes no payments.",
	},
	{
		id: "backend",
		label: "A server",
		detail: "Full workspace access from code you control.",
	},
];

const quietAction =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)]";

function Snippet({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="mt-3">
			<div className="mb-1.5 flex items-center gap-2">
				<p className="min-w-0 flex-1 text-[11px] text-[var(--ink-30)]">
					{label}
				</p>
				<button
					type="button"
					onClick={() => {
						void navigator.clipboard.writeText(value);
						setCopied(true);
					}}
					className={quietAction}
				>
					<CopyIcon size={11} className="mr-1.5" />
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<pre className="overflow-x-auto rounded-lg border border-[var(--console-line-strong)] bg-[rgb(var(--console-ink)/0.03)] p-3.5 font-mono text-[11.5px] text-[var(--ink-80)] leading-5">
				{value}
			</pre>
		</div>
	);
}

function ConnectPage() {
	const { workspaceId: workspace } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspace));
	const endpoints = useQuery(webhookQueries.endpoints(workspace));
	const [target, setTarget] = useState<ConnectTarget>("selling-storefront");
	const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
	const [requestId, setRequestId] = useState("");
	const [lookup, setLookup] = useState<{
		state: "idle" | "found" | "missing";
		body?: string;
	}>({ state: "idle" });

	const deliveries = useQuery(
		webhookQueries.deliveries(workspace, selectedEndpoint),
	);
	/**
	 * The keys pointed at this workspace, and whether anything has used them.
	 *
	 * 🔴 `lastUsedAt` is a DATABASE FACT, written on every authenticated request.
	 * It is not session state, so it survives a refresh, a different browser and
	 * a different machine — which is the whole point. The previous version showed
	 * a checkmark only because the tab happened to be open when the first request
	 * landed, so refreshing wiped it and made a connected site look unconnected.
	 * People refresh precisely when something appears to hang.
	 *
	 * `allowedOrigins` was already stored and already returned; it was simply
	 * never rendered, so nobody could see which addresses were wired up.
	 */
	const keys = useQuery({
		queryKey: ["quickdash", workspace, "api-keys"],
		queryFn: async () =>
			(
				await sessionApi.request<{
					items: Array<{
						id: string;
						name: string;
						type: string;
						prefix: string;
						allowedOrigins: string[];
						lastUsedAt: string | null;
						revokedAt: string | null;
					}>;
				}>(`/account/api-keys?workspaceId=${encodeURIComponent(workspace)}`)
			).data,
		// 🔴 Never asked without a workspace. The route param is empty for a beat
		// on first mount, and the request that went out in that beat asked for the
		// keys of nothing — which the API correctly refuses with a 400, filling
		// the console with a failure that was never a real fault.
		enabled: workspace.length > 0,
		// Held across refetches so the panel never flickers back to "waiting" for
		// a beat before the answer arrives — that flash is the same bug in
		// miniature.
		placeholderData: (previous) => previous,
		/**
		 * Polled ONLY while nothing has called yet.
		 *
		 * Somebody watching this panel is mid-setup and wants it to turn over
		 * without touching anything. Once a key has been used the answer can never
		 * revert, so continuing to poll would be a request every few seconds,
		 * forever, on a page people leave open.
		 */
		refetchInterval: (query) =>
			(query.state.data?.items ?? []).some(
				(key) => !key.revokedAt && key.lastUsedAt,
			)
				? false
				: 5_000,
	});

	const liveKeys = (keys.data?.items ?? []).filter((key) => !key.revokedAt);
	const firstContact = liveKeys.reduce<string | null>(
		(earliest, key) =>
			key.lastUsedAt && (!earliest || key.lastUsedAt < earliest)
				? key.lastUsedAt
				: earliest,
		null,
	);

	const health = useQuery({
		queryKey: ["quickdash", workspace, "integration-health"],
		queryFn: async () =>
			(
				await workspaceApi(workspace).request<{
					healthy: boolean;
					severity: string;
					providers: Array<{
						provider: string;
						consequence: string;
						severity: string;
					}>;
				}>("/integration-health")
			).data,
	});

	const config = {
		target,
		apiUrl: clientEnv.API_URL,
		workspaceId: workspace,
		// 🔴 Never the real key. Keys are issued in Account and shown once, at
		// creation — printing one here would mean this page could read a
		// credential back, which is exactly what hashing them prevents.
		key: null,
		portalUrl: clientEnv.PORTAL_URL,
		portalSlug: context.data?.workspace.slug ?? null,
	};

	const runLookup = async () => {
		const id = requestId.trim();
		if (!id) return;
		try {
			const response = await workspaceApi(workspace).request<unknown>(
				`/requests/${encodeURIComponent(id)}`,
			);
			setLookup({
				state: "found",
				body: JSON.stringify(response.data, null, 2),
			});
		} catch {
			setLookup({ state: "missing" });
		}
	};

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{/* 🔴 A GRID of cards, not a 48rem column.
			    Developers was the last page still laid out as one narrow stack of
			    hairline-ruled sections, which on a wide console meant every word sat
			    in the left third with a mile of empty panel beside it. Same tiles,
			    same surface and same radius as everywhere else. */}
			<div className="grid auto-rows-min grid-cols-1 gap-3 lg:grid-cols-2">
				<Card title="What are you connecting?" className="lg:col-span-2">
					<div className="grid gap-2 sm:grid-cols-3">
						{TARGETS.map((entry) => (
							<button
								key={entry.id}
								type="button"
								aria-pressed={target === entry.id}
								onClick={() => setTarget(entry.id)}
								className={`rounded-lg border p-3 text-left transition-colors ${
									target === entry.id
										? "border-[rgb(var(--console-ink)/0.25)] bg-[rgb(var(--console-ink)/0.04)]"
										: "border-[var(--console-line-strong)] hover:bg-[rgb(var(--console-ink)/0.02)]"
								}`}
							>
								<p className="text-[12.5px] text-[var(--ink-85)]">
									{entry.label}
								</p>
								<p className="mt-1 text-[11px] text-[var(--ink-30)] leading-4">
									{entry.detail}
								</p>
							</button>
						))}
					</div>
				</Card>

				<Card title="Paste this in" className="lg:col-span-2">
					<Snippet label="Install" value={installLine()} />
					<Snippet label="Environment" value={envBlock(config)} />
					<Snippet label="Read something" value={exampleCall(config)} />
					{/* ⚠️ The key is the one thing this page cannot give you. */}
					<p className="mt-3 text-[11px] text-[var(--ink-30)] leading-5">
						The key is issued in Account under Security → API keys, and shown
						once. Name it{" "}
						<span className="text-[var(--ink-60)]">
							{suggestedKeyName(target)}
						</span>
						, and for anything running in a browser add its origins or every
						request from your own site is refused.
					</p>
					<a
						href={`${clientEnv.ACCOUNT_URL}/settings/api-keys`}
						className={`${quietAction} mt-3`}
					>
						Issue a key
					</a>
				</Card>

				<Card title="This workspace">
					<div className="divide-y divide-[var(--console-line-soft)]">
						{[
							["Workspace ID", workspace],
							["API", clientEnv.API_URL],
							[
								"Environment",
								context.data?.workspace.environment === "test"
									? "Sandbox — payments are not charged"
									: "Live — payments are real",
							],
						].map(([label, value]) => (
							<div key={label} className="flex items-baseline gap-4 py-3">
								<p className="w-32 shrink-0 text-[11.5px] text-[var(--ink-40)]">
									{label}
								</p>
								<p className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--ink-80)]">
									{value}
								</p>
							</div>
						))}
					</div>
				</Card>

				<Card title="Webhooks">
					{endpoints.isPending ? (
						<SkeletonRows rows={3} />
					) : (endpoints.data ?? []).length === 0 ? (
						<p className="max-w-xl text-[11.5px] text-[var(--ink-35)] leading-5">
							No endpoints yet. Register one and this workspace will post every
							event to it — signed, retried on failure, and replayable from the
							delivery history.
						</p>
					) : (
						<div className="flex flex-col gap-1">
							{(endpoints.data ?? []).map((endpoint) => (
								<button
									key={endpoint.id}
									type="button"
									onClick={() =>
										setSelectedEndpoint(
											selectedEndpoint === endpoint.id ? null : endpoint.id,
										)
									}
									className="flex items-center gap-3 rounded-md px-2 py-2.5 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.03)]"
								>
									<span
										aria-hidden="true"
										className={`size-1.5 shrink-0 rounded-full ${endpoint.enabled ? "bg-[#3fb950]" : "bg-[var(--ink-25)]"}`}
									/>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-mono text-[11.5px] text-[var(--ink-80)]">
											{endpoint.url}
										</span>
										<span className="mt-0.5 block truncate text-[11px] text-[var(--ink-30)]">
											{endpoint.eventNames.length === 0
												? "every event"
												: endpoint.eventNames.join(", ")}
										</span>
									</span>
								</button>
							))}
						</div>
					)}

					{selectedEndpoint ? (
						<div className="mt-4">
							<p className="mb-1 text-[11px] text-[var(--ink-30)]">
								Recent deliveries
							</p>
							{deliveries.isPending ? (
								<SkeletonRows rows={3} />
							) : (deliveries.data ?? []).length === 0 ? (
								<p className="text-[11.5px] text-[var(--ink-30)]">
									Nothing delivered yet.
								</p>
							) : (
								<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
									{(deliveries.data ?? []).slice(0, 8).map((delivery) => (
										<div
											key={delivery.id}
											className="flex items-baseline gap-3 py-2.5 text-[11.5px]"
										>
											<span
												className={`w-16 shrink-0 ${delivery.status === "delivered" ? "text-[#3fb950]" : "text-[#f5b44a]"}`}
											>
												{delivery.status}
											</span>
											<span className="min-w-0 flex-1 truncate text-[var(--ink-75)]">
												{delivery.eventName}
											</span>
											<span className="shrink-0 text-[var(--ink-30)]">
												{delivery.responseStatus ?? delivery.error ?? "—"}
											</span>
											<span className="w-16 shrink-0 text-right text-[var(--ink-25)]">
												{delivery.attempts} tr
												{delivery.attempts === 1 ? "y" : "ies"}
											</span>
										</div>
									))}
								</div>
							)}
						</div>
					) : null}
				</Card>

				{/* 🔴 The reason every error in this product carries a request id. */}
				<Card title="Look up a request">
					<p className="max-w-xl text-[11.5px] text-[var(--ink-35)] leading-5">
						Every response carries a request ID. Paste one here to see what the
						API actually did — the mutation it committed and the audit it wrote.
					</p>
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<input
							value={requestId}
							onChange={(event) => setRequestId(event.target.value)}
							placeholder="0b6f2c1e-…"
							aria-label="Request ID"
							className="h-9 w-72 max-w-full rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 font-mono text-[11.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-25)] focus:border-[rgb(var(--console-ink)/0.18)]"
						/>
						<button
							type="button"
							onClick={() => void runLookup()}
							className={quietAction}
						>
							Look up
						</button>
					</div>
					{lookup.state === "missing" ? (
						<p className="mt-3 text-[11.5px] text-[var(--ink-40)]">
							Nothing recorded for that ID in this workspace.
						</p>
					) : null}
					{lookup.state === "found" && lookup.body ? (
						<pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-[var(--console-line-strong)] bg-[rgb(var(--console-ink)/0.03)] p-3.5 font-mono text-[11px] text-[var(--ink-75)] leading-5">
							{lookup.body}
						</pre>
					) : null}
				</Card>

				<Card title="This workspace's connection">
					{keys.isPending && !keys.data ? (
						<p className="text-[12px] text-[var(--ink-30)]">Checking…</p>
					) : liveKeys.length === 0 ? (
						<p className="text-[11.5px] text-[var(--ink-45)]">
							No keys yet. Create one in Account, then paste it into your site.
						</p>
					) : (
						<>
							{firstContact ? (
								<p className="flex items-center gap-2 text-[11.5px] text-[var(--ink-45)]">
									<CheckIcon size={12} className="text-[#3fb950]" />
									Your site first reached this workspace on{" "}
									{new Date(firstContact).toLocaleString()}.
								</p>
							) : (
								<p className="flex items-center gap-2 text-[11.5px] text-[#f5b44a]">
									{/* The same ring the sidebar shows, resolving to the checkmark
									    above once contact lands — so waiting and done are the same
									    control in two states rather than two different marks. */}
									<WorkingSpinner label="Waiting for your site to connect" />
									Waiting for the first call from your site. Deploy it and load
									a page; this updates on its own, and it is safe to leave.
								</p>
							)}

							<div className="mt-3.5 divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{liveKeys.map((key) => (
									<div key={key.id} className="py-2.5">
										<div className="flex items-center gap-2">
											<p className="text-[12px] text-[var(--ink-85)]">
												{key.name}
											</p>
											<span className="rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--ink-45)]">
												{key.prefix}
											</span>
											<span className="ml-auto text-[10.5px] text-[var(--ink-30)]">
												{key.lastUsedAt
													? `Last used ${new Date(key.lastUsedAt).toLocaleString()}`
													: "Never used"}
											</span>
										</div>
										{/* 🔴 Stored all along and never shown. A site refused at
										    preflight looks broken with no way to see WHICH addresses
										    were allowed — and origins are matched exactly, so a
										    missing `www.` is invisible until it is printed. */}
										{key.allowedOrigins.length > 0 ? (
											<div className="mt-1.5 flex flex-wrap gap-1.5">
												{key.allowedOrigins.map((origin) => (
													<span
														key={origin}
														className="rounded-full border border-[var(--console-line-strong)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--ink-60)]"
													>
														{origin}
													</span>
												))}
											</div>
										) : (
											<p className="mt-1.5 text-[10.5px] text-[var(--ink-30)]">
												No addresses allowed yet, so a browser cannot use this
												key. Add your site's address in Account.
											</p>
										)}
									</div>
								))}
							</div>
						</>
					)}
				</Card>

				<Card title="Platform health">
					{health.isPending ? (
						<p className="text-[12px] text-[var(--ink-30)]">Checking…</p>
					) : health.data?.healthy ? (
						<p className="flex items-center gap-2 text-[11.5px] text-[var(--ink-45)]">
							<CheckIcon size={12} className="text-[#3fb950]" />
							Everything QuickDash depends on is running normally.
						</p>
					) : (
						<div className="flex flex-col gap-1.5">
							{(health.data?.providers ?? []).map((provider) => (
								<p
									key={provider.provider}
									className="text-[11.5px] text-[#f5b44a] leading-5"
								>
									<span className="capitalize">{provider.provider}</span> —{" "}
									{provider.consequence}
								</p>
							))}
						</div>
					)}
				</Card>

				{/*
				 * The three places a developer goes NEXT, beside the one thing that
				 * says whether to bother right now.
				 *
				 * 🔑 A row of links rather than one large button. "API documentation"
				 * as a lone control at the foot of a health card read as the point of
				 * the card, which it is not — these are references, and references
				 * belong in a list together.
				 */}
				<Card title="Reference">
					<div className="flex flex-col">
						{[
							{
								label: "API documentation",
								detail: "Every endpoint, with request and response shapes",
								href: `${clientEnv.API_URL}/docs`,
							},
							{
								label: "Changelog",
								detail: "What changed, and what is deprecated",
								href: "https://quickengine.xyz/changelog",
							},
							{
								label: "Status",
								detail: "Live availability of the API and its providers",
								href: `${clientEnv.API_URL}/health`,
							},
						].map((link) => (
							<a
								key={link.label}
								href={link.href}
								target="_blank"
								rel="noreferrer"
								className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 no-underline transition-colors hover:bg-[rgb(var(--console-ink)/0.04)]"
							>
								<span className="min-w-0">
									<span className="block truncate text-[12px] text-[var(--ink-80)]">
										{link.label}
									</span>
									<span className="mt-0.5 block truncate text-[11px] text-[var(--ink-30)]">
										{link.detail}
									</span>
								</span>
								<ArrowUpRightIcon
									size={13}
									className="shrink-0 text-[var(--ink-30)]"
								/>
							</a>
						))}
					</div>
				</Card>
			</div>
			errorComponent: OutletError, notFoundComponent: OutletNotFound,
		</main>
	);
}

export const Route = createFileRoute("/$workspace/connect")({
	component: ConnectPage,
});
