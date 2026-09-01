import { useEffect, useState } from "react";

/**
 * The small-screen stop sign.
 *
 * ── Why this BLOCKS rather than warns ────────────────────────────────────────
 *
 * 🔴 A deliberate product decision, and the opposite of what a dismissible bar
 * would do. Every surface was laid out at desktop width first and the narrow
 * passes have not been run, so a phone does not show a rough version of the
 * product — it shows a broken one. Letting somebody in to discover that costs
 * more trust than turning them away, and it generates support load for bugs that
 * are already known.
 *
 * ⚠️ It is therefore NOT dismissible and stores nothing. A "continue anyway"
 * reads as a dare, and the first thing behind it is a layout nobody has checked.
 * This comes out the day the narrow pass lands, not before.
 *
 * It renders on top of the app rather than instead of it, so no route, guard or
 * session is affected, and widening the window removes it immediately.
 */

/**
 * 🔴 1024, not 768. A tablet is not a small desktop — a portrait iPad is 820
 * wide and lands in exactly the range these layouts have never been checked at.
 *
 * ⚠️ Its own constant rather than `useIsMobile`, which is 768 and drives the
 * console's sidebar behaviour. Raising that to block tablets here would collapse
 * navigation on every screen as a side effect.
 */
const DESKTOP_FROM = 1024;

export function MobileNotice() {
	const [narrow, setNarrow] = useState(false);

	useEffect(() => {
		const query = window.matchMedia(`(max-width: ${DESKTOP_FROM - 1}px)`);
		const check = () => setNarrow(query.matches);
		check();
		query.addEventListener("change", check);
		return () => query.removeEventListener("change", check);
	}, []);

	useEffect(() => {
		if (!narrow) return;
		/**
		 * ⚠️ The page behind is locked. Without this the blocked layout still
		 * scrolls under the overlay, which makes it feel like a dialog that failed
		 * to open rather than a wall.
		 */
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [narrow]);

	if (!narrow) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Desktop required"
			style={{
				backgroundColor: "var(--surface)",
				// The brand's ground for full-screen moments, shared with onboarding.
				backgroundImage: "var(--wave)",
				paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
				paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
			}}
			className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
		>
			<div
				style={{
					backgroundColor: "var(--surface-2)",
					borderColor: "var(--line)",
					boxShadow: "0 24px 60px -24px rgb(0 0 0 / 0.45)",
				}}
				className="flex w-full max-w-[23rem] flex-col items-center gap-4 rounded-2xl border px-6 py-7 text-center"
			>
				<div className="space-y-2.5">
					<h1
						style={{ color: "var(--text)" }}
						className="font-medium text-[18px] leading-[1.3]"
					>
						QuickDash needs a bigger screen
					</h1>
					<p
						style={{ color: "var(--text-dim)" }}
						className="text-[13.5px] leading-[1.55]"
					>
						We're still building the phone and tablet experience. Until it's
						ready, open QuickDash on a desktop or laptop and everything will
						work properly.
					</p>
				</div>

				{/* 🔑 Says what to do next, not only what is wrong. Turning somebody
				    away without telling them how to get in is a locked door rather
				    than a closed sign. */}
				<p
					style={{ color: "var(--text-dim)" }}
					className="text-[12px] leading-[1.5] opacity-70"
				>
					Any window wider than 1024 pixels will let you through.
				</p>
			</div>
		</div>
	);
}
