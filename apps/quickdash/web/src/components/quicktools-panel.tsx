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
		/**
		 * 🔑 A WRAPPING grid, not one row.
		 *
		 * One row made the bar's height decoration: dragging it taller bought
		 * empty space rather than more tools. Widgets fill left to right and wrap
		 * onto another row when they run out of width, so sizing the bar IS
		 * choosing how much you want to see — and it scrolls past that rather
		 * than clipping.
		 */
		<div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2 p-2">
			<div className="col-span-full flex items-center justify-center px-6 py-10 text-center">
				<div>
					<p className="text-[12.5px] text-[var(--ink-45)]">No tools yet</p>
					<p className="mt-1 max-w-[28rem] text-[11.5px] text-[var(--ink-30)] leading-[1.5]">
						Widgets drop down here from the header and wrap onto another row
						when they run out of width. The tray owns no space of its own, and
						any single tool can be pulled out to float wherever you want it.
					</p>
				</div>
			</div>
		</div>
	);
}
