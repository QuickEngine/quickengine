import { ArrowSquareOut, CheckCircle, Copy } from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import { useState } from "react";

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

export function ConnectView({
	workspaceId,
	workspaceName,
	apiUrl,
	accountUrl,
}: {
	workspaceId: string;
	workspaceName: string;
	apiUrl: string;
	accountUrl: string;
}) {
	const environment = `QUICKDASH_API_URL=${apiUrl}
QUICKDASH_WORKSPACE_ID=${workspaceId}
QUICKDASH_API_KEY=replace_with_a_server_key`;
	const example = `import { createQuickServer } from "@quickengine/quick";

const quick = createQuickServer({
  baseUrl: process.env.QUICKDASH_API_URL!,
  workspaceId: process.env.QUICKDASH_WORKSPACE_ID!,
  credential: { type: "scoped", token: process.env.QUICKDASH_API_KEY! },
});

const { data } = await quick.clients.list({ limit: 10 });
console.log(data.items);`;
	return (
		<main className="space-y-8 p-6">
			<header>
				<p className="text-muted-foreground text-sm">{workspaceName}</p>
				<h1 className="mt-1 font-semibold text-2xl">Connect</h1>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm">
					Connect a storefront, trusted backend, reporting tool, or webhook
					worker without exposing more access than it needs.
				</p>
			</header>

			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-xl border p-5">
					<p className="text-muted-foreground text-xs">API origin</p>
					<code className="mt-2 block break-all text-sm">{apiUrl}</code>
					<div className="mt-4">
						<CopyValue value={apiUrl} label="origin" />
					</div>
				</div>
				<div className="rounded-xl border p-5">
					<p className="text-muted-foreground text-xs">Workspace ID</p>
					<code className="mt-2 block break-all text-sm">{workspaceId}</code>
					<div className="mt-4">
						<CopyValue value={workspaceId} label="workspace ID" />
					</div>
				</div>
			</section>

			<section className="space-y-4 rounded-xl border p-5">
				<div>
					<h2 className="font-medium">1. Create the right credential</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Account recommends least-privilege presets. Publishable keys may
						appear in a browser; secret and scoped keys must stay on a trusted
						server.
					</p>
				</div>
				<Button asChild>
					<a href={accountUrl}>
						Manage credentials <ArrowSquareOut />
					</a>
				</Button>
			</section>

			<section className="space-y-4 rounded-xl border p-5">
				<div>
					<h2 className="font-medium">2. Configure the server</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Keep this file out of version control. Replace the placeholder with
						the key shown once by Account.
					</p>
				</div>
				<pre className="overflow-x-auto rounded-lg bg-foreground/[0.04] p-4 text-xs">
					<code>{environment}</code>
				</pre>
				<CopyValue value={environment} label="environment block" />
			</section>

			<section className="space-y-4 rounded-xl border p-5">
				<div>
					<h2 className="font-medium">3. Verify one read</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Install <code>@quickengine/quick</code>, then run a small read from
						your trusted runtime.
					</p>
				</div>
				<pre className="overflow-x-auto rounded-lg bg-foreground/[0.04] p-4 text-xs">
					<code>{example}</code>
				</pre>
				<CopyValue value={example} label="example" />
				<p className="text-muted-foreground text-xs">
					CLI alternative: <code>quick init</code>, then{" "}
					<code>quick doctor</code>.
				</p>
			</section>
		</main>
	);
}
