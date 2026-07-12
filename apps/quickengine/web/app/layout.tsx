import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "./_components/theme-provider";
import {
	OG_IMAGE,
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_TAGLINE,
	SITE_URL,
	siteJsonLd,
} from "./_lib/seo";
import "./globals.css";

const HOME_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const metadata: Metadata = {
	// Resolves relative canonical + OG image paths to absolute URLs, which social
	// scrapers require. Every page inherits the OG/Twitter block below unless it
	// overrides it — that's what keeps the share image identical across the site.
	metadataBase: new URL(SITE_URL),
	applicationName: SITE_NAME,
	title: {
		default: HOME_TITLE,
		template: "%s | QuickEngine",
	},
	description: SITE_DESCRIPTION,
	alternates: { canonical: "/" },
	icons: {
		icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
	},
	openGraph: {
		title: HOME_TITLE,
		description: SITE_DESCRIPTION,
		url: "/",
		siteName: SITE_NAME,
		type: "website",
		locale: "en_US",
		images: [OG_IMAGE],
	},
	twitter: {
		card: "summary_large_image",
		title: HOME_TITLE,
		description: SITE_DESCRIPTION,
		images: [OG_IMAGE.url],
	},
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${generalSans.variable} ${clashGrotesk.variable}`}
		>
			<body>
				<script
					type="application/ld+json"
					// Static, build-time site schema — no user input, safe to inline.
					// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires a raw script body.
					dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }}
				/>
				<ThemeProvider>
					<Background />
					<NuqsAdapter>{children}</NuqsAdapter>
				</ThemeProvider>
			</body>
		</html>
	);
}
