import { Header } from "@/components/header";

/**
 * What a marketing page looks like while its chunk is still arriving.
 *
 * Replaces `LoadingScreen` from `@quickengine/ui`, which was a pulsing bar and
 * the word "Loading…" centred on void black — the same pre-redesign styling the
 * error pages just left behind, and a full-screen takeover for what is usually a
 * sub-second gap.
 *
 * ⚠️ THIS SHOULD ALMOST NEVER BE SEEN, and that is the design.
 *
 * Three separate things have to fail for it to appear:
 *
 * 1. `defaultPreload: "intent"` fetches a route's chunk on hover or focus, so by
 *    the time a click lands the code is usually already in memory.
 * 2. `defaultPendingMs` holds it back until a navigation has genuinely stalled.
 *    A fast-but-not-instant route must never flash a skeleton — that reads as a
 *    glitch, and it is worse than showing nothing at all.
 * 3. Nothing on this site has a loader. There is no data fetch anywhere in the
 *    marketing app, so the only thing that can be pending is the JavaScript.
 *
 * ⚠️ It is deliberately NOT lazily imported. A loading state that has to be
 * fetched before it can say "loading" needs the network at the exact moment the
 * network is the problem — it would arrive late, or on a dead connection not at
 * all. It is a few hundred bytes of markup in the main bundle, which is the
 * cheaper side of that trade by a wide margin.
 *
 * The header is real, not skeletal. It is already mounted and costs nothing, and
 * keeping it means a slow navigation looks like a page filling in rather than
 * like the site disappearing.
 */

/** One muted block. `motion-reduce` drops the pulse rather than the layout. */
function Bar({ className }: { className: string }) {
	return (
		<div
			className={`animate-pulse rounded-md bg-white/[0.06] motion-reduce:animate-none ${className}`}
		/>
	);
}

export function PageSkeleton() {
	return (
		<div className="relative isolate min-h-dvh bg-black">
			<Header />

			{/* Proportioned to the real pages rather than generic: a display heading
			    over two lines, a short paragraph beneath it, then a row of cards. A
			    skeleton whose shape does not match what follows makes the arrival of
			    the real content look like a second layout change. */}
			<div
				aria-hidden="true"
				className="pt-[calc(var(--header-h)+7rem)] pb-32 site-gutter"
			>
				<Bar className="h-[clamp(1.9rem,4.2vw,3.15rem)] w-[min(100%,32ch)]" />
				<Bar className="mt-4 h-[clamp(1.9rem,4.2vw,3.15rem)] w-[min(100%,24ch)]" />

				<Bar className="mt-10 h-4 w-[min(100%,46ch)]" />
				<Bar className="mt-3 h-4 w-[min(100%,38ch)]" />

				<div className="mt-16 grid gap-4 md:grid-cols-3">
					<Bar className="h-44" />
					<Bar className="h-44" />
					<Bar className="h-44" />
				</div>
			</div>

			{/* The only thing here a screen reader should get. The blocks above are
			    decoration and are hidden from it entirely. */}
			<span role="status" aria-live="polite" className="sr-only">
				Loading
			</span>
		</div>
	);
}
