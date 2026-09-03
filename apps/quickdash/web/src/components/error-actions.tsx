import { useNavigate, useParams } from "@tanstack/react-router";
import { clientEnv } from "../lib/env";

/**
 * The two actions every error screen offers, wired to actually do them.
 *
 * 🔴 Both used to be lies of a small kind. "Go back" was `history.back()`,
 * which walks one step into whatever you were doing before — frequently the
 * page that just failed, occasionally another site entirely, and on a fresh tab
 * nowhere at all. And "quote the request ID" named no destination: you copied
 * thirty-six characters and then had to go and find where to put them.
 */

/**
 * Back to somewhere that works.
 *
 * ⚠️ `history.back()` ONLY when there is in-app history to go back to.
 * `history.length <= 1` means this tab opened straight onto the failure — a
 * bookmark, a link from an email — and there is nothing behind it. Falling
 * through to the workspace is the difference between a button that works and
 * one that appears to do nothing.
 */
export function GoBack({ label = "Go back" }: { label?: string }) {
	const navigate = useNavigate();
	const { workspace } = useParams({ strict: false });
	return (
		<button
			type="button"
			onClick={() => {
				if (window.history.length > 1) {
					window.history.back();
					return;
				}
				void navigate(
					workspace
						? { to: "/$workspace", params: { workspace } }
						: { to: "/" },
				);
			}}
			className="inline-flex h-8 items-center rounded-md border border-[var(--console-line-strong)] px-3 text-[12px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
		>
			{label}
		</button>
	);
}

/**
 * Hand the request id to support rather than asking somebody to carry it.
 *
 * The support form reads `?requestId=` and opens with it already in the
 * message, so the instruction "quote the request ID" is now something the
 * console does instead of something it asks for.
 */
export function ContactSupport({ requestId }: { requestId: string }) {
	return (
		<a
			href={`${clientEnv.ACCOUNT_URL}/support?requestId=${encodeURIComponent(requestId)}`}
			className="inline-flex h-8 items-center rounded-md px-3 text-[12px] text-[var(--ink-45)] no-underline transition-colors hover:bg-[rgb(var(--console-ink)/0.05)] hover:text-[var(--ink-85)]"
		>
			Contact support
		</a>
	);
}
