import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

/**
 * `/billing/credits` — the prepaid balance AI work draws from.
 *
 * 🔴 Restored 2026-09-06 from a stub. The balance, packs, top-up and
 * auto-recharge endpoints were all on disk and working with nothing able to
 * reach them.
 *
 * ⚠️ **Credits currently buy very little, and this page says so.** The agent
 * surface is built but has no API route yet, so there is almost nothing to
 * spend a balance on. Selling somebody credits they cannot use would be taking
 * money for nothing, so the page is honest about it rather than quietly
 * accepting top-ups. It becomes a straightforward purchase the day agents ship.
 */
const MICROS_PER_DOLLAR = 1_000_000;

const money = (cents: number) =>
	new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
		cents / 100,
	);

function CreditsPage() {
	const { active } = useActiveOrganization();
	const queryClient = useQueryClient();
	const credits = useQuery(accountQueries.credits(active?.id ?? ""));
	const [pending, setPending] = useState<string | null>(null);

	const topUp = useMutation({
		mutationFn: (pack: string) =>
			api.request<{ clientSecret?: string }>(
				`/account/credits/top-up?organizationId=${active?.id}`,
				{ method: "POST", body: { pack } },
			),
		onSettled: () => {
			setPending(null);
			queryClient.invalidateQueries({
				queryKey: ["account", active?.id, "credits"],
			});
		},
	});

	const balanceMicros = credits.data?.balanceMicros ?? 0;
	const packs =
		(
			credits.data as
				| { packs?: { id: string; amountCents: number }[] }
				| undefined
		)?.packs ?? [];

	return (
		<main className="mx-auto max-w-xl space-y-8 p-6">
			<div>
				<h1 className="font-semibold text-2xl">AI credits</h1>
				<p className="mt-1 text-muted-foreground">{active?.name}</p>
			</div>

			<section className="rounded-xl border p-5">
				<p className="text-muted-foreground text-sm">Balance</p>
				<p className="mt-1 font-semibold text-3xl">
					{credits.isPending
						? "-"
						: money((balanceMicros / MICROS_PER_DOLLAR) * 100)}
				</p>
			</section>

			{/*
			 * 🔑 The honest notice. Hard rule 4 permits telling customers what the
			 * product does; it does not permit selling them something that does not
			 * work yet. This is the difference.
			 */}
			<section className="rounded-xl border border-dashed p-5">
				<h2 className="font-medium">What credits pay for</h2>
				<p className="mt-2 text-muted-foreground text-sm">
					Credits pay for AI work: asking an agent to look at your workspace and
					answer a question about it. Your plan includes an allowance first, and
					credits only start being used once that runs out. More agent work is
					being built, including watching orders for problems. Everything else
					in QuickDash is covered by your plan and never touches credits.
				</p>
			</section>

			{packs.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-medium">Top up</h2>
					<div className="flex flex-wrap gap-3">
						{packs.map((pack) => (
							<button
								key={pack.id}
								type="button"
								disabled={topUp.isPending}
								onClick={() => {
									setPending(pack.id);
									topUp.mutate(pack.id);
								}}
								className="rounded-lg border px-4 py-2 font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
							>
								{pending === pack.id ? "Working…" : money(pack.amountCents)}
							</button>
						))}
					</div>
					{topUp.isError && (
						<p className="text-destructive text-sm">{topUp.error.message}</p>
					)}
				</section>
			)}

			<Link to="/billing" className="block text-sm underline">
				Back to billing
			</Link>
		</main>
	);
}

export const Route = createFileRoute("/billing/credits")({
	component: CreditsPage,
});
