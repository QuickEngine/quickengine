const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

// Marketing stays marketing. Workspace configuration, including optional AI setup,
// begins only after authentication inside Account onboarding.
export function Hero() {
	return (
		<section className="page-gutter sticky top-16 z-0 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center text-center">
			<p className="text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
				Introducing QuickDash
			</p>
			<h1 className="mt-6 max-w-4xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-7xl">
				The backend your <br className="hidden sm:block" />
				whole business runs on.
			</h1>
			<p className="mt-7 max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg">
				Start with a useful workspace, choose how much help you want, and change
				anything later.
			</p>
			<div className="mt-10 flex flex-wrap items-center justify-center gap-3">
				<a
					href={`${AUTH_URL}/signup`}
					className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
				>
					Get started free
				</a>
				<a
					href={`${AUTH_URL}/signin`}
					className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
				>
					Sign in
				</a>
			</div>
		</section>
	);
}
