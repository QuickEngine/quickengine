import { getSession } from "@quickengine/auth/server";
import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "Overview | QuickEngine",
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
const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "http://localhost:3000";

// Sign-out is a navigation to the auth IdP's server route (same-origin there —
// no cross-origin fetch), which clears the session and returns to the web home.
const SIGN_OUT_HREF = `${AUTH_URL}/signout?redirect=${encodeURIComponent(WEB_URL)}`;

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
		>
			<body>
				<Background />
				<NuqsAdapter>
					<div className="flex min-h-dvh flex-col">
						<header className="flex h-16 items-center justify-between border-white/10 border-b px-6">
							<span className="font-normal text-[13px] text-foreground uppercase tracking-[0.08em]">
								QuickEngine
							</span>
							<div className="flex items-center gap-4">
								<span className="text-[13px] text-muted-foreground">
									{session.user.email}
								</span>
								<a
									href={SIGN_OUT_HREF}
									className="text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
								>
									Sign out
								</a>
							</div>
						</header>
						<main className="flex-1">{children}</main>
					</div>
				</NuqsAdapter>
			</body>
		</html>
	);
}
