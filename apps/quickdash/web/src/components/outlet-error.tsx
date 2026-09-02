import { presentRequestError } from "@quickengine/ui";
import { Link } from "@tanstack/react-router";

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
 */

const primary =
	"inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-90";
const quiet =
	"inline-flex h-8 items-center rounded-md border border-[var(--console-line-strong)] px-3 text-[12px] text-[var(--ink-60)] no-underline transition-colors hover:text-[var(--ink-90)]";

function Wall({
	code,
	title,
	detail,
	action,
}: {
	code: string;
	title: string;
	detail: string;
	action: React.ReactNode;
}) {
	return (
		<main className="flex min-h-full items-center justify-center bg-[var(--console-bg)] px-5 py-16">
			<div className="max-w-[26rem] text-center">
				<p className="font-mono text-[11px] text-[var(--ink-25)] uppercase tracking-[0.14em]">
					{code}
				</p>
				<p className="mt-2 text-[15px] text-[var(--ink-90)]">{title}</p>
				<p className="mt-2 text-[12px] text-[var(--ink-40)] leading-[1.6]">
					{detail}
				</p>
				<div className="mt-5 flex items-center justify-center gap-2">
					{action}
				</div>
			</div>
		</main>
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
	return (
		<Wall
			code={it.code}
			title={it.title}
			detail={it.message}
			action={
				<button type="button" onClick={reset} className={primary}>
					Try again
				</button>
			}
		/>
	);
}

export function OutletNotFound() {
	return (
		<Wall
			code="404"
			title="That page does not exist"
			detail="The address may have changed, or the record it pointed at has been removed. Everything else in this workspace is still where you left it."
			action={
				<Link to="/" className={quiet}>
					Back to Home
				</Link>
			}
		/>
	);
}
