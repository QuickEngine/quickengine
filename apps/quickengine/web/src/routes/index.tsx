import { useSession } from "@quickengine/auth/client";
import { WaveBackground } from "@quickengine/ui/wave-background";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConfiguredFor } from "@/components/configured-for";
import { Connect } from "@/components/connect";
import { Cta } from "@/components/cta";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { MeetQuickDash } from "@/components/meet-quickdash";
import { Panel } from "@/components/panel";
import { PricingPromise } from "@/components/pricing-promise";
import { Problem } from "@/components/problem";
import { Questions } from "@/components/questions";
import { Story } from "@/components/story";
import { Trust } from "@/components/trust";
import { env } from "@/lib/env";

const ACCOUNT_URL = env.VITE_ACCOUNT_URL;

/**
 * The QuickEngine front page — an empty canvas, as of 2026-08-09.
 *
 * Stripped back for the Step 10 design pass. The header, hero, product window and
 * mesh background are still on disk in `src/components/` and still used by the
 * other marketing routes; only this page stopped rendering them.
 *
 * The background is the whole page right now. Tuning lives in
 * `components/wave-background.tsx`, not here.
 */
function Page() {
	// Kept because it is behaviour, not decoration: a signed-in visitor belongs in
	// the product, not on the sales page. Fails open — if the session lookup errors
	// or is slow, the page still renders.
	const { data: session } = useSession();
	useEffect(() => {
		if (session) window.location.href = ACCOUNT_URL;
	}, [session]);

	return (
		// ⚠️ No `overflow-hidden` anywhere on this wrapper or above it. The hero is
		// `sticky`, and an overflow value other than `visible` on ANY ancestor
		// silently turns that into ordinary scrolling — the single most common way
		// this effect breaks.
		<div className="relative isolate min-h-dvh">
			<WaveBackground grain />
			<Header />
			<Hero />
			{/* Product first, argument second. The hero states an ambition rather
			    than a category, so the first question it leaves a visitor with is
			    "what IS this", and nothing persuades until that is answered.
			    Reversed on 2026-08-10 for that reason. */}
			{/* The order is an argument, not a menu. Problem earns the attention
			    the hero spent; the product answers it; the story proves the parts
			    are wired together; Connect removes the "I would have to rebuild
			    everything" objection; Configured For makes it personal; the
			    statement handles price; Trust makes it safe to say yes; Questions
			    clears what is left; then the ask. */}
			<Panel>
				<Problem />
				<MeetQuickDash />
				<Story />
				<Connect />
				<ConfiguredFor />
				<PricingPromise />
				<Trust />
				<Questions />
				<Cta />
				<Footer />
			</Panel>
		</div>
	);
}

export const Route = createFileRoute("/")({
	component: Page,
});
