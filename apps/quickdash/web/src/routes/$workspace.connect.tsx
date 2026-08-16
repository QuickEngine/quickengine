import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
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
import { workspaceApi } from "../lib/api";
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
	const { workspace } = Route.useParams();
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
			<div className="max-w-3xl">
				<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
					What are you connecting?
				</p>
				<div className="grid gap-2 border-[var(--console-line-soft)] border-t py-4 sm:grid-cols-3">
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

				<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
					Paste this in
				</p>
				<div className="border-[var(--console-line-soft)] border-t py-4">
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
				</div>

				<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
					This workspace
				</p>
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
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

				<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">Webhooks</p>
				<div className="border-[var(--console-line-soft)] border-t py-4">
					{endpoints.isPending ? (
						<p className="text-[12px] text-[var(--ink-30)]">Loading…</p>
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
								<p className="text-[12px] text-[var(--ink-30)]">Loading…</p>
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
				</div>

				{/* 🔴 The reason every error in this product carries a request id. */}
				<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
					Look up a request
				</p>
				<div className="border-[var(--console-line-soft)] border-t py-4">
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
				</div>

				<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
					Platform health
				</p>
				<div className="border-[var(--console-line-soft)] border-t py-4">
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
					<a
						href={`${clientEnv.API_URL}/docs`}
						className={`${quietAction} mt-4`}
					>
						API documentation
					</a>
				</div>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/$workspace/connect")({
	component: ConnectPage,
});
