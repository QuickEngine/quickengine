import { XIcon } from "@phosphor-icons/react";
import { STATUS_URL } from "@quickengine/ui";
import { clientEnv } from "../lib/env";

/**
 * Help, summoned rather than parked.
 *
 * 🔴 This used to be a permanent circle in the bottom corner. Two things were
 * wrong with that: it sat on top of whatever was underneath — it covered the
 * pager at the bottom of a long table — and a console that keeps a help button
 * on screen at all times is quietly saying it expects you to need one.
 *
 * 🔑 Now it is CALLED ON, from Help & Support in the account menu, and stays
 * for the session once opened. That matters more than it sounds: this becomes a
 * chat window, and a chat that closes every time you change page is not a
 * conversation. Session storage is exactly the right lifetime — it survives
 * navigation, and dies when the tab closes or the person signs out.
 *
 * ⚠️ It deliberately does NOT try to answer questions. It points at the docs,
 * offers to send a message, and shows the one thing support will ask for. A
 * help widget pretending to be a search engine is how people end up reading
 * three wrong articles before giving up.
 */

const KEY = "quickdash:help-open";

/** Whether help was left open earlier in this session. */
export function helpWasOpen() {
	try {
		return window.sessionStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

export function rememberHelpOpen(open: boolean) {
	try {
		if (open) window.sessionStorage.setItem(KEY, "1");
		else window.sessionStorage.removeItem(KEY);
	} catch {
		// Private browsing. Help still opens; it just will not be remembered.
	}
}

export function SupportBubble({
	open,
	onClose,
	workspaceName,
}: {
	open: boolean;
	onClose: () => void;
	workspaceName?: string;
	/** Opens the same dialog the account menu uses, rather than a second form. */
}) {
	if (!open) return null;

	const row =
		"flex h-9 w-full items-center rounded-md px-2.5 text-left text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)]";

	return (
		// 🔑 BELOW the detail panels (z-30). Help is available, never the thing
		// you are looking at; floating it over an open product covered the Save
		// button underneath it.
		<div className="fixed right-4 bottom-4 z-20 w-72 rounded-xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-2 shadow-2xl">
			<div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
				<p className="min-w-0 flex-1 text-[12.5px] text-[var(--ink-85)]">
					Help
				</p>
				{workspaceName ? (
					<span className="truncate rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-45)]">
						{workspaceName}
					</span>
				) : null}
				<button
					type="button"
					aria-label="Close help"
					onClick={onClose}
					className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--ink-30)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-85)]"
				>
					<XIcon size={12} />
				</button>
			</div>

			<a href={`${clientEnv.WEB_URL}/docs`} className={row}>
				Read the documentation
			</a>
			{/* 🔴 The account's support page, not the feedback dialog.
			    Feedback is "here is a thought about the product" and goes into a
			    pile. This is "something is wrong and I need a person", which has
			    an actual destination — a form that reaches a human, carries your
			    organisation with it, and takes the request id. Pointing it at
			    feedback quietly turned every support request into a suggestion
			    nobody was waiting on. */}
			<a href={`${clientEnv.ACCOUNT_URL}/support`} className={row}>
				Send us a message
			</a>
			{/* The real status page, not a marketing route that does not exist.
			    `STATUS_URL` is the same constant the error cards link to, so
			    there is one answer to "is it just me". */}
			<a href={STATUS_URL} target="_blank" rel="noreferrer" className={row}>
				Check service status
			</a>

			{/* The thing support asks for first. Shown here so nobody has to be
			    talked through finding it mid-conversation. */}
			<p className="px-2.5 pt-2 pb-1 text-[10.5px] text-[var(--ink-30)] leading-4">
				If something is broken, the request ID shown on the error is the fastest
				way for us to find it.
			</p>
		</div>
	);
}
