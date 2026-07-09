import { Background } from "@quickengine/ui";
import { clashGrotesk, generalSans } from "@quickengine/ui/fonts";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
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
			className={`${generalSans.variable} ${clashGrotesk.variable}`}
		>
			<body>
				<Background />
				<NuqsAdapter>{children}</NuqsAdapter>
			</body>
		</html>
	);
}
