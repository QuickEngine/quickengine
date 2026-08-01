import { useSession } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { MeshBackground } from "@/components/mesh-background";
import { ProductWindow } from "@/components/product-window";
import { env } from "@/lib/env";

const ACCOUNT_URL = env.VITE_ACCOUNT_URL;

/**
 * The QuickEngine front page — blank, deliberately, as of 2026-07-31.
 *
 * Everything was removed so the redesign starts from an empty canvas rather than
 * retrofitting a layout nobody chose. Sections get built back one at a time.
 *
 * The complete previous page is kept verbatim at `internal/snapshots/web-original/`
 * (git-ignored) — nothing was lost, and anything worth keeping can be pulled back
 * deliberately instead of from memory.
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
		<div className="relative isolate min-h-dvh">
			<MeshBackground />
			<Header />
			<main className="relative z-10 bg-void pt-[var(--header-h)]">
				<Hero />
				<ProductWindow />
			</main>
		</div>
	);
}

export const Route = createFileRoute("/")({
	component: Page,
});
