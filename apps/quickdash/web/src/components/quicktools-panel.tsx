/**
 * QuickTools, across the bottom of the console.
 *
 * 🔴 SHELL ONLY, and it says so on screen. No widget exists yet — this is the
 * surface they will sit on, built first so the shape can be lived with before
 * anything is written into it. A row of fake tiles would look further along than
 * it is and invite decisions about tools nobody has designed.
 *
 * ⚠️ NO HEADER. A title bar would spend a fifth of the height restating what the
 * button that opened it already said, and that same button closes it. When tools
 * arrive they fill this space as a single horizontal strip: this is a BAR, and a
 * bar that wraps to two rows is a panel that has outgrown its position.
 */
export function QuickToolsPanel() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
				<div>
					<p className="text-[12.5px] text-[var(--ink-45)]">No tools yet</p>
					<p className="mt-1 max-w-[28rem] text-[11.5px] text-[var(--ink-30)] leading-[1.5]">
						This is the surface QuickTools will sit on. Widgets go here as a
						single row, so the bar keeps one height whatever is in it.
					</p>
				</div>
			</div>
		</div>
	);
}
