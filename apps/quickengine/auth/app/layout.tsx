import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

// Share images live in the web app's /public — reference the single files there
// so all three apps unfurl with the same art and nothing can drift.
const WEB_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "https://quickengine.xyz";
const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const OG_TITLE = "QuickEngine — Sign in";
const OG_DESCRIPTION =
	"Central sign-in and account access for QuickEngine Software.";

export const metadata: Metadata = {
	metadataBase: new URL(AUTH_URL),
	title: {
		default: "Sign In",
		template: "%s | QuickEngine",
	},
	description: OG_DESCRIPTION,
	// App surface: keep sign-in pages out of search so they don't outrank or
	// dilute the marketing site — but they still unfurl nicely when shared.
	robots: { index: false, follow: false },
	icons: {
		icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
	},
	openGraph: {
		title: OG_TITLE,
		description: OG_DESCRIPTION,
		url: AUTH_URL,
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

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			className={`${generalSans.variable} ${clashGrotesk.variable}`}
		>
			<body>
				<Background />
				<NuqsAdapter>{children}</NuqsAdapter>
			</body>
		</html>
	);
}
