import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import type { CSSProperties, ReactNode } from "react";

/**
 * The portal shell — a header and a rail, and nothing else.
 *
 * Deliberately NOT `ConsoleShell`. That is the operator surface: a rounded,
 * clipped window with a floating band, built to feel like an application you
 * live in. This is a utility somebody visits twice a year to find a receipt.
 * Square, full-bleed, hard borders — the shape QuickDash had before its
 * redesign, preserved at `internal/snapshots/quickdash-original/`. Reading
 * plainer than the dashboard is the correct outcome here, not a shortfall.
 *
 * The header spans the full width and the rail butts underneath it.
 * `--header-height` is read by both, which is what stops the rail sliding under
 * the band when either changes.
 */
export function PortalShell({
	brand,
	nav,
	account,
	children,
}: {
	/** The workspace's name. This portal belongs to the business, not to us. */
	brand: ReactNode;
	nav: ReactNode;
	account?: ReactNode;
	children: ReactNode;
}) {
	return (
		<SidebarProvider style={{ "--header-height": "3.5rem" } as CSSProperties}>
			<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center border-sidebar-border border-b bg-background">
				{/* Exactly the rail's width, carrying the same right border, so the
				    divider under the header continues the one beside the rail as a
				    single unbroken line. */}
				<div className="flex h-full w-(--sidebar-width) items-center border-sidebar-border border-r px-4">
					{brand}
				</div>
				<div className="flex flex-1 items-center justify-between px-4">
					<p className="truncate text-muted-foreground text-sm">Your account</p>
					{account}
				</div>
			</header>

			<Sidebar>{nav}</Sidebar>

			<SidebarInset className="pt-(--header-height)">{children}</SidebarInset>
		</SidebarProvider>
	);
}
