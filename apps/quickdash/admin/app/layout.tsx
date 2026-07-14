import { getSession } from "@quickengine/auth/server";
import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ThemeProvider } from "./_components/theme-provider";
import "./globals.css";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const QUICKDASH_URL =
	process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL ?? "http://localhost:3011";

export const metadata: Metadata = {
	metadataBase: new URL(QUICKDASH_URL),
	title: { default: "QuickDash", template: "%s | QuickDash" },
	description: "Run your business from a configurable QuickDash workspace.",
	robots: { index: false, follow: false },
	icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await getSession(await headers());
	if (!session) {
		redirect(
			`${AUTH_URL}/signin?redirect=${encodeURIComponent(QUICKDASH_URL)}`,
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
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
