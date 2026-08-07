import {
	createFileRoute,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { bootstrapPortal, customerApi, session } from "@/lib/api";

/**
 * Where a storefront hands a signed-in shopper over.
 *
 * They already proved who they are on the shop's own site, so asking for another
 * emailed link here would be theatre. What arrives instead is a one-use ticket,
 * valid for seconds, which is traded for a portal session of its own.
 *
 * 🔴 The ticket is NOT the storefront's session. Nothing about that credential
 * crosses origins — if it did, one token would live on two domains, a leak on
 * either would compromise both, and signing out here could not revoke it there.
 *
 * The ticket is stripped from the URL on the way out for the same reason the
 * sign-in link is: leaving it in the address bar puts it in browser history,
 * shoulder-surfing range, and any `Referer` the next navigation sends. It is
 * already spent by then, which is the belt to this braces.
 */
function Handoff() {
	const navigate = useNavigate();
	const { slug } = useParams({ from: "/$slug/handoff" });
	const [error, setError] = useState<string | null>(null);
	// 🔴 The ticket is SINGLE USE and StrictMode runs effects twice in
	// development. Without this guard the second run redeems an already-spent
	// ticket, fails, and reports a working handoff as broken.
	const redeemed = useRef(false);

	useEffect(() => {
		if (redeemed.current) return;
		redeemed.current = true;

		const token = new URLSearchParams(window.location.search).get("token");
		if (!token) {
			setError("This link is missing its handoff token.");
			return;
		}

		// Bootstrap first: this route is entered directly from another origin, so
		// the portal route's loader has not run and there is no publishable key yet
		// — and redeeming needs one to say which workspace is asking.
		bootstrapPortal(slug)
			.then(() => customerApi.redeemHandoff(token))
			.then((result) => {
				session.set(result.token);
				navigate({ to: "/$slug", params: { slug }, replace: true });
			})
			.catch((cause: Error) => setError(cause.message));
	}, [navigate, slug]);

	return (
		<main className="grid min-h-dvh place-items-center p-6">
			<div className="max-w-sm text-center">
				{error ? (
					<>
						<h1 className="font-medium text-lg">
							We couldn&rsquo;t sign you in
						</h1>
						<p className="mt-2 text-muted-foreground text-sm">{error}</p>
						<a
							href={`/${slug}`}
							className="mt-4 inline-block text-foreground text-sm underline underline-offset-4"
						>
							Sign in instead
						</a>
					</>
				) : (
					<p className="text-muted-foreground text-sm">Signing you in…</p>
				)}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/$slug/handoff")({ component: Handoff });
