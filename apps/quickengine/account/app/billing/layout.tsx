import Link from "next/link";
import type { ReactNode } from "react";

// The dedicated billing area — deliberately OUTSIDE the (app) dashboard group, so it has
// no sidebar/header shell. Its own minimal frame makes upgrading a focused, standalone flow
// (auth is still enforced by the root layout). Same URLs as before (/billing/*), just shell-free.
export default function BillingLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen">
			<header className="flex h-14 items-center justify-between border-foreground/[0.06] border-b px-6">
				<Link href="/" className="font-display text-foreground">
					QuickEngine
				</Link>
				<Link
					href="/"
					className="text-muted-foreground text-sm transition-colors hover:text-foreground"
				>
					← Back to app
				</Link>
			</header>
			<main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
		</div>
	);
}
