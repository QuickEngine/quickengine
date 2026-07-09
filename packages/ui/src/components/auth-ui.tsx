import type { ReactNode } from "react";

// Shared, on-brand form + shell primitives used by the auth screens and any app
// that needs the same flat void-black look (dashboard settings, error pages, …).
// Framework-agnostic (plain <img>, no next-specific imports) so `@quickengine/ui`
// stays dependency-light.

export const field =
	"h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-white/25 focus:bg-white/[0.05]";

export const socialButton =
	"inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-[14px] text-foreground outline-none transition-colors hover:bg-white/[0.06] focus-visible:border-white/25 disabled:opacity-60";

export const primaryButton =
	"inline-flex h-11 items-center justify-center rounded-lg bg-white font-medium text-[14px] text-black outline-none transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-60";

export const subtleButton =
	"inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-white/10 text-[14px] text-foreground outline-none transition-colors hover:bg-white/[0.04] focus-visible:border-white/25 disabled:opacity-60";

export const textLink =
	"text-[13px] text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground";

// Centered shell with the logo — no marketing chrome. Expects a `/logo.svg` in
// the consuming app's public directory.
export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-dvh items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm">
				<div className="mb-10 flex justify-center">
					{/* biome-ignore lint/performance/noImgElement: framework-agnostic shared pkg — plain img for a tiny SVG logo */}
					<img src="/logo.svg" alt="QuickEngine" width={28} height={28} />
				</div>
				{children}
			</div>
		</main>
	);
}

export function Divider({ label = "or" }: { label?: string }) {
	return (
		<div className="my-6 flex items-center gap-4">
			<span className="h-px flex-1 bg-white/10" />
			<span className="text-[12px] text-muted-foreground">{label}</span>
			<span className="h-px flex-1 bg-white/10" />
		</div>
	);
}

// Reusable centered status screen for HTTP/error pages (404, 500, …). `code` is
// the big faint status number; `action` an optional button/link row.
export function StatusScreen({
	code,
	title,
	message,
	action,
}: {
	code?: string;
	title: string;
	message: string;
	action?: ReactNode;
}) {
	return (
		<AuthShell>
			<div className="text-center">
				{code ? (
					<p className="text-[13px] text-muted-foreground tracking-[0.3em]">
						{code}
					</p>
				) : null}
				<h1 className="mt-2 font-medium text-[22px] text-foreground tracking-tight">
					{title}
				</h1>
				<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
					{message}
				</p>
				{action ? <div className="mt-6">{action}</div> : null}
			</div>
		</AuthShell>
	);
}

// Quiet route-level loading fallback (Suspense) — one pulsing line, no jarring
// blank flash. Shared so every app's loading state matches.
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-4">
				<div className="h-1 w-24 animate-pulse rounded-full bg-white/15" />
				<p className="text-[13px] text-muted-foreground">{label}</p>
			</div>
		</AuthShell>
	);
}
