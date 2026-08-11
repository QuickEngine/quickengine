"use client";

import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

type Status = "loading" | "operational" | "degraded";

/**
 * The public status page — Atlassian Statuspage, not a route we host.
 *
 * Exported so the footers, the marketing header and the account settings dialog
 * all point at one string. It replaced an in-repo `/status` route on 2026-08-10;
 * that page listed hand-written uptime figures like "99.99%" that nothing
 * measured, which is a fabricated claim on a public page.
 *
 * A status page has to be hosted somewhere that stays up when we do not — an
 * outage that also takes down the page reporting the outage is the one failure
 * a status page exists to prevent.
 */
export const STATUS_URL = "https://quickdash.statuspage.io";

// A small "All systems operational" pill that actually pings the app's health
// endpoint (so it's honest, not decorative) and links out to the status page.
// Shared so the web footer and the account app show the same thing.
export function StatusIndicator({
	href = STATUS_URL,
	endpoint = "/api/health",
	className,
}: {
	/** Where the label links (the status page). */
	href?: string;
	/** Health endpoint to probe; ok = operational, anything else = degraded. */
	endpoint?: string;
	className?: string;
}) {
	const [status, setStatus] = useState<Status>("loading");

	useEffect(() => {
		let active = true;
		fetch(endpoint, { cache: "no-store" })
			.then((res) => {
				if (active) {
					setStatus(res.ok ? "operational" : "degraded");
				}
			})
			.catch(() => {
				if (active) {
					setStatus("degraded");
				}
			});
		return () => {
			active = false;
		};
	}, [endpoint]);

	const label =
		status === "operational"
			? "All systems operational"
			: status === "degraded"
				? "Some systems degraded"
				: "Checking status…";
	const dot =
		status === "operational"
			? "bg-emerald-500"
			: status === "degraded"
				? "bg-amber-500"
				: "bg-muted-foreground/40";

	return (
		<a
			href={href}
			// The destination is off-site, so it opens in a new tab: someone checking
			// whether we are up is usually mid-task in the product and should not
			// lose it. `noreferrer noopener` because the target is third-party.
			target="_blank"
			rel="noreferrer noopener"
			className={cn(
				"inline-flex items-center gap-2 text-muted-foreground text-xs transition-colors hover:text-foreground",
				className,
			)}
		>
			<span className="relative flex size-2 items-center justify-center">
				{status === "operational" ? (
					<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60 motion-reduce:hidden" />
				) : null}
				<span className={cn("relative inline-flex size-2 rounded-full", dot)} />
			</span>
			{label}
		</a>
	);
}
