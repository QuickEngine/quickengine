import type { Metadata } from "next";

// The page is a client component, so its title lives here in a server layout.
export const metadata: Metadata = { title: "Reset Password" };

export default function Layout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return children;
}
