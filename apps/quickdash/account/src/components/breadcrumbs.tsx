import { CaretRight } from "@phosphor-icons/react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@quickengine/ui/components/ui/breadcrumb";
import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";

// Human labels for path segments; anything unmapped falls back to title case.
const LABELS: Record<string, string> = {
	overview: "Overview",
	usage: "Usage",
	team: "Team",
	integrations: "Integrations",
	activity: "Activity",
	billing: "Billing",
	support: "Support",
	settings: "Settings",
	profile: "Profile",
	security: "Security",
	"api-keys": "API keys",
	workspaces: "Workspaces",
	new: "New workspace",
};

// Parent segments that have no index route of their own point at a sensible
// landing child instead, so the crumb stays clickable without 404ing (there is
// no /settings page, so "Settings" lands on the first settings screen).
const PARENT_HREF: Record<string, string> = {
	settings: "/settings/profile",
	workspaces: "/",
};

function labelFor(segment: string): string {
	return (
		LABELS[segment] ??
		segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
	);
}

// Location crumbs for the header, derived from the current path. Mirrors the
// sidebar's labels so the two never disagree about what a route is called.
export function Breadcrumbs() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const segments = pathname.split("/").filter(Boolean);

	// Console root mirrors the sidebar's first item.
	if (segments.length === 0) {
		return (
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbPage>Workspaces</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		);
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{segments.map((segment, i) => {
					const path = `/${segments.slice(0, i + 1).join("/")}`;
					const href = PARENT_HREF[segment] ?? path;
					const isLast = i === segments.length - 1;
					const label = labelFor(segment);

					return (
						<Fragment key={path}>
							{/* Parent crumbs are desktop-only. On a phone the header shows the
							    page name alone — a trail at 375px costs the width the name
							    needs, and the leaf is the whole answer. */}
							<BreadcrumbItem className={isLast ? "" : "hidden md:inline-flex"}>
								{isLast ? (
									<BreadcrumbPage>{label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link to={href}>{label}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
							{!isLast && (
								<BreadcrumbSeparator className="hidden md:block">
									<CaretRight />
								</BreadcrumbSeparator>
							)}
						</Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
