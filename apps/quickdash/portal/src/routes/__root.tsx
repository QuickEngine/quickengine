import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
	component: () => (
		<>
			<Outlet />
			{/* Every surface was designed at desktop width first, and the small
			    screen passes have not been done. Saying so is the difference between
			    a product that is under construction and one that looks broken. */}
			{/*
			 * 🔴 The small-screen wall is GONE, everywhere, 2026-09-06.
			 *
			 * It said "QuickDash needs a bigger screen" under 1024px. That was honest, and
			 * it was also a locked door on the four surfaces a stranger is most likely to
			 * open on a phone: the marketing site somebody reaches from a link, the sign-in
			 * they were sent to, the billing page where they upgrade, and the portal where
			 * a customer's own customer checks an order.
			 *
			 * ⚠️ The small-screen passes are still not done, so these layouts are cramped.
			 * Cramped and usable beats a notice telling somebody to come back on a laptop —
			 * especially on the marketing site, where turning away a phone visitor turns
			 * away the exact person outreach is meant to reach.
			 */}
		</>
	),
});
