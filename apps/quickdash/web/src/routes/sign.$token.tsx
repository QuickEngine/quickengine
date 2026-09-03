import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

type SigningView = {
	contract: {
		title: string;
		number: string;
		clientName: string | null;
		fileName: string;
		fileChecksumSha256: string;
		effectiveOn: string | null;
		endsOn: string | null;
		description: string | null;
		consentText: string | null;
	};
	signer: { name: string; role: string | null };
};

function SigningPage() {
	const { token } = Route.useParams();
	const [done, setDone] = useState<"signed" | "declined" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const view = useQuery({
		queryKey: ["contract-signing", token],
		queryFn: async () => {
			const response = await fetch(
				`/v1/quickdash/sign/${encodeURIComponent(token)}`,
			);
			if (!response.ok) throw new Error("SIGNING_LINK_UNAVAILABLE");
			return ((await response.json()) as { data: SigningView }).data;
		},
		retry: false,
	});
	if (view.isPending) return <main className="p-6">Loading agreement…</main>;
	if (view.isError)
		return (
			<main className="mx-auto max-w-lg p-6">
				<div className="rounded-xl border p-6 text-center">
					<h1 className="font-medium text-lg">
						This signing link isn't available
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						It may be invalid, expired, or already used. Ask the sender for a
						new link.
					</p>
				</div>
			</main>
		);
	const { contract, signer } = view.data;
	const submit = async (kind: "sign" | "decline", form?: FormData) => {
		setError(null);
		const response = await fetch(
			`/v1/quickdash/sign/${encodeURIComponent(token)}${kind === "decline" ? "/decline" : ""}`,
			{
				method: "POST",
				headers:
					kind === "sign" ? { "Content-Type": "application/json" } : undefined,
				body:
					kind === "sign"
						? JSON.stringify({
								typedName: String(form?.get("typedName") ?? ""),
								consentAccepted: form?.get("consent") === "on",
							})
						: undefined,
			},
		);
		if (!response.ok) {
			setError(
				"We couldn't record that. The link may have expired or already been used.",
			);
			return;
		}
		setDone(kind === "sign" ? "signed" : "declined");
	};
	if (done)
		return (
			<main className="mx-auto max-w-lg p-6 text-center">
				<div className="rounded-xl border p-6">
					<h1 className="font-medium text-lg">
						{done === "signed" ? "Signed, thank you" : "Declined"}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Your response has been recorded. You can close this page.
					</p>
				</div>
			</main>
		);
	return (
		<main className="mx-auto max-w-lg space-y-6 p-6">
			<header>
				<h1 className="font-semibold text-2xl">{contract.title}</h1>
				<p className="text-muted-foreground text-sm">
					{contract.number} · for {signer.name}
					{signer.role ? ` (${signer.role})` : ""}
				</p>
			</header>
			<section className="space-y-2 rounded-xl border p-5 text-sm">
				<div>Prepared by {contract.clientName ?? "the sender"}</div>
				<div>Document {contract.fileName}</div>
				<div className="break-all text-muted-foreground text-xs">
					SHA-256 {contract.fileChecksumSha256}
				</div>
				{contract.description && (
					<p className="whitespace-pre-wrap">{contract.description}</p>
				)}
			</section>
			<form
				action={(form) => void submit("sign", form)}
				className="space-y-4 rounded-xl border p-5"
			>
				<div className="space-y-2">
					<Label>Full legal name</Label>
					<Input
						name="typedName"
						defaultValue={signer.name}
						maxLength={200}
						required
					/>
				</div>
				<label className="flex gap-2 text-sm">
					<input type="checkbox" name="consent" required />
					<span>
						{contract.consentText ??
							"I agree to sign this agreement electronically."}
					</span>
				</label>
				{error && <p className="text-destructive text-sm">{error}</p>}
				<Button type="submit">Sign agreement</Button>
			</form>
			<Button variant="outline" onClick={() => void submit("decline")}>
				Decline to sign
			</Button>
		</main>
	);
}

export const Route = createFileRoute("/sign/$token")({
	component: SigningPage,
});
