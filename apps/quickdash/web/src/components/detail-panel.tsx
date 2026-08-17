import type { ReactNode } from "react";

/**
 * The shell every detail panel wears.
 *
 * 🔴 Extracted after four panels drifted apart — three widths between them, and
 * a header that differed in each. Consistency by CONVENTION means every new
 * panel is a fresh chance to get it wrong; consistency by CONSTRUCTION means a
 * new one cannot. Nothing here is configurable that should not be.
 *
 * 🔑 Half the window, floored at 24rem. Wide enough to edit in without the list
 * behind it becoming useless — moving between records is the whole reason these
 * are panels rather than pages.
 */

/**
 * The floating card every detail panel wears.
 *
 * 🔴 Exported because four panels were written before this shell existed and
 * still carry their own markup. One string they all share is the difference
 * between changing the shape once and changing it four times — which is how
 * three different widths appeared in the first place.
 */
export const detailCard =
	"fixed top-3 right-3 bottom-3 z-30 flex w-[calc(50%-0.75rem)] min-w-[24rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--console-line-strong)] bg-[var(--console-panel)] shadow-[0_24px_60px_rgb(0_0_0/0.45)]";

export function DetailPanel({
	title,
	subtitle,
	onClose,
	actions,
	footer,
	children,
}: {
	title: string;
	/** The one line of context worth carrying in the header. Status, total, count. */
	subtitle?: ReactNode;
	onClose: () => void;
	/** Lifecycle moves, shown under the header. Not the primary commit. */
	actions?: ReactNode;
	/** The primary commit, pinned so it never scrolls out of reach. */
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<aside
			/**
			 * 🔑 A DETACHED card, not a wall welded to the edge of the window.
			 *
			 * Inset on all four sides with a full border and a shadow, so it reads
			 * as something laid ON TOP of the page that can be put down again —
			 * which is what it is. Flush against the edge it read as a permanent
			 * second column, and a record you are only glancing at should not look
			 * like part of the furniture.
			 *
			 * ⚠️ The width is `calc(50% - inset)` rather than `w-1/2`. With an inset
			 * of its own, a plain half-width card would sit 12px further left than
			 * the halfway line — this keeps its left edge exactly where the
			 * attached panel's was.
			 */
			className={detailCard}
		>
			<header className="flex items-start gap-3 border-[var(--console-line-soft)] border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-[12.5px] text-[var(--ink-85)]">{title}</p>
					{subtitle ? (
						<p className="truncate text-[11px] text-[var(--ink-30)]">
							{subtitle}
						</p>
					) : null}
				</div>
				<button
					type="button"
					onClick={onClose}
					className="h-7 shrink-0 rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
				>
					Close
				</button>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				{actions ? (
					<div className="mb-3 flex flex-wrap items-center gap-1.5">
						{actions}
					</div>
				) : null}
				{children}
			</div>

			{footer ? (
				<footer className="shrink-0 border-[var(--console-line-soft)] border-t px-4 py-3">
					{footer}
				</footer>
			) : null}
		</aside>
	);
}

/**
 * A labelled fact. The unit detail panels are mostly made of.
 *
 * Label above value rather than beside it: values vary wildly in length —
 * a postcode against a delivery note — and a two-column grid either wraps
 * badly or wastes half the panel.
 */
export function Fact({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0">
			<p className="text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
				{label}
			</p>
			<div className="mt-0.5 text-[12.5px] text-[var(--ink-85)] leading-5">
				{children}
			</div>
		</div>
	);
}

/** A titled block within a panel. Plain, because panels stack many of them. */
export function Block({
	title,
	children,
	aside,
}: {
	title: string;
	children: ReactNode;
	/** A count or status that belongs on the title's line. */
	aside?: ReactNode;
}) {
	return (
		<section className="border-[var(--console-line-soft)] border-t py-3">
			<div className="mb-2 flex items-center gap-2">
				<p className="min-w-0 flex-1 text-[11px] text-[var(--ink-45)] uppercase tracking-[0.1em]">
					{title}
				</p>
				{aside ? (
					<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
						{aside}
					</span>
				) : null}
			</div>
			{children}
		</section>
	);
}

/** Nothing to show inside a block — quieter than a page-level empty state. */
export function BlockEmpty({ children }: { children: string }) {
	return <p className="text-[11.5px] text-[var(--ink-30)]">{children}</p>;
}
