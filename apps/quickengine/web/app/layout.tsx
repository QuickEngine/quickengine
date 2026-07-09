import type { Metadata } from "next";
import { Background } from "./_components/background";
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
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://api.fontshare.com" />
				{/* Brand faces: Clash Grotesk (display) + General Sans (body). */}
				<link
					href="https://api.fontshare.com/v2/css?f[]=clash-grotesk@300,400,500,600&f[]=general-sans@400,500,600&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>
				<Background />
				{children}
			</body>
		</html>
	);
}
