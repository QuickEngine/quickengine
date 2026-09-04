import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { inlineFailure } from "./page-state";

/**
 * The shell every detail panel wears.
 *
 * 🔴 Extracted after four panels drifted apart — three widths between them, and
 * a header that differed in each. Consistency by CONVENTION means every new
 * panel is a fresh chance to get it wrong; consistency by CONSTRUCTION means a
 * new one cannot. Nothing here is configurable that should not be.
 *
 * 🔑 Half the window, floored at 24rem and now CAPPED at 36rem. Wide enough to
 * edit in without the list behind it becoming useless, since moving between
 * records is the whole reason these are panels rather than pages.
 *
 * 🔴 The cap is the part that was missing. Half a window with no ceiling is a
 * 900px column on a wide monitor, holding label-and-value rows: the lines run
 * long enough to be tiring, the right half of every row is empty, and the list
 * behind it gets squeezed for space nothing is using. A reading column wants
 * roughly this width whatever the screen is doing.
 */

/**
 * The floating card every detail panel wears.
 *
 * 🔴 Exported because four panels were written before this shell existed and
 * still carry their own markup. One string they all share is the difference
 * between changing the shape once and changing it four times — which is how
 * three different widths appeared in the first place.
 */
/**
 * 🔴 `--console-pop` and no border, the same as every other floating thing.
 *
 * It was painted `--console-panel`, which IS the outlet: a card the colour of
 * the ground it sits on cannot look like it is above that ground, whatever
 * shadow you give it, and no amount of tuning the elevation was ever going to
 * fix it. That is why this panel stayed flat while the popovers around it
 * gained depth. The hairline goes for the reason it went on those: an outline
 * around a floating card reads as a sticker, and the shadow plus a lighter face
 * already say everything the border was trying to.
 */
export const detailCard =
	"fixed top-3 right-3 bottom-3 z-30 flex w-[calc(50%-0.75rem)] min-w-[24rem] max-w-[min(36rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border-0 bg-[var(--console-pop)] lift-sheet";

export function DetailPanel({
	title,
	subtitle,
	onClose,
	notice,
	actions,
	footer,
	children,
}: {
	title: string;
	/** The one line of context worth carrying in the header. Status, total, count. */
	subtitle?: ReactNode;
	onClose: () => void;
	/**
	 * Something that went wrong with this record, directly under the header.
	 *
	 * 🔴 NOT beside the Save button, where it started. A failure squeezed onto
	 * the footer row competes with the one control you want somebody to press,
	 * gets clipped by the panel's width, and sits at the bottom of a form they
	 * may have scrolled away from — so a save could fail with the message off
	 * screen entirely. Under the title it is the first thing read on the way
	 * back to the fields, which is where the problem actually is.
	 */
	notice?: ReactNode;
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
			{/* 🔴 A tinted STRIP, not a bare rule, and that distinction is the whole
			    fix. A hairline drawn across a flat sheet chops the card into three
			    pieces, which is why the dividers looked wrong. The same line under a
			    filled band is not a divider at all: it is the edge of the band, and
			    it is exactly how every table in this console is built. So the panel
			    is constructed like one. A record is the same material as the list it
			    came out of, and it should look like it.

			    ⚠️ The band, WITHOUT the line under it. A table draws that edge; this
			    panel does not, because a rule anywhere on this card reads as the
			    card being cut up. The change in surface is enough to separate the
			    title from what it titles. */}
			<header className="flex shrink-0 items-start gap-3 bg-[rgb(var(--console-ink)/0.02)] px-4 py-3">
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
					/* A key, and rectangular. It was the pill shape the whole console
					   left behind, sitting in the corner of the one surface people spend
					   the most time in front of. */
					className="control-raised flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11px] text-[var(--ink-60)] outline-none hover:text-[var(--ink-90)]"
				>
					Close
				</button>
			</header>

			{notice ? <div className="shrink-0 px-4 pt-3">{notice}</div> : null}

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				{actions ? (
					<div className="mb-3 flex flex-wrap items-center gap-1.5">
						{actions}
					</div>
				) : null}
				{children}
			</div>

			{footer ? (
				/* The header's strip, the other way up. */
				<footer className="shrink-0 bg-[rgb(var(--console-ink)/0.02)] px-4 py-3">
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
		/* 🔴 A ROW, label left and value right, the shape a table row already has.
		   It used to stack the label above the value, on the reasoning that values
		   vary wildly in length and a two-column grid wraps badly. That is true of
		   a GRID, where every column must agree on a width; it is not true here,
		   because the label column is fixed and the value simply wraps within its
		   own half. What the stack cost was rhythm: a column of little
		   two-line blocks that reads as a form somebody abandoned rather than as a
		   record you can scan down. */
		<div className="flex min-w-0 items-baseline gap-4 py-1">
			<p className="w-28 shrink-0 text-[11.5px] text-[var(--ink-35)]">
				{label}
			</p>
			<div className="min-w-0 flex-1 text-[12.5px] text-[var(--ink-85)] leading-5">
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
		<section className="py-3">
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

/**
 * A block inside a panel whose request failed.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Panels do not go through `PageState`, and every block inside one was
 * written as `isPending ? "Loading…" : data.map(...)`. That ternary has no
 * failure arm, so a block whose request failed showed **"Loading…" forever** —
 * arguably the worst state in the product, because it is indistinguishable from
 * a slow network and so nobody ever reports it as a bug.
 *
 * ⚠️ Reported INSIDE the block, never as a takeover. One block failing does not
 * invalidate the record: a customer whose addresses did not load still has a
 * name, an email and an order history worth reading.
 */
export function BlockFailure({ query }: { query: UseQueryResult<unknown> }) {
	return (
		<div role="alert" className="space-y-1.5">
			<p className="text-[11.5px] text-[var(--ink-45)]">
				{inlineFailure(query.error)}
			</p>
			<button
				type="button"
				onClick={() => {
					void query.refetch();
				}}
				className="text-[11px] text-[var(--ink-50)] underline underline-offset-2 transition-colors hover:text-[var(--ink-90)]"
			>
				Try again
			</button>
		</div>
	);
}
