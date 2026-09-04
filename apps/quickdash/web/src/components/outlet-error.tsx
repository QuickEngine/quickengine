import { ArrowClockwiseIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { presentRequestError, STATUS_URL } from "@quickengine/ui";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ContactSupport } from "./error-actions";

/**
 * A failure inside the console, not instead of it.
 *
 * 🔴 The root's `errorComponent` sits ABOVE the shell, so anything it catches
 * replaces the whole window — sidebar, header, search, everything — for a fault
 * on one page. You cannot navigate away from a page that will not load, which
 * is exactly the moment you want to.
 *
 * 🔑 Declaring boundaries on the workspace's CHILD routes is what fixes it. A
 * child's error bubbles to the nearest boundary, so the shell stays mounted and
 * only the outlet shows the failure. The root's screens remain for what they
 * are actually for: a fault before any workspace is known.
 *
 * ── What this screen owes the reader ─────────────────────────────────────────
 *
 * 🔴 It used to be a code, a sentence and one button — and it THREW AWAY the
 * two most useful things it was handed. `presentRequestError` returns a `kind`
 * and a `requestId`; the wall rendered neither. So every failure looked
 * identical whether the API was unreachable, the role lacked permission, or
 * the request was simply refused, and the one string that lets somebody trace
 * what happened was discarded on the floor.
 *
 * Now the kind picks the icon, the colour and the way out, and a request id is
 * shown and copyable — it is the key to `/v1/requests/{id}`, which is how a
 * fault stops being a mystery.
 */

/**
 * 🔴 Both are KEYS, and the primary is not a fill.
 *
 * An error card is the one screen somebody reads carefully, and it was the last
 * one still wearing the first pass: an off white slab for "Try again" and a
 * flat bordered rectangle beside it, on a console where every other button is a
 * raised face. Weight separates them now, the same way it separates a chosen
 * tab from an unchosen one, and neither has to invert to be found.
 */
const primary =
	"control-raised inline-flex h-8 items-center rounded-md border border-[var(--console-line-strong)] px-3 font-medium text-[12px] text-[var(--ink-90)] outline-none";
const quiet =
	"control-raised inline-flex h-8 items-center rounded-md border px-3 text-[12px] text-[var(--ink-55)] no-underline outline-none hover:text-[var(--ink-90)]";

/**
 * The request id, and a one-press way to hand it to somebody.
 *
 * 🔴 Shown, not hidden in a console log. It is the only durable handle on a
 * failure that has already happened: it resolves to a full trace, and asking a
 * customer to reproduce a fault so support can watch it is asking them to have
 * the bad day twice.
 */
export function RequestId({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				// ⚠️ Clipboard access is refused in some contexts and rejects rather
				// than throwing. A failed copy must leave the id on screen to be read
				// by eye, never break the error page it is sitting on.
				void navigator.clipboard
					?.writeText(id)
					.then(() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1600);
					})
					.catch(() => undefined);
			}}
			data-hint="Copy the request ID"
			className="mt-5 flex w-full items-center gap-2 rounded-md border border-[var(--console-line)] bg-[var(--console-bg)] px-2.5 py-2 text-left transition-colors hover:border-[var(--console-line-strong)]"
		>
			<span className="text-[9.5px] text-[var(--ink-25)] uppercase tracking-[0.1em]">
				Request
			</span>
			<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-55)] tabular-nums">
				{id}
			</span>
			{copied ? (
				<CheckIcon size={13} className="text-[var(--signal-success-text)]" />
			) : (
				<CopyIcon size={13} className="text-[var(--ink-30)]" />
			)}
		</button>
	);
}

/**
 * The card itself, without the screen around it.
 *
 * 🔴 Exported so there is ONE error card in this console, not two. The route
 * boundary and a failed query were drawing entirely different things for the
 * same fault: the boundary got a designed card, and the failure you actually
 * meet in normal use — a query that did not come back — got an older block that
 * nobody had looked at in months. Same fault, two faces, and the wrong one was
 * the common one.
 */
export function ErrorCard({
	title,
	detail,
	requestId,
	children,
	action,
}: {
	title: string;
	detail: string;
	requestId?: string | null;
	/** An extra line under the message, when the kind has something to add. */
	children?: React.ReactNode;
	action: React.ReactNode;
}) {
	/* Left-aligned inside a card, rather than centred text on the bare floor.
	   Centred prose reads as a marketing page; an operator wants this to look
	   like a panel reporting a fact. */
	return (
		<div
			/* 🔴 `--lift-card` and `--surface-tile`, the console's real relief, set
			   INLINE. Two problems in one line: it was on `--card-lift`, the
			   original 2px drop every other surface has left behind, and it was
			   written as a Tailwind arbitrary `shadow-[var(…)]`, which does not
			   reliably emit — so the card may well have been casting nothing at
			   all. Every working raised surface in this console sets `boxShadow`
			   as a style for exactly that reason. */
			style={{ boxShadow: "var(--lift-card)" }}
			className="w-full max-w-[27rem] overflow-hidden rounded-xl bg-[var(--surface-tile)] p-6"
		>
			{/* 🔑 The status sits IN the headline, not in a chip above it.
				    An icon tile with the number tucked underneath made the code
				    decorative — the one thing everybody reads first, shrunk to a
				    caption. Inline, it is the subject of the sentence: "404, that
				    page does not exist."

				    ⚠️ Deliberately the SAME ink as the words beside it. A tinted
				    number reads as a status light and pulls the eye away from the
				    sentence it belongs to; here it is a word in that sentence. */}
			<p className="text-[19px] text-[var(--ink-90)] leading-6">{title}</p>
			<p className="mt-2 text-[12px] text-[var(--ink-45)] leading-[1.65]">
				{detail}
			</p>
			{children}
			{requestId ? <RequestId id={requestId} /> : null}
			<div className="mt-5 flex flex-wrap items-center gap-2">
				{action}
				{/* 🔑 The instruction becomes a DESTINATION.
				    Every one of these screens says to quote the request id, and
				    until now that was where the sentence stopped: no link, and
				    thirty-six characters to carry by hand to a page you had to
				    go and find. This opens support with the id already in the
				    message. It appears only when there IS an id — a render
				    crash has none, and offering support with nothing to quote
				    just moves the dead end. */}
				{requestId ? <ContactSupport requestId={requestId} /> : null}
			</div>
		</div>
	);
}

/**
 * The card, centred in whatever space the outlet gives it.
 *
 * Used when the failure IS the page — a route that could not load at all.
 * A failed query inside a working page renders `ErrorCard` directly instead,
 * where the list would have been.
 */
/**
 * The same id, sized for a row rather than a card.
 *
 * 🔴 MANDATORY wherever a request id is shown. An id you cannot copy is an id
 * you have to transcribe — thirty-six characters of hex, by eye, into a support
 * message. People get it wrong, and a wrong id is worse than none: it sends
 * somebody to look at a request that is not yours.
 *
 * ⚠️ So the rule is: if a surface prints a request id, it prints this. There is
 * no version of "just show the text".
 */
export function RequestIdInline({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			data-hint="Copy the request ID"
			aria-label="Copy the request ID"
			onClick={() => {
				// Clipboard access is refused in some contexts and REJECTS rather
				// than throwing. A failed copy must leave the id on screen to read
				// by eye, never break the error line it is sitting in.
				void navigator.clipboard
					?.writeText(id)
					.then(() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1600);
					})
					.catch(() => undefined);
			}}
			/* ⚠️ `max-w-full` and truncating rather than hidden below a breakpoint.
			   It used to disappear under `md`, which keys off the VIEWPORT and not
			   the space it actually has — so on a wide screen it showed inside a
			   240px dashboard tile and overflowed, and on a narrow one it vanished
			   from a full-width error card where there was plenty of room. */
			className="flex max-w-full shrink items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-[10.5px] text-[var(--ink-25)] tabular-nums transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-60)]"
		>
			{id}
			{copied ? (
				<CheckIcon size={11} className="text-[var(--signal-success-text)]" />
			) : (
				<CopyIcon size={11} />
			)}
		</button>
	);
}

function Wall(props: Parameters<typeof ErrorCard>[0]) {
	return (
		<main className="flex min-h-full items-center justify-center bg-[var(--console-bg)] px-5 py-16">
			<ErrorCard {...props} />
		</main>
	);
}

/** Back to this workspace's home — never to `/`, which leaves the workspace. */
function HomeLink({ workspace }: { workspace: string | undefined }) {
	if (!workspace) {
		return (
			<Link to="/" className={quiet}>
				Back to Home
			</Link>
		);
	}
	return (
		<Link to="/$workspace" params={{ workspace }} className={quiet}>
			Back to Home
		</Link>
	);
}

export function OutletError({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	const it = presentRequestError(error);
	const { workspace } = useParams({ strict: false });
	return (
		<Wall
			title={it.title}
			detail={it.message}
			requestId={it.requestId}
			action={
				<>
					{/* ⚠️ "Try again" is pointless for the kinds that will refuse
					    identically a second later. Offering it there teaches people
					    that the button does nothing. */}
					{it.kind === "permission" ||
					it.kind === "not-found" ||
					it.kind === "plan-limit" ? null : (
						<button type="button" onClick={reset} className={primary}>
							<ArrowClockwiseIcon size={13} className="mr-1.5" />
							Try again
						</button>
					)}
					<HomeLink workspace={workspace} />
					{/* A fault that is ours to fix, said plainly. If the API is down
					    there is nothing to retry into, and the status page is the only
					    page that can actually answer "is it just me". */}
					{it.kind === "network" || it.kind === "server" ? (
						<a
							href={STATUS_URL}
							target="_blank"
							rel="noreferrer"
							className={quiet}
						>
							Service status
						</a>
					) : null}
				</>
			}
		/>
	);
}

export function OutletNotFound() {
	/**
	 * 🔴 Back to THIS workspace, not to `/`.
	 *
	 * The link pointed at the root, so the recovery from a mistyped address was
	 * being thrown out of the workspace you were standing in — and if you own
	 * several, back to a chooser. `strict: false` because this component renders
	 * under a dozen different routes and must not care which.
	 */
	const { workspace } = useParams({ strict: false });
	const { pathname } = useLocation();
	return (
		<Wall
			title="That page does not exist"
			detail="The address may have changed, or the record it pointed at has been removed. Everything else in this workspace is still where you left it."
			action={<HomeLink workspace={workspace} />}
		>
			{/* 🔑 Showing the address is the difference between "something is
			    broken" and "I typed that wrong". Nine times in ten a 404 in a
			    console is a stale bookmark or a typo, and the reader can only see
			    which if the thing they asked for is in front of them. */}
			<p className="mt-4 truncate rounded-md border border-[var(--console-line)] bg-[var(--console-bg)] px-2.5 py-2 font-mono text-[11px] text-[var(--ink-40)]">
				{pathname}
			</p>
			<p className="mt-3 text-[11px] text-[var(--ink-30)] leading-4">
				Press{" "}
				<kbd className="rounded border border-[var(--console-line-strong)] px-1 py-0.5 font-mono text-[10px] text-[var(--ink-50)]">
					⌘K
				</kbd>{" "}
				to search this workspace for what you were looking for.
			</p>
		</Wall>
	);
}
