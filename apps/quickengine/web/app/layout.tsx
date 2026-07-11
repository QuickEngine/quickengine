import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "./_components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "Home | QuickEngine",
		template: "%s | QuickEngine",
	},
	description: "Build more. Switch less.",
	icons: {
		icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
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
				<ThemeProvider>
					<Background />
					<NuqsAdapter>{children}</NuqsAdapter>
				</ThemeProvider>
			</body>
		</html>
	);
}
