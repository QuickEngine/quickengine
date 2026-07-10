import { getSession } from "@quickengine/auth/server";
import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "./_components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "Workspaces | QuickEngine",
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

// Root layout: theme + background + auth gate for every route (the app shell and
// the shell-free onboarding both live under here). No valid session → bounce to
// the auth app's sign-in, carrying a redirect back so they land where they meant.
export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
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
					<NuqsAdapter>{children}</NuqsAdapter>
				</ThemeProvider>
			</body>
		</html>
	);
}
