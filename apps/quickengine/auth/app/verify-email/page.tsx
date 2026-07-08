"use client";

import { sendVerificationEmail } from "@quickengine/auth/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function VerifyEmail() {
	const error = useSearchParams().get("error");
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState("");

	return (
		<main className="grid min-h-dvh place-items-center bg-[#05070d] px-6 text-white antialiased">
			<div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
				<h1 className="font-semibold text-lg tracking-tight">
					Email verification
				</h1>
				<p className="mt-1 text-sm text-white/45">
					{error
						? `Verification failed: ${error}`
						: "Your email is verified — you can sign in now."}
				</p>
				<form
					className="mt-5 grid gap-3"
					onSubmit={async (e) => {
						e.preventDefault();
						setStatus("sending…");
						const { error: sendError } = await sendVerificationEmail({
							email,
							callbackURL: `${window.location.origin}/verify-email`,
						});
						setStatus(
							sendError
								? `Error: ${sendError.message}`
								: "Sent — check your inbox.",
						);
					}}
				>
					<label htmlFor="verify-email" className="grid gap-1.5 text-sm">
						<span className="text-white/60">Resend to</span>
						<input
							id="verify-email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							className="h-9 rounded-md border border-white/12 bg-black/40 px-3 text-white outline-none transition focus:border-[#80dbff]/60"
						/>
					</label>
					<button
						type="submit"
						className="h-9 rounded-md border border-white/12 bg-white/[0.04] text-sm text-white/80 transition hover:bg-white/[0.08]"
					>
						Resend verification
					</button>
				</form>
				{status ? <p className="mt-3 text-sm text-white/70">{status}</p> : null}
				<a
					href="/dev"
					className="mt-4 inline-block text-[#80dbff] text-sm hover:underline"
				>
					← Dev console
				</a>
			</div>
		</main>
	);
}

export default function Page() {
	return (
		<Suspense>
			<VerifyEmail />
		</Suspense>
	);
}
