import { CopyIcon } from "@phosphor-icons/react";
import { useSession } from "@quickengine/auth/client";
import { STATUS_URL, StatusIndicator } from "@quickengine/ui";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useActiveOrganization } from "../lib/account-api";
import { api } from "../lib/api";
import { clientEnv } from "../lib/env";

/**
 * Help & Support.
 *
 * 🔑 There is no support tier, no ticket queue and no chatbot. Two people wrote
 * this product and one of them answers. Pretending otherwise — a help centre of
 * six cards that all link to the same docs page — was already tried and removed,
 * so this page offers the one thing that actually works: a message that reaches
 * them, with the details that save a round trip already attached.
 */

const SUPPORT_EMAIL = "quickenginesw@gmail.com";

const TOPICS = [
	"Something is broken",
	"Billing or plan",
	"Account or access",
	"How do I…",
] as const;

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const chip =
	"h-8 rounded-full px-3 text-[11.5px] outline-none transition-colors";

const field =
	"w-full rounded-xl border border-[var(--console-line-strong)] bg-transparent px-3.5 py-2.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

function SupportPage() {
	const { data: session } = useSession();
	const { active } = useActiveOrganization();
	const [topic, setTopic] = useState<string>(TOPICS[0]);
	/**
	 * 🔑 Prefilled from `?requestId=`, so the console can HAND OVER the id
	 * instead of asking somebody to copy it, find this page, and paste it back.
	 *
	 * Every error screen tells you to quote the request id. Until now that was
	 * the end of the instruction: no link, no destination, and a thirty-six
	 * character string to carry by hand. The one that arrives here is already
	 * in the box.
	 */
	const requestId = Route.useSearch().requestId;
	const [message, setMessage] = useState(
		requestId ? `Request ID: ${requestId}\n\n` : "",
	);
	const [copied, setCopied] = useState(false);

	const send = useMutation({
		mutationFn: async () =>
			api.request("/contact", {
				method: "POST",
				body: {
					name: session?.user?.name ?? session?.user?.email ?? "Customer",
					email: session?.user?.email ?? "",
					// The organization travels with the message so nobody has to ask
					// "which account is this?" as their first reply.
					topic: `Support · ${topic}${active?.name ? ` · ${active.name}` : ""}`,
					message,
					website: "",
				},
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
				<div>
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
						Send us a message
					</p>
					<p className="max-w-xl text-[11.5px] text-[var(--ink-30)] leading-5">
						It reaches the two people who wrote the code. We answer everything,
						usually within a day.
					</p>

					{send.isSuccess ? (
						<div className="mt-5 rounded-lg border border-[var(--signal-success)]/25 bg-[var(--signal-success)]/[0.06] p-4">
							<p className="text-[12.5px] text-[var(--signal-success-text)]">
								Message sent.
							</p>
							<p className="mt-1.5 text-[11.5px] text-[var(--ink-40)] leading-5">
								We will reply to {session?.user?.email}. If it is urgent, email{" "}
								{SUPPORT_EMAIL} directly.
							</p>
						</div>
					) : (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								if (message.trim().length >= 10) send.mutate();
							}}
							className="mt-4 max-w-xl"
						>
							<div className="flex flex-wrap gap-1.5">
								{TOPICS.map((option) => (
									<button
										key={option}
										type="button"
										aria-pressed={topic === option}
										onClick={() => setTopic(option)}
										className={`${chip} ${
											topic === option
												? "bg-[rgb(var(--console-ink)/0.08)] text-[var(--ink-85)]"
												: "border border-[var(--console-line-strong)] text-[var(--ink-45)] hover:text-[var(--ink-80)]"
										}`}
									>
										{option}
									</button>
								))}
							</div>

							<textarea
								value={message}
								onChange={(event) => setMessage(event.target.value)}
								rows={7}
								placeholder="What were you doing, and what happened instead?"
								aria-label="Your message"
								className={`${field} mt-3 resize-y`}
							/>

							{/* The two details that save an entire round trip. */}
							<p className="mt-2 text-[11px] text-[var(--ink-30)] leading-5">
								If it involves a specific record, include the workspace and the
								identifier. If you saw an error, the request ID beside it points
								straight at what happened.
							</p>

							{send.isError ? (
								<p className="mt-3 text-[12px] text-[var(--signal-failure-text)]">
									{(send.error as { message?: string })?.message ??
										`That did not send. Email ${SUPPORT_EMAIL} instead.`}
								</p>
							) : null}

							<button
								type="submit"
								disabled={message.trim().length < 10 || send.isPending}
								className={`${primaryAction} mt-4`}
							>
								{send.isPending ? "Sending…" : "Send message"}
							</button>
						</form>
					)}
				</div>

				<div>
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Elsewhere</p>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						<a
							href={`${clientEnv.WEB_URL}/docs`}
							className="block py-3 text-[12.5px] text-[var(--ink-75)] transition-colors hover:text-[var(--ink-90)]"
						>
							Documentation
							<span className="block text-[11px] text-[var(--ink-30)]">
								How the API, SDK and modules work.
							</span>
						</a>
						<a
							href={`${clientEnv.WEB_URL}/changelog`}
							className="block py-3 text-[12.5px] text-[var(--ink-75)] transition-colors hover:text-[var(--ink-90)]"
						>
							Changelog
							<span className="block text-[11px] text-[var(--ink-30)]">
								Everything that has shipped.
							</span>
						</a>
						<div className="py-3">
							<p className="text-[12.5px] text-[var(--ink-75)]">Email</p>
							<div className="mt-1 flex items-center gap-2">
								<p className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--ink-45)]">
									{SUPPORT_EMAIL}
								</p>
								<button
									type="button"
									onClick={() => {
										void navigator.clipboard.writeText(SUPPORT_EMAIL);
										setCopied(true);
									}}
									className="inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
								>
									<CopyIcon size={11} className="mr-1.5" />
									{copied ? "Copied" : "Copy"}
								</button>
							</div>
						</div>
						{/* Answers "is it me or is it them" before anybody writes in. */}
						<div className="py-3">
							<p className="text-[12.5px] text-[var(--ink-75)]">
								System status
							</p>
							<StatusIndicator
								endpoint={`${clientEnv.API_URL}/health`}
								href={STATUS_URL}
								className="mt-1 flex h-7 rounded-full text-[11px] text-[var(--ink-45)] hover:text-[var(--ink-80)]"
							/>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/support")({
	component: SupportPage,
	validateSearch: (
		search: Record<string, unknown>,
	): { requestId?: string } => ({
		requestId:
			typeof search.requestId === "string" && search.requestId.length <= 64
				? search.requestId
				: undefined,
	}),
});
