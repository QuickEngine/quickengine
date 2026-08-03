import { createFileRoute } from "@tanstack/react-router";

/**
 * The bare root, which belongs to no business.
 *
 * Every real portal lives at `/<slug>`. Somebody landing here has either typed
 * the host on its own or followed a truncated link, so this says so plainly
 * rather than guessing at a workspace.
 *
 * ⚠️ Deliberately lists nothing. Offering a directory of published portals here
 * would hand anyone an inventory of which businesses are on the platform, which
 * is the same thing `/v1/customer/bootstrap/:slug` refuses to leak by answering
 * 404 identically for unknown and unpublished slugs.
 */
function Root() {
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

export const Route = createFileRoute("/")({ component: Root });
