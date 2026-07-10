import { getSession } from "@quickengine/auth/server";
import { Background } from "@quickengine/ui";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { CSSProperties } from "react";
import { Breadcrumbs } from "./_components/breadcrumbs";
import { DashboardNav } from "./_components/nav";
import { ProfileMenu } from "./_components/profile-menu";
import { SearchBar } from "./_components/search-bar";
import { TeamSwitcher } from "./_components/team-switcher";
import { ThemeProvider } from "./_components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "Dashboard | QuickEngine",
		template: "%s | QuickEngine",
	},
	description: "Account, billing, and suite access for QuickEngine Software.",
	icons: {
		icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
	},
};

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const DASHBOARD_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL ?? "http://localhost:3001";

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	// The whole dashboard is behind auth: no valid session → bounce to the auth
	// app's sign-in, carrying a redirect back here so they land where they meant to.
	const session = await getSession(await headers());
	if (!session) {
		redirect(
			`${AUTH_URL}/signin?redirect=${encodeURIComponent(DASHBOARD_URL)}`,
		);
	}

	return (
		<html
			lang="en"
			className={`${generalSans.variable} ${clashGrotesk.variable}`}
			suppressHydrationWarning
		>
			<body>
				<ThemeProvider>
					<Background />
					<NuqsAdapter>
						<SidebarProvider
							style={{ "--header-height": "3.5rem" } as CSSProperties}
						>
							{/* Both the header and the sidebar are fixed, so they stay locked
						    together (no drift/overlap on scroll); only the content scrolls. */}
							<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center border-sidebar-border border-b bg-background">
								{/* Left zone matches the sidebar width so the switcher sits above it. */}
								<div className="flex h-full w-(--sidebar-width) items-center border-sidebar-border border-r px-4">
									<TeamSwitcher
										seed={session.user.id}
										name={session.user.name ?? session.user.email}
									/>
								</div>
								<div className="flex flex-1 items-center justify-between px-4">
									<Breadcrumbs />
									<div className="flex items-center gap-3">
										<SearchBar />
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
							<SidebarInset className="pt-(--header-height)">
								{children}
							</SidebarInset>
						</SidebarProvider>
					</NuqsAdapter>
				</ThemeProvider>
			</body>
		</html>
	);
}
