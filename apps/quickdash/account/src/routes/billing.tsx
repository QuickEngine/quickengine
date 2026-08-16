import { createFileRoute } from "@tanstack/react-router";

/**
 * `/billing`
 *
 * ⚠️ Stubbed on 2026-08-15, to be designed with the rest of billing. Presentation
 * only: the plan, pricing, credits, top-up and auto-recharge endpoints and their
 * queries are all still on disk, and the working Stripe Elements flow is in git
 * history at this path.
 */
function Page() {
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/billing")({ component: Page });
