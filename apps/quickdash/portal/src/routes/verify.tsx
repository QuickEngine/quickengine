import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { customerApi, session } from "@/lib/api";

/**
 * Where an emailed sign-in link lands.
 *
 * Exchanges the single-use token for a session, stores it, and returns to the
 * portal. The token is stripped from the URL on the way out — leaving it in the
 * address bar puts a credential into browser history, shoulder-surfing range
 * and any `Referer` the next navigation sends.
 */
function Verify() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	// 🔴 The link is SINGLE USE, and StrictMode runs effects twice in
	// development. Without this guard the second run redeems an already-spent
	// token, fails, and reports a working sign-in as broken.
	const redeemed = useRef(false);

	useEffect(() => {
		if (redeemed.current) return;
		redeemed.current = true;

		const params = new URLSearchParams(window.location.search);
		const token = params.get("token");
		const workspace = params.get("workspace");
		// The link carries the workspace because the portal is multi-tenant and a
		// bare token would not say which storefront it belongs to.
		if (workspace) sessionStorage.setItem("quickdash-workspace", workspace);

		if (!token) {
			setError("This link is missing its token.");
			return;
		}

		customerApi
			.verify(token)
			.then((result) => {
				session.set(result.token);
				navigate({ to: "/", replace: true });
			})
			.catch((cause: Error) => setError(cause.message));
	}, [navigate]);

	return (
		<main className="grid min-h-dvh place-items-center p-6">
			<div className="max-w-sm text-center">
				{error ? (
					<>
						<h1 className="font-medium text-lg">That link didn&rsquo;t work</h1>
						<p className="mt-2 text-muted-foreground text-sm">{error}</p>
						<a
							href="/"
							className="mt-4 inline-block text-foreground text-sm underline underline-offset-4"
						>
							Request a new one
						</a>
					</>
				) : (
					<p className="text-muted-foreground text-sm">Signing you in…</p>
				)}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/verify")({ component: Verify });
