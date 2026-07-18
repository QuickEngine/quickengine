"use client";

import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type CreateApiKeyState,
	createApiKeyAction,
	type RevokeApiKeyState,
	revokeApiKeyAction,
} from "../../../_lib/api-key-actions";

export type ApiKeyRow = {
	id: string;
	name: string;
	type: string;
	prefix: string;
	capabilities: string[];
	status: "active" | "expired" | "revoked";
	createdLabel: string;
	lastUsedLabel: string;
	expiresLabel: string;
};

const TYPE_META: Record<string, { label: string; hint: string }> = {
	publishable: {
		label: "Publishable",
		hint: "Safe to embed in a public website. Read-only, and clamped to read capabilities.",
	},
	secret: {
		label: "Secret",
		hint: "Trusted-server credential. Never ship it in a browser, app bundle, or repo.",
	},
	scoped: {
		label: "Scoped",
		hint: "A least-privilege server credential for one integration.",
	},
};

const STATUS_VARIANT: Record<
	ApiKeyRow["status"],
	"default" | "secondary" | "outline"
> = {
	active: "default",
	expired: "secondary",
	revoked: "outline",
};

function CreateButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Creating…" : "Create key"}
		</Button>
	);
}

function CreatedKeyNotice({
	created,
}: {
	created: NonNullable<CreateApiKeyState["created"]>;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="rounded-xl border border-primary/40 bg-primary/[0.06] p-4">
			<p className="font-medium text-sm">
				Copy your {TYPE_META[created.type]?.label ?? created.type} key now
			</p>
			<p className="mt-1 text-muted-foreground text-xs">
				This is the only time “{created.name}” will be shown. Store it somewhere
				safe — you can’t retrieve it again, only revoke and replace it.
			</p>
			<div className="mt-3 flex items-center gap-2">
				<code className="flex-1 break-all rounded-lg border border-foreground/10 bg-background px-3 py-2 font-mono text-xs">
					{created.plaintext}
				</code>
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						navigator.clipboard
							.writeText(created.plaintext)
							.then(() => setCopied(true))
							.catch(() => setCopied(false));
					}}
				>
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
		</div>
	);
}

function RevokeButton({
	workspaceId,
	slug,
	keyId,
}: {
	workspaceId: string;
	slug: string;
	keyId: string;
}) {
	const [state, action] = useActionState<RevokeApiKeyState, FormData>(
		revokeApiKeyAction,
		{ error: null },
	);
	const [confirming, setConfirming] = useState(false);

	if (!confirming) {
		return (
			<div className="flex flex-col items-end gap-1">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setConfirming(true)}
				>
					Revoke
				</Button>
				{state.error && (
					<p role="alert" className="text-destructive text-xs">
						{state.error}
					</p>
				)}
			</div>
		);
	}

	return (
		<form action={action} className="flex items-center gap-2">
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="slug" value={slug} />
			<input type="hidden" name="keyId" value={keyId} />
			<Button type="submit" variant="destructive" size="sm">
				Confirm
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => setConfirming(false)}
			>
				Cancel
			</Button>
		</form>
	);
}

export function WorkspaceApiKeys({
	workspaceId,
	slug,
	archived,
	availableCapabilities,
	keys,
}: {
	workspaceId: string;
	slug: string;
	archived: boolean;
	availableCapabilities: string[];
	keys: ApiKeyRow[];
}) {
	const [state, action] = useActionState<CreateApiKeyState, FormData>(
		createApiKeyAction,
		{ error: null, created: null },
	);
	const [selectedType, setSelectedType] = useState("publishable");

	return (
		<section className="space-y-4">
			<div>
				<h2 className="font-medium text-lg">API keys</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Workspace-scoped credentials for the public API and Quick.js. A
					publishable key lets a storefront read this workspace with no login;
					secret and scoped keys are for trusted servers only.
				</p>
			</div>

			{state.created && <CreatedKeyNotice created={state.created} />}

			{archived ? (
				<p className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-4 text-muted-foreground text-sm">
					Restore this workspace to create new keys. Existing keys can still be
					revoked below.
				</p>
			) : (
				<form
					action={action}
					className="grid gap-4 rounded-xl border border-foreground/[0.06] p-4"
				>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="slug" value={slug} />

					<div className="grid gap-2">
						<Label htmlFor="api-key-name">Name</Label>
						<Input
							id="api-key-name"
							name="name"
							placeholder="Gemsutopia storefront"
							maxLength={80}
							required
						/>
					</div>

					<div className="grid gap-2 sm:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="api-key-type">Type</Label>
							<select
								id="api-key-type"
								name="type"
								value={selectedType}
								onChange={(event) => setSelectedType(event.target.value)}
								className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
							>
								{Object.entries(TYPE_META).map(([value, meta]) => (
									<option key={value} value={value}>
										{meta.label}
									</option>
								))}
							</select>
							<p className="text-muted-foreground text-xs">
								{TYPE_META[selectedType]?.hint}
							</p>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="api-key-expiry">Expires</Label>
							<select
								id="api-key-expiry"
								name="expiry"
								defaultValue="never"
								className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
							>
								<option value="never">Never</option>
								<option value="30">In 30 days</option>
								<option value="90">In 90 days</option>
								<option value="365">In 365 days</option>
							</select>
						</div>
					</div>

					<fieldset className="grid gap-2">
						<legend className="text-sm">Capabilities</legend>
						{availableCapabilities.map((capability) => (
							<label
								key={capability}
								className="flex items-center gap-2 text-sm"
							>
								<input
									type="checkbox"
									name="capability"
									value={capability}
									defaultChecked
								/>
								<code className="font-mono text-xs">{capability}</code>
							</label>
						))}
					</fieldset>

					<div className="flex items-center gap-3">
						<CreateButton />
						{state.error && (
							<p role="alert" className="text-destructive text-sm">
								{state.error}
							</p>
						)}
					</div>
				</form>
			)}

			{keys.length === 0 ? (
				<p className="text-muted-foreground text-sm">No API keys yet.</p>
			) : (
				<ul className="grid gap-3">
					{keys.map((key) => (
						<li
							key={key.id}
							className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-4"
						>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium text-sm">{key.name}</span>
									<Badge variant="secondary">
										{TYPE_META[key.type]?.label ?? key.type}
									</Badge>
									<Badge variant={STATUS_VARIANT[key.status]}>
										{key.status}
									</Badge>
								</div>
								<code className="mt-1 block font-mono text-muted-foreground text-xs">
									{key.prefix}…
								</code>
								<dl className="mt-2 grid gap-x-6 gap-y-1 text-muted-foreground text-xs sm:grid-cols-2">
									<div className="flex gap-2">
										<dt>Capabilities:</dt>
										<dd className="text-foreground">
											{key.capabilities.join(", ") || "none"}
										</dd>
									</div>
									<div className="flex gap-2">
										<dt>Last used:</dt>
										<dd>{key.lastUsedLabel}</dd>
									</div>
									<div className="flex gap-2">
										<dt>Created:</dt>
										<dd>{key.createdLabel}</dd>
									</div>
									<div className="flex gap-2">
										<dt>Expires:</dt>
										<dd>{key.expiresLabel}</dd>
									</div>
								</dl>
							</div>
							{key.status === "active" && (
								<RevokeButton
									workspaceId={workspaceId}
									slug={slug}
									keyId={key.id}
								/>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
