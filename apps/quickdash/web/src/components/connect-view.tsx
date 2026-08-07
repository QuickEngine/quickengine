import {
	ArrowSquareOut,
	CheckCircle,
	Copy,
	GithubLogo,
	Spinner,
} from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import {
	type ConnectTarget,
	envBlock,
	exampleCall,
	installLine,
	suggestedKeyName,
} from "../_lib/connect-config";
import { sessionApi, workspaceApi } from "../lib/api";

function CopyValue({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			onClick={async () => {
				await navigator.clipboard.writeText(value);
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1500);
			}}
		>
			{copied ? <CheckCircle /> : <Copy />}
			{copied ? "Copied" : `Copy ${label}`}
		</Button>
	);
}

const TARGETS: Array<{
	id: ConnectTarget;
	label: string;
	detail: string;
	/** Browser targets need an origin; a server key must never carry one. */
	needsOrigin: boolean;
	type: "storefront" | "publishable" | "secret";
	capabilities: string[];
}> = [
	{
		id: "selling-storefront",
		label: "A website that sells",
		detail:
			"Browse the catalog and take orders. Safe in a browser because QuickDash prices every order from your own catalog — the site sends items and quantities, never amounts.",
		needsOrigin: true,
		type: "storefront",
		capabilities: ["catalog:read", "events:write", "checkout:write"],
	},
	{
		id: "public-site",
		label: "A website that doesn't sell",
		detail:
			"Read the catalog and content. No checkout, so nothing can take money with this key.",
		needsOrigin: true,
		type: "publishable",
		capabilities: ["catalog:read", "events:write"],
	},
	{
		id: "backend",
		label: "A private server",
		detail:
			"Full workspace access for something you run yourself. Never put this key in a browser or a mobile app.",
		needsOrigin: false,
		type: "secret",
		capabilities: [],
	},
];

type IssuedKey = {
	id: string;
	plaintext: string;
	allowedOrigins: string[];
};

export function ConnectView({
	workspaceId,
	workspaceName,
	organizationId,
	apiUrl,
	portalUrl,
	accountUrl,
}: {
	workspaceId: string;
	workspaceName: string;
	organizationId: string | null;
	apiUrl: string;
	portalUrl: string | null;
	accountUrl: string;
}) {
	const queryClient = useQueryClient();
	const [target, setTarget] = useState<ConnectTarget>("selling-storefront");
	const [issued, setIssued] = useState<IssuedKey | null>(null);
	const [origin, setOrigin] = useState("");
	const [savedOrigins, setSavedOrigins] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const chosen = TARGETS.find((item) => item.id === target) ?? TARGETS[0];

	/**
	 * Where this workspace's customers would sign in, if it publishes a portal.
	 *
	 * Read rather than assumed: a workspace with no published portal must not be
	 * handed two environment variables pointing at nothing.
	 */
	const portal = useQuery({
		queryKey: ["quickdash", workspaceId, "portal-domain"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{
					customDomain: string | null;
					portalSlug: string | null;
				}>("/portal/domain")
			).data,
	});

	/**
	 * 🔴 The verification signal, and it is real.
	 *
	 * `lastUsedAt` is written by `verifyApiKey` on every authenticated request, so
	 * a non-null value means this key genuinely reached the API from somewhere.
	 * The previous version of this page printed a code sample and told the user to
	 * run it, which verified nothing at all.
	 */
	const keys = useQuery({
		queryKey: ["quickdash", workspaceId, "api-keys"],
		queryFn: async () =>
			(
				await sessionApi.request<{
					items: Array<{
						id: string;
						lastUsedAt: string | null;
						allowedOrigins: string[];
					}>;
				}>(
					`/account/api-keys?${new URLSearchParams({
						organizationId: organizationId ?? "",
						workspaceId,
					})}`,
				)
			).data.items,
		enabled: Boolean(organizationId),
		// Only while we are waiting to see the first request. Polling forever would
		// put a request every three seconds behind a page somebody left open.
		refetchInterval: (query) => {
			if (!issued) return false;
			const key = query.state.data?.find((item) => item.id === issued.id);
			return key?.lastUsedAt ? false : 3_000;
		},
	});

	const liveKey = issued
		? keys.data?.find((item) => item.id === issued.id)
		: undefined;
	const connectedAt = liveKey?.lastUsedAt ?? null;

	const createKey = useMutation({
		// Named `entered` rather than `origin` so it cannot be confused with the
		// state of the same name a few lines up.
		mutationFn: async (entered: string | null) => {
			const response = await sessionApi.request<IssuedKey>(
				`/account/api-keys?organizationId=${encodeURIComponent(organizationId ?? "")}`,
				{
					method: "POST",
					body: {
						workspaceId,
						name: suggestedKeyName(target),
						type: chosen.type,
						capabilities: chosen.capabilities,
						...(entered
							? {
									allowedOrigins: entered
										.split(",")
										.map((item) => item.trim())
										.filter(Boolean),
								}
							: {}),
					},
				},
			);
			return response.data;
		},
		onSuccess: async (data) => {
			setIssued(data);
			setError(null);
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "api-keys"],
			});
		},
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "The key could not be created.",
			),
	});

	/** Change where an already-issued key may be used. */
	const updateOrigins = useMutation({
		mutationFn: async (value: string) => {
			const response = await sessionApi.request<{ allowedOrigins: string[] }>(
				`/account/api-keys/${issued?.id}?organizationId=${encodeURIComponent(organizationId ?? "")}`,
				{
					method: "PATCH",
					body: {
						workspaceId,
						allowedOrigins: value
							.split(",")
							.map((entry) => entry.trim())
							.filter(Boolean),
					},
				},
			);
			return response.data;
		},
		onSuccess: async (data) => {
			setError(null);
			// What the SERVER stored, not what was typed — normalisation may have
			// trimmed a path or dropped something unparseable, and the operator
			// should see the difference rather than assume their input was kept.
			setSavedOrigins(data.allowedOrigins.join(", ") || "nowhere");
			setIssued((current) =>
				current ? { ...current, allowedOrigins: data.allowedOrigins } : current,
			);
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "api-keys"],
			});
		},
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "The address could not be saved.",
			),
	});

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = origin.trim();
		if (chosen.needsOrigin && !value) {
			setError("Enter the address your site is served from.");
			return;
		}
		createKey.mutate(chosen.needsOrigin ? value : null);
	};

	const config = {
		target,
		apiUrl,
		workspaceId,
		key: issued?.plaintext ?? null,
		portalUrl,
		portalSlug: portal.data?.portalSlug ?? null,
	};
	const env = envBlock(config);
	const example = exampleCall(config);

	/**
	 * No organization on the context means we cannot even ask about keys.
	 *
	 * ⚠️ This is NOT "you lack permission", and saying so was wrong — it told a
	 * workspace OWNER they had no access when the id simply was not in the
	 * payload. Permission is decided by the API, which answers 403; that surfaces
	 * as a creation error below, where it belongs.
	 */
	if (!organizationId) {
		return (
			<main className="space-y-4 p-6">
				<h1 className="font-semibold text-2xl">Connect</h1>
				<p className="max-w-xl text-muted-foreground text-sm">
					This workspace isn&rsquo;t reporting which organization it belongs to,
					so we can&rsquo;t issue a key for it. Reload the page — if it keeps
					happening, it&rsquo;s a bug on our side rather than anything you did.
				</p>
			</main>
		);
	}

	return (
		<main className="space-y-8 p-6">
			<header>
				<p className="text-muted-foreground text-sm">{workspaceName}</p>
				<h1 className="mt-1 font-semibold text-2xl">Connect</h1>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm">
					Point your website at this workspace. Your site keeps its own code,
					framework and hosting — this only gives it permission to read and
					write here.
				</p>
			</header>

			<section className="space-y-3 rounded-xl border p-5">
				<h2 className="font-medium">How do you want to connect?</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<button
						type="button"
						disabled
						className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-dashed p-4 text-left opacity-60"
					>
						<GithubLogo size={20} className="mt-0.5 shrink-0" />
						<span>
							<span className="block font-medium text-sm">
								Connect a GitHub repository
							</span>
							<span className="mt-1 block text-muted-foreground text-xs">
								We open a pull request adding the SDK, your configuration and
								one working call. Coming later — QuickEngine never hosts your
								code.
							</span>
						</span>
					</button>
					<div className="rounded-lg border border-foreground/30 bg-foreground/[0.03] p-4">
						<span className="block font-medium text-sm">
							Set it up yourself
						</span>
						<span className="mt-1 block text-muted-foreground text-xs">
							Copy your configuration into your own project. Two minutes.
						</span>
					</div>
				</div>
			</section>

			<form onSubmit={submit} className="space-y-5 rounded-xl border p-5">
				<div>
					<h2 className="font-medium">1. What are you connecting?</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						This decides what the key may do. Everything here is least privilege
						— a key can only ever do what it was created for.
					</p>
				</div>
				<div className="grid gap-3">
					{TARGETS.map((item) => (
						<label
							key={item.id}
							className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
								item.id === target
									? "border-foreground/30 bg-foreground/[0.03]"
									: "border-foreground/10"
							}`}
						>
							<input
								type="radio"
								name="target"
								className="mt-1"
								checked={item.id === target}
								disabled={Boolean(issued)}
								onChange={() => {
									setTarget(item.id);
									setError(null);
								}}
							/>
							<span>
								<span className="block font-medium text-sm">{item.label}</span>
								<span className="mt-1 block text-muted-foreground text-xs">
									{item.detail}
								</span>
							</span>
						</label>
					))}
				</div>

				{chosen.needsOrigin && (
					<div className="space-y-2 border-foreground/[0.06] border-t pt-5">
						<h2 className="font-medium">2. Where is your site?</h2>
						<p className="text-muted-foreground text-sm">
							A browser loading your site from any other address is refused, so
							somebody who copies this key out of your page source cannot build
							a website with it.
						</p>
						<div className="flex gap-2">
							<Input
								name="origin"
								placeholder="https://yourshop.com"
								value={origin}
								onChange={(event) => setOrigin(event.target.value)}
								autoComplete="url"
							/>
							{/*
							 * Editable AFTER issuing too.
							 *
							 * Locking this once a key existed meant moving your site to a real
							 * domain sent you off to Account to find a key list — the setup
							 * page could set the address once and then never change it, which
							 * is exactly when you need to.
							 */}
							{issued && (
								<Button
									type="button"
									variant="outline"
									disabled={updateOrigins.isPending}
									onClick={() => updateOrigins.mutate(origin.trim())}
								>
									{updateOrigins.isPending ? "Saving…" : "Update"}
								</Button>
							)}
						</div>
						<p className="text-muted-foreground text-xs">
							Paste the full address if it's easier — a path or trailing slash
							is trimmed for you. Separate several with a comma if your site is
							served from more than one, and add your local address while you're
							building.
						</p>
					</div>
				)}

				{!issued && (
					<Button type="submit" disabled={createKey.isPending}>
						{createKey.isPending ? "Creating…" : "Create the key"}
					</Button>
				)}
				{error && <p className="text-destructive text-sm">{error}</p>}
				{savedOrigins && (
					<p className="text-muted-foreground text-sm">
						Saved. This key now works from {savedOrigins}.
					</p>
				)}
			</form>

			{issued && (
				<>
					<section className="space-y-4 rounded-xl border p-5">
						<div>
							<h2 className="font-medium">
								{chosen.needsOrigin ? "3." : "2."} Copy your configuration
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								<strong className="text-foreground">
									The key is shown once.
								</strong>{" "}
								It is stored hashed, so nobody — including us — can read it
								back. Lose it and you create another.
							</p>
						</div>
						<pre className="overflow-x-auto rounded-lg bg-foreground/[0.04] p-4 text-xs">
							<code>{env}</code>
						</pre>
						<div className="flex flex-wrap gap-2">
							<CopyValue value={env} label="configuration" />
							<CopyValue value={issued.plaintext} label="key" />
						</div>
						{issued.allowedOrigins.length > 0 && (
							<p className="text-muted-foreground text-xs">
								Locked to {issued.allowedOrigins.join(", ")}.
							</p>
						)}
					</section>

					<section className="space-y-4 rounded-xl border p-5">
						<div>
							<h2 className="font-medium">
								{chosen.needsOrigin ? "4." : "3."} Make one call
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								Install the SDK and read something. Any framework — this is a
								plain HTTP client underneath.
							</p>
						</div>
						<pre className="overflow-x-auto rounded-lg bg-foreground/[0.04] p-4 text-xs">
							<code>{installLine()}</code>
						</pre>
						<pre className="overflow-x-auto rounded-lg bg-foreground/[0.04] p-4 text-xs">
							<code>{example}</code>
						</pre>
						<CopyValue value={example} label="example" />
					</section>

					<section
						className={`rounded-xl border p-5 ${
							connectedAt ? "border-foreground/30 bg-foreground/[0.03]" : ""
						}`}
					>
						{connectedAt ? (
							<div className="flex items-start gap-3">
								<CheckCircle
									size={22}
									weight="fill"
									className="mt-0.5 shrink-0"
								/>
								<div>
									<p className="font-medium">Connected</p>
									<p className="mt-1 text-muted-foreground text-sm">
										{workspaceName} answered a request from your site at{" "}
										{new Date(connectedAt).toLocaleTimeString()}. You're done —
										everything else is built against this workspace.
									</p>
								</div>
							</div>
						) : (
							<div className="flex items-start gap-3">
								<Spinner size={22} className="mt-0.5 shrink-0 animate-spin" />
								<div>
									<p className="font-medium">Waiting for your first request</p>
									<p className="mt-1 text-muted-foreground text-sm">
										Load a page on your site that reads from QuickDash. This
										updates on its own — nothing to refresh.
									</p>
									<p className="mt-2 text-muted-foreground text-xs">
										Nothing happening? Check the address matches exactly,
										including <code>http</code> vs <code>https</code> and the
										port.
									</p>
								</div>
							</div>
						)}
					</section>
				</>
			)}

			<p className="text-muted-foreground text-sm">
				Existing keys, capabilities and revocation live in{" "}
				<a
					href={accountUrl}
					className="underline underline-offset-4 hover:text-foreground"
				>
					Account <ArrowSquareOut className="inline" size={13} />
				</a>
				.
			</p>
		</main>
	);
}
