import { viewContractForSigning } from "@quickengine/mod-contracts-esign";
import type { Metadata } from "next";
import { SigningForm } from "./signing-form";

export const metadata: Metadata = { title: "Sign agreement" };

export default async function SignPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	let view: Awaited<ReturnType<typeof viewContractForSigning>> | null = null;
	try {
		view = await viewContractForSigning(token);
	} catch {
		view = null;
	}
	if (!view) {
		return (
			<main className="mx-auto max-w-lg p-6">
				<div className="rounded-xl border p-6 text-center">
					<h1 className="font-medium text-lg">
						This signing link isn't available
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						It may be invalid, expired, or already used. Ask whoever sent it for
						a new link.
					</p>
				</div>
			</main>
		);
	}
	const { contract, signer } = view;
	return (
		<main className="mx-auto max-w-lg space-y-6 p-6">
			<header>
				<h1 className="font-semibold text-2xl">{contract.title}</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					{contract.number} · for {signer.name}
					{signer.role ? ` (${signer.role})` : ""}
				</p>
			</header>
			<section className="space-y-2 rounded-xl border p-5 text-sm">
				<div>
					<span className="text-muted-foreground">Prepared by </span>
					{contract.clientName ?? "the sender"}
				</div>
				<div>
					<span className="text-muted-foreground">Document </span>
					{contract.fileName}
				</div>
				<div className="break-all text-muted-foreground text-xs">
					SHA-256 {contract.fileChecksumSha256}
				</div>
				{contract.effectiveOn && (
					<div>
						<span className="text-muted-foreground">Effective </span>
						{contract.effectiveOn}
						{contract.endsOn ? ` → ${contract.endsOn}` : ""}
					</div>
				)}
				{contract.description && (
					<p className="whitespace-pre-wrap pt-1">{contract.description}</p>
				)}
			</section>
			<p className="text-muted-foreground text-xs">
				You are signing the document identified above by its SHA-256 checksum.
				If you don't already have a copy to review, request it from the sender
				before signing.
			</p>
			<SigningForm
				token={token}
				consentText={
					contract.consentText ??
					"I have reviewed this agreement and agree to sign it electronically."
				}
				signerName={signer.name}
			/>
		</main>
	);
}
