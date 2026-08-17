import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@quickengine/ui/components/ui/dialog";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { sessionApi } from "../lib/api";

const topics = [
	"Product feedback",
	"Feature request",
	"Something isn’t working",
	"Billing",
	"Other",
] as const;

/**
 * Feedback, sent without leaving the workspace.
 *
 * 🔑 Identical to Account's, deliberately — the same five topics and the same
 * endpoint. It exists here so that sending feedback never navigates somebody
 * out of the dashboard they were working in, which is what a link to Account
 * would do.
 */
export function FeedbackDialog({
	open,
	onOpenChange,
	name,
	email,
	workspaceName,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	email: string;
	/** Named in the message so a report arrives with the context to act on it. */
	workspaceName?: string;
}) {
	const [topic, setTopic] = useState<(typeof topics)[number] | null>(null);
	const [message, setMessage] = useState("");
	const [sent, setSent] = useState(false);
	const send = useMutation({
		mutationFn: () =>
			sessionApi.request("/contact", {
				method: "POST",
				body: {
					name,
					email,
					topic: `QuickDash feedback${workspaceName ? ` (${workspaceName})` : ""}: ${topic}`,
					message,
					website: "",
				},
			}),
		onSuccess: () => {
			setMessage("");
			setTopic(null);
			setSent(true);
		},
	});

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSent(false);
		send.mutate();
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setSent(false);
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="gap-0 border-[var(--console-line)] bg-[var(--console-pop)] p-2 text-[var(--ink-90)] shadow-2xl sm:max-w-md"
			>
				<DialogHeader className="sr-only">
					<DialogTitle>Send feedback</DialogTitle>
					<DialogDescription>
						Send product feedback to QuickEngine.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="flex flex-col gap-2.5">
					<div>
						<Popover>
							<PopoverTrigger
								aria-label="Feedback topic"
								className="flex h-11 w-full items-center rounded-md border border-[var(--console-line)] bg-[var(--console-bg)] px-3 text-left text-[13px] text-[var(--ink-80)] outline-none transition-colors hover:border-[rgb(var(--console-ink)/0.20)] focus-visible:border-[rgb(var(--console-ink)/0.30)]"
							>
								<span
									className={`min-w-0 flex-1 truncate ${topic ? "" : "text-[var(--ink-25)]"}`}
								>
									{topic ?? "Select a topic"}
								</span>
								<CaretDownIcon size={12} className="text-[var(--ink-25)]" />
							</PopoverTrigger>
							<PopoverContent
								align="start"
								sideOffset={5}
								className="w-[var(--radix-popover-trigger-width)] border-[var(--console-line)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
							>
								{topics.map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setTopic(option)}
										className="flex h-8 w-full items-center rounded-md px-2 text-[11.5px] text-[var(--ink-45)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-85)]"
									>
										<span className="flex-1 text-left">{option}</span>
										{topic === option ? <CheckIcon size={12} /> : null}
									</button>
								))}
							</PopoverContent>
						</Popover>
					</div>
					<div>
						<textarea
							aria-label="Feedback message"
							required
							minLength={10}
							maxLength={4000}
							rows={7}
							value={message}
							onChange={(event) => setMessage(event.target.value)}
							placeholder="Your feedback..."
							className="w-full resize-none rounded-md border border-[var(--console-line)] bg-[var(--console-bg)] px-3 py-2.5 text-[13px] leading-5 text-[var(--ink-80)] outline-none placeholder:text-[var(--ink-25)] focus:border-[rgb(var(--console-ink)/0.30)]"
						/>
					</div>
					{send.isError ? (
						<p className="text-[11px] text-red-400">
							Feedback couldn’t be sent. Please try again.
						</p>
					) : null}
					{sent ? (
						<p className="text-[11px] text-emerald-400">
							Feedback sent. Thank you.
						</p>
					) : null}
					<button
						type="submit"
						disabled={send.isPending || !topic || message.trim().length < 10}
						className="flex h-9 w-full items-center justify-center rounded-md bg-[rgb(var(--console-ink))] px-4 text-[12px] text-[var(--console-pop)] transition-colors hover:bg-[rgb(var(--console-ink)/0.85)] disabled:cursor-not-allowed disabled:opacity-40"
					>
						{send.isPending ? "Sending…" : "Send feedback"}
					</button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
