import { STATUS_URL } from "@quickengine/ui";
import {
	isStaleChunkError,
	recoverFromStaleChunk,
} from "@quickengine/ui/lib/stale-chunk";
import { WaveBackground } from "@quickengine/ui/wave-background";
import { type ReactNode, useEffect, useState } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Pill } from "@/components/pill";

/**
 * The marketing site's error and status pages.
 *
 * ⚠️ These do NOT use `StatusScreen` from `@quickengine/ui`, which is what they
 * ran on until 2026-08-10. That component predates the redesign: a centred card
 * on flat void black, `font-medium` at 22px, a white pill button. It shares no
 * type, no colour and no alignment with anything on the site now, so landing on
 * a 404 read as being dropped onto a different product. `StatusScreen` is left
 * in place because the dashboard apps still use it — this is the marketing
 * app's own shell, not a replacement for it.
 *
 * The page is the site: same fixed header, same footer, same gradient and the
 * same pills as the hero. An error page is one a visitor is MORE likely to
 * bounce from, so it should look like somewhere worth staying rather than like
 * the wheels coming off.
 *
 * There is no status number anywhere on it. The heading says what happened in
 * words, which is what anyone who is not a developer is actually reading; the
 * numbers survive only as the dev-only viewer routes.
 */
export function ErrorPage({
	title,
	message,
	actions,
}: {
	title: string;
	message: string;
	actions: ReactNode;
}) {
	return (
		<div className="relative isolate bg-black">
			{/* One full-height section holding the gradient, with the footer AFTER it
			    rather than inside it, so the page opens as a single screen and the
			    footer is something you scroll to, not something competing with the
			    message for the same view. */}
			<section className="relative min-h-dvh">
				{/* `absolute`, not `fixed`. Fixed would follow the scroll and sit behind
				    the footer as well, which is the one place on this page the gradient
				    must not be. */}
				<div aria-hidden="true" className="absolute inset-0 overflow-hidden">
					<WaveBackground position="absolute" />
				</div>

				<Header />

				{/* Centred both ways. The header is fixed and contributes no height, so
				    without the top offset the optical centre sits half a header too
				    high. */}
				<main className="relative flex min-h-dvh flex-col items-center justify-center pt-[var(--header-h)] pb-16 text-center site-gutter">
					<h1 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
						{title}
					</h1>

					<p className="mt-7 max-w-[52ch] font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
						{message}
					</p>

					<div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
						{actions}
					</div>
				</main>
			</section>

			<Footer />
		</div>
	);
}

/**
 * 404 — the one that will actually be seen.
 *
 * ⚠️ The header menus and the footer sitemap both link to pages that do not
 * exist yet, on purpose, as the working list of what the site owes. Until those
 * are built or cut, this screen is reachable from every page on the site by
 * design, so it is worth more than a shrug.
 */
export function NotFoundPage() {
	return (
		<ErrorPage
			title="That page isn't here."
			message="The link may be old, or the page may not be built yet. Everything else is where you left it."
			actions={
				<>
					<Pill href="/" variant="primary" size="lg" disc="arrow">
						Back home
					</Pill>
					<Pill href="/docs" variant="secondary" size="lg" disc="arrow">
						Read the docs
					</Pill>
				</>
			}
		/>
	);
}

/**
 * 500 — a render or route error inside the app itself.
 *
 * `reset` re-runs the failed route rather than reloading the page, so a
 * transient failure recovers without losing everything else already loaded.
 */
export function AppErrorPage({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	// A failed dynamic import is not a crash and must not be reported as one. See
	// `lib/stale-chunk.ts` for why this happens and why it is only ever seen in
	// production.
	const stale = isStaleChunkError(error);
	const [recovering, setRecovering] = useState(stale);

	useEffect(() => {
		if (!stale) return;
		// `false` means a reload was already tried moments ago and did not help, so
		// this is a genuine failure and deserves the real screen.
		if (!recoverFromStaleChunk()) setRecovering(false);
	}, [stale]);

	// The page is reloading. The skeleton is the honest thing to show: something
	// IS loading, and an error screen that vanishes half a second later would be
	// a worse experience than the wait it is describing.
	if (recovering) return <PageSkeleton />;

	if (stale) {
		return (
			<ErrorPage
				title="There's a newer version of this page."
				message="We shipped an update while you had this open. Reloading picks it up, nothing is wrong and nothing is lost."
				actions={
					<Pill
						onClick={() => window.location.reload()}
						variant="primary"
						size="lg"
						disc="arrow"
					>
						Reload
					</Pill>
				}
			/>
		);
	}

	return (
		<>
			<ErrorPage
				title="Something went wrong on our end."
				message="This one is ours, not yours. Try again, and if it keeps happening our status page will say whether we already know."
				actions={
					<>
						{/* Retries the failed route in place. NOT a reload — everything else
					    already loaded stays loaded, so a transient failure costs a click
					    rather than the whole page. */}
						<Pill onClick={reset} variant="primary" size="lg" disc="arrow">
							Try again
						</Pill>
						{/* Status rather than home: if the app itself just failed to render,
					    another route in the same app is not a confident recommendation,
					    and the message has already pointed here. */}
						<Pill href={STATUS_URL} variant="secondary" size="lg" disc="launch">
							Live status
						</Pill>
					</>
				}
			/>

			{/* 🔴 DEV ONLY. `import.meta.env.DEV` is a build-time constant, so Vite
		    substitutes `false` and the bundler drops this entire branch, exception
		    text cannot reach a visitor. That is not a nicety: keeping raw exception
		    messages away from anywhere a user can see them is what a whole security
		    slice was spent on. Never make this a runtime check or a query flag.

		    ⚠️ `fixed`, deliberately. It was a block in the flow first and it shoved
		    the centred message up the page, so the screen being debugged was not the
		    screen that ships. Out of flow it costs the layout nothing and the
		    centring holds whether it is there or not. */}
			{import.meta.env.DEV && error?.message ? (
				<div className="fixed inset-x-0 bottom-0 z-40 border-white/10 border-t bg-black/85 px-4 py-1.5 backdrop-blur-sm">
					<p className="truncate text-center font-mono text-[11px] text-white/40">
						{error.message}
					</p>
				</div>
			) : null}
		</>
	);
}

/**
 * 503 — planned maintenance or a dependency the site cannot reach.
 *
 * Not wired to a route: nothing in the app decides to render this. It is here so
 * the screen exists and matches when the platform needs to serve it, which is
 * the point at which nobody has time to design one.
 */
export function MaintenancePage() {
	return (
		<ErrorPage
			title="Back in a few minutes."
			message="We're making a change that needs everything briefly offline. Nothing has been lost and nothing needs doing on your end."
			actions={
				<Pill href={STATUS_URL} variant="primary" size="lg" disc="launch">
					Live status
				</Pill>
			}
		/>
	);
}
