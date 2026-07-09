import type { Metadata } from "next";
import { Background } from "./_components/background";
import { clashGrotesk, generalSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "QuickEngine Auth",
		template: "%s | QuickEngine Auth",
	},
	description: "Central sign-in and account access for QuickEngine Software.",
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
				{children}
			</body>
		</html>
	);
}
