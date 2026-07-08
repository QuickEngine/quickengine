"use client";

import { resetPassword } from "@quickengine/auth/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPassword() {
	const token = useSearchParams().get("token") ?? "";
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState("");

	return (
		<main className="grid min-h-dvh place-items-center bg-[#05070d] px-6 text-white antialiased">
			<div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6">
				<h1 className="font-semibold text-lg tracking-tight">Reset password</h1>
				<p className="mt-1 text-sm text-white/45">
					{token
						? "Choose a new password for your account."
						: "No token found — open this page from the reset email link."}
				</p>
				<form
					className="mt-5 grid gap-3"
					onSubmit={async (e) => {
						e.preventDefault();
						setStatus("resetting…");
						const { error } = await resetPassword({
							newPassword: password,
							token,
						});
						setStatus(
							error
								? `Error: ${error.message}`
								: "Password reset — you can sign in now.",
						);
					}}
				>
					<label htmlFor="new-password" className="grid gap-1.5 text-sm">
						<span className="text-white/60">New password</span>
						<input
							id="new-password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="h-9 rounded-md border border-white/12 bg-black/40 px-3 text-white outline-none transition focus:border-[#80dbff]/60"
						/>
					</label>
					<button
						type="submit"
						className="h-9 rounded-md border border-[#80dbff]/40 bg-[#80dbff]/10 text-sm text-white transition hover:bg-[#80dbff]/20"
					>
						Reset password
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
			<ResetPassword />
		</Suspense>
	);
}
