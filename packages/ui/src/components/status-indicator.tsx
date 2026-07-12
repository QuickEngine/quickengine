"use client";

import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

type Status = "loading" | "operational" | "degraded";

// A small "All systems operational" pill that actually pings the app's health
// endpoint (so it's honest, not decorative) and links out to the status page.
// Shared so the web footer and the account app show the same thing.
export function StatusIndicator({
	href = "/status",
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
