"use client";

import { useEffect, useState } from "react";
import { getUpgradeState, type UpgradeState } from "../_lib/account-actions";

const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "https://quickengine.xyz";

// Subtle "Upgrade" pill in the header — present for every tier below the top one,
// with a small amber/red dot only once a usage meter hits warn/over, so it nudges
// without nagging. Hidden entirely on the top tier (nothing to sell).
export function UpgradeButton() {
	const [state, setState] = useState<UpgradeState | null>(null);

	useEffect(() => {
		let active = true;
		getUpgradeState()
			.then((next) => {
				if (active) {
					setState(next);
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	if (!state?.show) {
		return null;
	}

	const attention = state.urgency !== "none";
	const title =
		state.urgency === "over"
			? "You've hit a plan limit — upgrade for more"
			: state.urgency === "nudge"
				? "You're getting close to a plan limit"
				: "Upgrade your plan";

	return (
		<a
			href={`${WEB_URL}/pricing`}
			title={title}
			className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1 font-medium text-foreground text-xs transition-colors hover:bg-foreground/5"
		>
			{attention ? (
				<span
					className={`size-1.5 rounded-full ${
						state.urgency === "over" ? "bg-red-500" : "bg-amber-500"
					}`}
				/>
			) : null}
			Upgrade
		</a>
	);
}
