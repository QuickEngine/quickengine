import { getSession } from "@quickengine/auth/server";
import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "./_components/theme-provider";
import "./globals.css";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const DASHBOARD_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL ?? "http://localhost:3001";
// Share images live in the web app's /public — one source of truth, no drift.
const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "https://quickengine.xyz";
const OG_TITLE = "QuickEngine — Dashboard";
const OG_DESCRIPTION =
	"Account, billing, and suite access for QuickEngine Software.";

export const metadata: Metadata = {
	metadataBase: new URL(DASHBOARD_URL),
	title: {
		default: "Workspaces | QuickEngine",
		template: "%s | QuickEngine",
	},
	description: OG_DESCRIPTION,
	// The app lives behind login — keep it out of search entirely, but still let
	// shared links unfurl with the brand card.
	robots: { index: false, follow: false },
	icons: {
		icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
	},
	openGraph: {
		title: OG_TITLE,
		description: OG_DESCRIPTION,
		url: DASHBOARD_URL,
		siteName: "QuickEngine",
		type: "website",
		locale: "en_US",
		images: [
			{
				url: new URL("/og-image.png", WEB_URL).toString(),
				width: 1200,
				height: 630,
				alt: "QuickEngine — Build more. Switch less.",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: OG_TITLE,
		description: OG_DESCRIPTION,
		images: [new URL("/twitter-image.png", WEB_URL).toString()],
	},
};

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
