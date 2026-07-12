import { getSession } from "@quickengine/auth/server";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { Breadcrumbs } from "../_components/breadcrumbs";
import { DashboardNav } from "../_components/nav";
import { ProfileMenu } from "../_components/profile-menu";
import { SearchBar } from "../_components/search-bar";
import { TeamSwitcher } from "../_components/team-switcher";
import { UpgradeButton } from "../_components/upgrade-button";
import { getAccountState } from "../_lib/onboarding";

// The account-app shell (header + sidebar). Lives in its own route group so the
// onboarding takeover can render outside it. Auth is already enforced by the root
// layout; here we just read the session for the header identity.
export default async function AppLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await getSession(await headers());
	if (!session) {
		return null; // unreachable — the root layout already redirected
	}
	// Fresh account read (company name + onboarding flag) — avoids the stale
	// session cookie cache. First-run users go to onboarding; this layout doesn't
	// wrap /onboarding, so there's no redirect loop.
	const account = await getAccountState(session.user.id);
	if (!account.onboardingCompletedAt) {
		redirect("/onboarding");
	}

	return (
		<SidebarProvider style={{ "--header-height": "3.5rem" } as CSSProperties}>
			{/* Both the header and the sidebar are fixed, so they stay locked
			    together (no drift/overlap on scroll); only the content scrolls. */}
			<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center border-sidebar-border border-b bg-background">
				{/* Left zone matches the sidebar width so the switcher sits above it. */}
				<div className="flex h-full w-(--sidebar-width) items-center border-sidebar-border border-r px-4">
					<TeamSwitcher
						seed={session.user.id}
						name={
							account.companyName ?? session.user.name ?? session.user.email
						}
					/>
				</div>
				<div className="flex flex-1 items-center justify-between px-4">
					<Breadcrumbs />
					<div className="flex items-center gap-3">
						<SearchBar />
						<UpgradeButton />
						<ProfileMenu
							seed={session.user.id}
							name={session.user.name ?? ""}
							email={session.user.email}
						/>
					</div>
				</div>
			</header>
			<Sidebar>
				<DashboardNav />
			</Sidebar>
			<SidebarInset className="pt-(--header-height)">{children}</SidebarInset>
		</SidebarProvider>
	);
}
