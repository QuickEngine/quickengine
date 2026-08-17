import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * The bar across the top of the content.
 *
 * 🔑 Deliberately sparse. It exists so the handful of things somebody reaches
 * for constantly are always in the same place, at the same height, whatever
 * page they are on — not as a second navigation. Everything that belongs to one
 * page stays on that page.
 *
 * The three zones, left to right:
 *
 * 1. **Where you are.** The page's name, so the content below never has to
 *    repeat it as a heading.
 * 2. **Actions.** Whatever this page offers, and nothing it does not.
 *
 * 🔴 NO SEARCH HERE. The sidebar has it and every list has its own. A third
 * entry point does not make anything easier to find — it makes the console
 * look like three different products stacked on top of each other, and leaves
 * somebody wondering which box searches what.
 *
 * ⚠️ Borderless on purpose — see the `header` slot in `ConsoleShell`.
 */

export function WorkspaceHeader({
	title,
	crumb,
	actions,
}: {
	/** The page's name. Absent while a route is still resolving. */
	title?: string;
	/** The record this page has open, if any. */
	crumb?: string | null;
	/** This page's own actions, if it has any. */
	actions?: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-3">
			{/*
			  The trail, not a breadcrumb tree. It goes at most two deep — the page,
			  and the thing open on it — because that is the whole depth this console
			  has. A trail that could grow would invite nesting the layout does not
			  support.

			  🔑 The page name DIMS once a record is open, so the eye lands on the
			  record. It stays visible rather than being replaced, because the panel
			  covers half the screen and it is otherwise easy to forget what is
			  behind it.
			*/}
			<h1 className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
				<span
					className={`shrink-0 truncate ${crumb ? "text-[var(--ink-45)]" : "text-[var(--ink-85)]"}`}
				>
					{title ?? ""}
				</span>
				{crumb ? (
					<>
						<CaretRightIcon
							size={11}
							className="shrink-0 text-[var(--ink-25)]"
						/>
						<span className="min-w-0 truncate text-[var(--ink-85)]">
							{crumb}
						</span>
					</>
				) : null}
			</h1>

			{actions}
		</div>
	);
}
