import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "Overview",
		template: "%s | QuickEngine",
	},
	description: "Account, billing, and suite access for QuickEngine Software.",
	icons: {
		icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
	},
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>
				<NuqsAdapter>{children}</NuqsAdapter>
			</body>
		</html>
	);
}
