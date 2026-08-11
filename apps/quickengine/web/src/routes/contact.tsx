import { STATUS_URL } from "@quickengine/ui";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@quickengine/ui/components/ui/select";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ICE } from "@/components/pill";
import { TextPage, TextSection, textProse } from "@/components/text-page";
import { env } from "@/lib/env";
import { CARD } from "@/lib/surfaces";

/**
 * Contact.
 *
 * This posts to `POST /v1/contact` on the API, which sends the message by email
 * and stores nothing. The endpoint exists because this app is a static SPA with
 * no server runtime: sending mail needs the Resend key, and a key in page source
 * is a key anyone can send mail as us with.
 *
 * ⚠️ The address shown is a Gmail. `hello@`, `sales@` and `press@` on the domain
 * were listed here and none of them exist — every one bounced. One working
 * personal address beats four dead professional-looking ones.
 */

const EMAIL_ADDRESS = "quickenginesw@gmail.com";

// ⚠️ Not the RFC grammar, deliberately. This catches the typo — a missing `@`, a
// bare word, a domain with no dot. Anything stricter starts rejecting real
// addresses, and the server applies the same rule as the one that counts.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const TOPICS = [
	"General question",
	"Pricing or plans",
	"Technical or API",
	"Press",
	"Something else",
] as const;

/**
 * ⚠️ Underlines, not boxes.
 *
 * The form sat inside a bordered card with bordered inputs in it, which is three
 * nested rectangles before anyone types a character. On a page that is otherwise
 * type on black it read as a widget dropped onto the site rather than part of it.
 *
 * A single rule under each field is enough affordance when every field is
 * full-width and clearly labelled, and it lets the form sit in the same column as
 * the prose above it instead of interrupting it. The rule brightens on focus,
 * which is the only state change needed.
 */
const fieldBase =
	"w-full border-white/15 border-b bg-transparent pb-3 font-body font-light text-[1.0625rem] text-white outline-none transition-colors duration-300 placeholder:text-white/25 focus:border-white/45 disabled:opacity-50";
const field = fieldBase;
const label =
	"font-body font-light text-[0.75rem] text-white/40 uppercase tracking-[0.12em]";

type State = "idle" | "sending" | "sent";

function Field({
	id,
	label: text,
	children,
}: {
	id: string;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<label htmlFor={id} className={label}>
				{text}
			</label>
			{children}
		</div>
	);
}

function ContactPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [topic, setTopic] = useState<string>(TOPICS[0]);
	const [message, setMessage] = useState("");
	// The honeypot. Hidden from people, irresistible to bots.
	const [website, setWebsite] = useState("");
	const [state, setState] = useState<State>("idle");
	const [error, setError] = useState("");

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (state === "sending") return;

		if (!name.trim()) {
			setError("Tell us your name so we know who we're replying to.");
			return;
		}
		if (!EMAIL.test(email.trim())) {
			setError("That doesn't look like an email address we could reply to.");
			return;
		}
		if (message.trim().length < 10) {
			setError("Add a little more detail so we can give you a useful answer.");
			return;
		}

		setError("");
		setState("sending");

		try {
			const response = await fetch(`${env.VITE_API_URL}/v1/contact`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: name.trim(),
					email: email.trim(),
					topic,
					message: message.trim(),
					website,
				}),
			});
			if (!response.ok) throw new Error(String(response.status));
			setState("sent");
		} catch {
			setState("idle");
			// ⚠️ Names the fallback rather than hiding it. A failure here means the
			// message is gone, and the only thing worse than the form breaking is
			// the person not knowing another way to reach us.
			setError(
				`Something went wrong sending that. Email ${EMAIL_ADDRESS} instead and we'll get it.`,
			);
		}
	};

	return (
		<TextPage
			title="Get in touch."
			lede="Two people read this inbox and both of them build the product. You will not be routed through a queue."
		>
			<TextSection title="Send a message">
				{state === "sent" ? (
					// Replaces the form rather than sitting above it. A confirmation over
					// a still-filled form invites a second send, and people do it.
					<div className="py-6">
						<p className="font-display font-light text-[clamp(1.5rem,3vw,2rem)] text-white leading-tight tracking-[-0.02em]">
							Message sent.
						</p>
						<p className="mt-5 max-w-[52ch] font-body font-light text-[1.0625rem] text-white/60 leading-[1.7]">
							It landed in an inbox that two people read. Expect a reply from a
							person, usually within a day.
						</p>
					</div>
				) : (
					<form onSubmit={submit} noValidate>
						<div className="flex flex-col gap-10">
							<div className="grid gap-10 sm:grid-cols-2">
								<Field id="contact-name" label="Your name">
									<input
										id="contact-name"
										className={field}
										value={name}
										onChange={(event) => setName(event.target.value)}
										autoComplete="name"
										disabled={state === "sending"}
									/>
								</Field>

								<Field id="contact-email" label="Your email">
									<input
										id="contact-email"
										className={field}
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										// ⚠️ `text`, not `email`. `type="email"` hands validation to
										// the browser's own bubble, which ignores the message slot
										// below and looks like a different product. `inputMode`
										// still gives phones the right keyboard.
										type="text"
										inputMode="email"
										autoComplete="email"
										disabled={state === "sending"}
									/>
								</Field>
							</div>

							<Field id="contact-topic" label="What's it about">
								{/* ⚠️ NOT a native `<select>`. The browser hands that to the
								    operating system, so it opened as a macOS popover here, a
								    Windows list box there and something else again on Linux
								    three different-looking controls in the middle of a page we
								    otherwise control completely, none of them matching the site.

								    This is the Radix select already in `@quickengine/ui`, which
								    renders real markup we can style, and behaves identically on
								    every platform. It keeps the keyboard and screen-reader
								    behaviour the native element gives you for free, which is the
								    only reason a hand-rolled dropdown would have been wrong. */}
								<Select
									value={topic}
									onValueChange={setTopic}
									disabled={state === "sending"}
								>
									<SelectTrigger
										id="contact-topic"
										// Matches the underlined fields around it rather than the
										// bordered box the component ships with.
										/**
										 * ⚠️ `pe-[11px]` is measured, not chosen by eye. It puts the
										 * chevron on the same vertical axis as the tick beside the
										 * selected option, so the indicator does not jump sideways
										 * when the list opens.
										 *
										 * The arithmetic, from the panel's right edge inward, since
										 * the panel is pinned to the trigger's width:
										 *   4px  viewport padding (`p-1` on the Radix viewport)
										 * + 8px  indicator offset (`right-2` on the item)
										 * + 7px  half the 14px indicator box
										 * = 19px to the tick's centre.
										 * The chevron is 16px, so its centre sits at `pe` + 8.
										 * 11 + 8 = 19. They line up.
										 *
										 * 🔴 If `SelectItem` or the viewport padding in
										 * `packages/ui/src/components/ui/select.tsx` ever changes,
										 * this number is wrong and nothing will tell you.
										 */
										className="h-auto w-full rounded-none border-white/15 border-x-0 border-t-0 border-b bg-transparent pe-[11px] ps-0 pb-3 font-body font-light text-[1.0625rem] text-white shadow-none focus:border-white/45 focus-visible:ring-0 data-[state=open]:border-white/45"
									>
										<SelectValue />
									</SelectTrigger>
									{/* ⚠️ `align="start"` and an explicit width.

									    The component defaults to `align="center"`, which centres
									    the panel under the trigger, so on a full-width field it
									    opened narrower than the field and floated in the middle of
									    it, which is what made the chevron look stranded off to one
									    side. It was never the chevron: that sits at the trigger's
									    right edge, and the panel simply was not reaching it.

									    Pinned to the trigger's own width so the open panel is
									    exactly the control it came from. */}
									<SelectContent
										align="start"
										style={{ backgroundColor: CARD }}
										className="w-[var(--radix-select-trigger-width)] border-white/[0.09] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.95)]"
									>
										{TOPICS.map((option) => (
											<SelectItem
												key={option}
												value={option}
												className="font-body font-light text-[0.9375rem] text-white/80 focus:bg-white/[0.06] focus:text-white"
											>
												{option}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field id="contact-message" label="Message">
								<textarea
									id="contact-message"
									rows={7}
									className={`${fieldBase} resize-y leading-[1.7]`}
									value={message}
									onChange={(event) => setMessage(event.target.value)}
									placeholder="What are you building, and what do you need it to do?"
									disabled={state === "sending"}
								/>
							</Field>

							{/* 🔴 THE HONEYPOT. Hidden from people, filled by bots, and the
							    server drops anything that arrives with it set.

							    `aria-hidden` plus `tabIndex={-1}` keeps it away from screen
							    readers and the tab order, so it traps scripts rather than
							    anyone using a keyboard. NOT `type="hidden"`, bots skip those
							    and it would catch nothing. Do not add a visible label. */}
							<div aria-hidden="true" className="hidden">
								<label htmlFor="contact-website">Website</label>
								<input
									id="contact-website"
									type="text"
									tabIndex={-1}
									autoComplete="off"
									value={website}
									onChange={(event) => setWebsite(event.target.value)}
								/>
							</div>

							{/* Reserved height, so the button never moves when a message
							    appears or clears. Same rule as the auth screens. */}
							<div role="alert" className="min-h-[1.0625rem]">
								{error ? (
									<p
										style={{ color: "#E8B4B4" }}
										className="font-body font-light text-[0.8125rem] leading-[1.0625rem]"
									>
										{error}
									</p>
								) : null}
							</div>

							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="font-body font-light text-[0.8125rem] text-white/35">
									We reply to everything. No newsletter, no sequence.
								</p>
								<button
									type="submit"
									disabled={state === "sending"}
									style={{ backgroundColor: ICE, color: "#000000" }}
									className="inline-flex h-11 shrink-0 items-center justify-center rounded-full px-7 font-body font-light text-[15px] leading-none outline-none transition-opacity duration-300 ease-out hover:opacity-85 hover:duration-150 focus-visible:opacity-85 disabled:opacity-45 max-sm:w-full"
								>
									{state === "sending" ? "Sending…" : "Send message"}
								</button>
							</div>
						</div>
					</form>
				)}
			</TextSection>

			<TextSection title="Or email us directly">
				<div className={textProse}>
					<p>
						<a href={`mailto:${EMAIL_ADDRESS}`}>{EMAIL_ADDRESS}</a>
					</p>
					<p>
						One inbox, read by both of us. You will be talking to the person who
						built whatever you are asking about.
					</p>
				</div>
			</TextSection>

			<TextSection title="Other things you might want">
				<div className={textProse}>
					<ul>
						<li>
							Something looks broken?{" "}
							<a href={STATUS_URL} target="_blank" rel="noreferrer">
								Check live status
							</a>{" "}
							first, in case we already know.
						</li>
						<li>
							Working out whether QuickDash fits? <a href="/pricing">Pricing</a>{" "}
							lists what every plan includes.
						</li>
						<li>
							Wondering who you are dealing with? <a href="/about">About</a>{" "}
							covers that.
						</li>
					</ul>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/contact")({
	component: ContactPage,
});
