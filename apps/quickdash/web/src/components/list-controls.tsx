import { FunnelIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import type { ReactNode } from "react";
import { usePageTakenOver } from "./header-action";

/**
 * The bar above every list: search, filter, and the page's one create action.
 *
 * 🔑 Written once because twenty-nine pages each building their own produces
 * twenty-nine slightly different bars — a search box that sits a pixel lower
 * here, a filter that opens from the wrong edge there. Consistency across a
 * console is not decoration: it is what lets somebody move between Orders and
 * Reviews without re-learning where anything is.
 *
 * ⚠️ The filter popover is anchored to the whole control GROUP, not to the
 * filter button, so it spans from that button's left edge to the right edge of
 * the create action. `--radix-popover-trigger-width` measures the anchor, which
 * keeps that span exact as labels change.
 */
export function ListControls({
	query,
	onQueryChange,
	placeholder,
	filterCount,
	filter,
	action,
}: {
	query: string;
	onQueryChange: (value: string) => void;
	placeholder: string;
	/** Shown on the filter button so an active filter is never invisible. */
	filterCount?: number;
	/** Filter controls. Omit entirely when a page has nothing to filter by. */
	filter?: ReactNode;
	/** The one create action, if the page has one. */
	action?: ReactNode;
}) {
	/**
	 * 🔴 Nothing to search, so nothing to search with.
	 *
	 * When the page itself has no content to operate on — it does not exist, you
	 * cannot see it, or the module is switched off — a search box, filter pills
	 * and a table/card toggle are controls over nothing. They would accept input
	 * and do nothing with it, which reads as a broken console rather than an
	 * unavailable page.
	 *
	 * ⚠️ A list that merely failed to LOAD keeps every control: the filters still
	 * describe exactly what pressing "Try again" would fetch.
	 */
	if (usePageTakenOver()) return null;

	return (
		<div className="mb-3 flex items-center gap-2">
			<div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
				<MagnifyingGlassIcon
					size={14}
					className="shrink-0 text-[var(--ink-30)]"
				/>
				<input
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder={placeholder}
					className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
				/>
			</div>

			{filter ? (
				<Popover>
					<PopoverAnchor asChild>
						<div className="flex shrink-0 items-center gap-2">
							<PopoverTrigger className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 text-[12.5px] text-[var(--ink-50)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:text-[var(--ink-85)]">
								<FunnelIcon size={14} />
								Filter
								{filterCount ? (
									<span className="rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)]">
										{filterCount}
									</span>
								) : null}
							</PopoverTrigger>
							{action}
						</div>
					</PopoverAnchor>
					<PopoverContent
						// Right-aligned so its edge meets the page's right margin, which
						// is where the control group ends. Opening from the left edge left
						// it floating short of the margin on every page.
						align="end"
						sideOffset={8}
						/**
						 * 🔴 A FLOOR on the width, not just the anchor's.
						 *
						 * `--radix-popover-trigger-width` measures the control group, which
						 * is the filter button ALONE on a page with no create action — so
						 * those pages opened a popover barely wider than the word "Filter"
						 * and wrapped every chip onto its own line. Matching the group is
						 * right when the group is wide; below that the content decides.
						 */
						className="w-[max(var(--radix-popover-trigger-width),18rem)] rounded-2xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-3"
					>
						{filter}
					</PopoverContent>
				</Popover>
			) : (
				action
			)}
		</div>
	);
}

/**
 * One filter value, on or off.
 *
 * A row of these rather than a dropdown: the options are few and always worth
 * seeing at once, and QuickDash never uses an operating system's own menus.
 */
export function FilterChip({
	label,
	active,
	onToggle,
}: {
	label: string;
	active: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={`h-7 rounded-full border px-3 text-[11px] capitalize transition-colors ${
				active
					? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
					: "border-[var(--console-line-strong)] text-[var(--ink-60)] hover:text-[var(--ink-90)]"
			}`}
		>
			{label}
		</button>
	);
}
