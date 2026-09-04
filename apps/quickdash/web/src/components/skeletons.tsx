/**
 * Placeholders shaped like the thing that is coming.
 *
 * 🔑 Every one of these mirrors a real layout — a list row, a panel, a page.
 * That is the entire point: a placeholder the same size as its content means
 * nothing moves when the content arrives. A centred spinner guarantees the
 * opposite, because the page reflows the instant it disappears.
 *
 * The `shimmer` class is defined once in `styles.css`, including the
 * reduced-motion opt-out.
 */

/** One bar. Width is a Tailwind class so callers can shape a row honestly. */
function Bar({ className }: { className: string }) {
	return <div className={`shimmer rounded-md ${className}`} />;
}

/**
 * A list page waiting for its first answer.
 *
 * Rows deliberately vary in width. Identical bars read as a pattern rather than
 * as content, and the eye stops believing anything is coming.
 */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
	const widths = [
		"w-[42%]",
		"w-[58%]",
		"w-[35%]",
		"w-[64%]",
		"w-[47%]",
		"w-[52%]",
		"w-[39%]",
		"w-[61%]",
	];
	// Keyed by the width itself rather than by position: these are decorative
	// and never reorder, and a stable string key keeps the linter honest without
	// inventing an id for something that has no identity.
	const shown = widths.slice(0, Math.max(1, Math.min(rows, widths.length)));
	return (
		<div role="status" aria-label="Loading" className="">
			{shown.map((width) => (
				<div key={width} className="flex items-center gap-3 py-3">
					<Bar className={`h-3 ${width}`} />
					<div className="flex-1" />
					<Bar className="h-3 w-16" />
					<Bar className="h-3 w-20" />
				</div>
			))}
		</div>
	);
}

/** A side panel waiting: a heading, a couple of lines, then a block. */
export function SkeletonPanel() {
	return (
		<div role="status" aria-label="Loading" className="space-y-3">
			<Bar className="h-4 w-40" />
			<Bar className="h-3 w-24" />
			<div className="space-y-2 pt-2">
				<Bar className="h-3 w-full" />
				<Bar className="h-3 w-[85%]" />
				<Bar className="h-3 w-[60%]" />
			</div>
			<Bar className="mt-3 h-24 w-full" />
		</div>
	);
}

/**
 * A whole surface waiting, before any layout is known.
 *
 * 🔑 The parallelogram, used only here. Where a skeleton can mirror real
 * content it should; this is for the moment when even that is unknown, so it
 * says "waiting" without pretending to predict a shape.
 */
export function SkeletonScreen() {
	return (
		<main className="flex h-svh items-center justify-center bg-[var(--console-bg)]">
			<div
				role="status"
				aria-label="Loading"
				className="shimmer h-10 w-40 rounded-md"
				style={{ transform: "skewX(-12deg)" }}
			/>
		</main>
	);
}
