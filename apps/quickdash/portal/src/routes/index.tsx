import { createFileRoute } from "@tanstack/react-router";
import { bootstrapPortalByHost } from "@/lib/api";
import { Portal } from "./$slug.index";

/**
 * The bare root, which belongs to no business.
 *
 * Reached two ways, and they mean different things. A business on its own
 * domain — `account.theirshop.com` — has no slug to put in the URL, so the host
 * identifies the workspace and the loader below resolves it. Anybody else has
 * typed the shared host on its own or followed a truncated link, and gets this.
 *
 * ⚠️ Deliberately lists nothing. Offering a directory of published portals here
 * would hand anyone an inventory of which businesses are on the platform, which
 * is the same thing `/v1/customer/bootstrap/:slug` refuses to leak by answering
 * 404 identically for unknown and unpublished slugs. Resolving by host does not
 * weaken that: the visitor supplied the host, and an unknown one still 404s.
 */
function Nowhere() {
	return (
		<main className="grid min-h-dvh place-items-center p-6">
			<div className="max-w-sm text-center">
				<h1 className="font-medium text-lg">Nothing at this address</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Customer portals live at their own address. Use the link the business
					sent you.
				</p>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/")({
	// 🔴 A LOADER, for the same reason the slug route uses one: the publishable
	// key must exist before any other request leaves the page, or `call()` fires
	// with an empty key and answers 401 on the first paint.
	loader: () => bootstrapPortalByHost(),
	// No portal at this host is the ordinary case for the shared address, not a
	// failure worth a stack trace.
	errorComponent: Nowhere,
	component: Portal,
});
