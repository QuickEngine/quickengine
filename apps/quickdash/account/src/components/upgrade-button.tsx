import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

// Subtle "Upgrade" pill in the header — present for every tier below the top one,
// with a small amber/red dot only once a usage meter hits warn/over, so it nudges
// without nagging. Hidden entirely on the top tier (nothing to sell).
export function UpgradeButton() {
	const { active } = useActiveOrganization();
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));
	if (plan.data?.planId !== "free") {
		return null;
	}
	const states = Object.values(plan.data.usage).map((meter) => meter.state);
	const urgency = states.includes("over")
		? "over"
		: states.includes("warn")
			? "nudge"
			: "none";
	const attention = urgency !== "none";
	const title =
		urgency === "over"
			? "You've hit a plan limit — upgrade for more"
			: urgency === "nudge"
				? "You're getting close to a plan limit"
				: "Upgrade your plan";

	return (
		<Link
			to="/billing/plans"
			title={title}
			className="btn btn-secondary pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-void px-3 font-body font-[450] text-[13px] text-ink"
		>
			{attention ? (
				<span
					className={`size-1.5 rounded-full ${
						urgency === "over" ? "bg-red-500" : "bg-amber-500"
					}`}
				/>
			) : null}
			Upgrade
		</Link>
	);
}
