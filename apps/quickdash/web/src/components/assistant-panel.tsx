import {
	CheckIcon,
	CopyIcon,
	PaperPlaneRightIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useEffect, useRef, useState } from "react";
import { useAssistant } from "../lib/assistant";
import { INTEGRATIONS } from "./integrations-catalogue";

/**
 * The assistant column.
 *
 * ── What is real and what is not ────────────────────────────────────────────
 *
 * 🔴 The SURFACE is finished; the model is not wired. There is no endpoint and
 * no model call yet, and the panel says so out loud rather than pretending.
 * Everything around the answer is real: conversations are kept and reopened,
 * the model choice persists, the composer behaves. When the endpoint lands,
 * `send` is the only function that changes.
 *
 * ⚠️ It never invents an answer. A composer that swallows what you type is bad;
 * a fake reply is worse, because it teaches somebody to trust a thing that
 * cannot yet be trusted. Every reply here is the panel talking about itself.
 *
 * ── How elevation is used ───────────────────────────────────────────────────
 *
 * 🔑 Depth marks what is an OBJECT or a CONTROL. Prose stays flat.
 *
 * The temptation is to raise every message, and it is wrong: a raised bubble is
 * a thing you pick up, and forty of them down a column is a scree of tiles with
 * the reading buried underneath. So the transcript is flat, the way the sidebar
 * is flat, and the two things that are genuinely objects rise: what YOU said,
 * which is a discrete act, and the composer, which is a control. Anything
 * structured inside an answer later — a code block, a record, an action waiting
 * to be approved — earns a tile for the same reason.
 *
 * ⚠️ When the model IS wired, the composer is the part that needs care rather
 * than the transcript: this console is where somebody manages workspaces,
 * billing and people, and an assistant that can act on those has to show what
 * it is about to do before it does it. The runtime already returns
 * `awaiting_approval` with the tool and its risk; that is the tile.
 */

/**
 * The models this assistant can be asked to use.
 *
 * 🔑 One list, ordered by what somebody is trading: speed and cost against how
 * much thinking they get. The ids are what the provider seam takes, so adding a
 * model is a line here and nothing else.
 *
 * ⚠️ Metered, per hard rule 7: thinking costs QuickEngine real money and the
 * pool is prepaid. The per workspace cap belongs on the RUN, not on this menu,
 * because a menu cannot stop anything.
 */
const MODELS = [
	{
		id: "claude-opus-5",
		provider: "Anthropic",
		name: "Opus 5",
		detail: "The most capable. For hard questions.",
	},
	{
		id: "claude-sonnet-5",
		provider: "Anthropic",
		name: "Sonnet 5",
		detail: "The everyday choice. Balanced.",
	},
	{
		id: "claude-haiku-4-5",
		provider: "Anthropic",
		name: "Haiku 4.5",
		detail: "Fastest and cheapest. Good for lookups.",
	},
	/**
	 * ⚠️ GPT models go here, grouped under their own provider, and their `id`
	 * has to be the string the OpenAI adapter accepts. There is no OpenAI
	 * adapter yet — `agent-providers` has Anthropic and a fake — so writing
	 * plausible looking ids now would put strings in the UI that no code can
	 * honour, and the first person to pick one would get a failed run with
	 * nothing to explain it. Add the adapter, then add the rows.
	 */
] as const;

type ModelId = (typeof MODELS)[number]["id"];

const MODEL_KEY = "quickdash.assistant.model";

const readModel = (): ModelId => {
	try {
		const saved = localStorage.getItem(MODEL_KEY);
		return MODELS.some((model) => model.id === saved)
			? (saved as ModelId)
			: "claude-sonnet-5";
	} catch {
		return "claude-sonnet-5";
	}
};

const NOT_CONNECTED =
	"I cannot answer yet. This panel is built but no model is connected to it, so nothing you type leaves your browser. Your messages are kept so the conversation can be read back.";

const menuRow =
	"flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)]";

/**
 * ⚠️ Takes no props. Everything it needs comes from `useAssistant`, which is
 * also what the sidebar's list reads, so the two can never disagree about which
 * conversation is open.
 */
export function AssistantPanel() {
	const [draft, setDraft] = useState("");
	const [model, setModel] = useState<ModelId>(readModel);
	const assistant = useAssistant();
	/**
	 * Which integrations this conversation may reach.
	 *
	 * 🔴 Held here rather than read from the workspace, because none of them
	 * connect yet. When they do this becomes the tool set handed to the run, and
	 * an integration the workspace has NOT connected must never appear as though
	 * the assistant could already use it.
	 */
	const [reaching, setReaching] = useState<readonly string[]>([]);
	const [copied, setCopied] = useState<string | null>(null);
	const foot = useRef<HTMLDivElement | null>(null);

	const turns = assistant?.active?.turns ?? [];

	// Follow the conversation down. `block: "nearest"` so it scrolls the
	// transcript and never the whole console with it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new turns
	useEffect(() => {
		foot.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [turns.length]);

	/**
	 * 🔴 The ONLY function that changes when the model is wired. Everything
	 * around it is already what it will be: the store, the sidebar's list, the
	 * composer. Today it records the question and answers honestly that nothing
	 * is connected.
	 */
	const send = () => {
		const said = draft.trim();
		if (!said || !assistant) return;
		assistant.append(said, NOT_CONNECTED);
		setDraft("");
	};

	const chosen =
		MODELS.find((entry) => entry.id === model) ??
		// Order is presentation, so never index into it for a fallback.
		MODELS.find((entry) => entry.id === "claude-sonnet-5") ??
		MODELS[0];

	return (
		/* 🔴 No rail and no header. The list of conversations and "new chat" both
		   left for the console's own sidebar, which is the list column and
		   already swaps between navigation and notifications. A list inside this
		   panel meant either a popover, which hides what you are picking from, or
		   a rail taking width from the one thing you came here to read. This
		   column is ONE conversation and nothing else. */
		<div className="flex min-h-0 flex-1 flex-col">
			{turns.length === 0 ? (
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
					<p className="text-[12.5px] text-[var(--ink-45)]">
						Not connected yet
					</p>
					<p className="text-[11.5px] text-[var(--ink-30)] leading-[1.5]">
						This panel is built and waiting on a model. Ask something and it is
						kept here, but nothing is sent anywhere.
					</p>
				</div>
			) : (
				/* `fade-ends`, the same treatment the navigation got: a conversation
				   that runs under the composer should dissolve rather than be cut off
				   by a hard edge. */
				<div className="fade-ends min-h-0 flex-1 overflow-y-auto px-4 py-2">
					<div className="flex flex-col gap-3">
						{turns.map((turn) =>
							turn.from === "you" ? (
								/* 🔑 Raised, and the only raised thing in the transcript. What
								   you said is a discrete act with a beginning and an end, so it
								   is an object. `max-w` keeps it from becoming a full width
								   band, which would read as a section header. */
								<p
									key={turn.id}
									className="control-raised ml-auto max-w-[85%] rounded-lg rounded-br-sm border px-2.5 py-1.5 text-[12.5px] text-[var(--ink-85)] leading-[1.5]"
								>
									{turn.text}
								</p>
							) : (
								/* Flat, full width, no container. This is reading, and a
								   surface under it only gets in the way. */
								<div key={turn.id} className="group">
									<p className="text-[12.5px] text-[var(--ink-55)] leading-[1.6]">
										{turn.text}
									</p>
									{/* Copy appears on approach, like the code blocks on the
									    Developers page: an answer is for reading, not a row of
									    buttons. */}
									<button
										type="button"
										aria-label={copied === turn.id ? "Copied" : "Copy"}
										onClick={() => {
											void navigator.clipboard?.writeText(turn.text);
											setCopied(turn.id);
											setTimeout(() => setCopied(null), 1500);
										}}
										className="mt-1 flex items-center gap-1.5 rounded-md text-[10.5px] text-[var(--ink-25)] opacity-0 transition-opacity hover:text-[var(--ink-70)] focus-visible:opacity-100 group-hover:opacity-100"
									>
										{copied === turn.id ? (
											<CheckIcon size={11} />
										) : (
											<CopyIcon size={11} />
										)}
										{copied === turn.id ? "Copied" : "Copy"}
									</button>
								</div>
							),
						)}
						<div ref={foot} />
					</div>
				</div>
			)}

			<div className="shrink-0 p-3">
				{/* `control-static`: raised because it is the control you reach for,
				    static because clicking INTO a box should not press it like a key. */}
				<div className="control-static flex flex-col gap-1.5 rounded-xl border p-2.5">
					<textarea
						rows={3}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							// Enter sends, shift+enter breaks the line. The usual contract,
							// and worth honouring precisely because it is usual.
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								send();
							}
						}}
						placeholder="Ask about this workspace…"
						/* 🔴 Three lines, not one, growing to about eight. A single line
						   box says "type a search term". The questions somebody brings
						   here are a sentence or two with a record id in the middle, and a
						   box showing one line of that means writing into a slot and
						   losing sight of the beginning. */
						className="max-h-[11rem] min-h-[4.5rem] w-full resize-none bg-transparent text-[12.5px] text-[var(--ink-85)] leading-[1.55] outline-none placeholder:text-[var(--ink-25)]"
					/>

					{/* The controls sit UNDER the field rather than beside it, so the
					    text runs the full width instead of stopping short of a button
					    parked in the corner. */}
					<div className="flex items-center gap-1.5">
						{/* What this conversation may reach. Bottom left, where every chat
						    window puts the thing you attach. */}
						<Popover>
							<PopoverTrigger
								aria-label="Integrations"
								title="What this chat can reach"
								className="control-raised flex size-7 shrink-0 items-center justify-center rounded-md border text-[var(--ink-40)] outline-none hover:text-[var(--ink-90)]"
							>
								<PlusIcon size={14} />
							</PopoverTrigger>
							<PopoverContent
								align="start"
								side="top"
								sideOffset={6}
								collisionPadding={8}
								style={{ boxShadow: "var(--lift-pop)" }}
								className="flex max-h-80 w-72 flex-col gap-0.5 overflow-y-auto rounded-xl border-0 bg-[var(--console-pop)] p-1.5"
							>
								<p className="px-2 pt-1 pb-1 text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
									What this chat can reach
								</p>
								{/* 🔴 Honest about the state of it. Nothing here connects yet,
								    so nothing here pretends to: choosing one records the intent
								    and the row says where connecting actually happens. An
								    assistant that appears to hold a key to somebody's inbox
								    when it does not is the worst possible lie for this panel to
								    tell. */}
								<p className="px-2 pb-1.5 text-[11px] text-[var(--ink-35)] leading-[1.45]">
									Connect these in Settings, under Integrations. Until then this
									only records what you want it to use.
								</p>
								{INTEGRATIONS.flatMap((group) =>
									group.items.map((entry) => {
										const on = reaching.includes(entry.id);
										return (
											<button
												key={entry.id}
												type="button"
												aria-pressed={on}
												onClick={() =>
													setReaching((current) =>
														on
															? current.filter((id) => id !== entry.id)
															: [...current, entry.id],
													)
												}
												className={`${menuRow} ${
													on ? "text-[var(--ink-90)]" : "text-[var(--ink-60)]"
												}`}
											>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-[12px]">
														{entry.name}
													</span>
													<span className="mt-px block truncate text-[10.5px] text-[var(--ink-30)]">
														{entry.detail}
													</span>
												</span>
												{on ? (
													<CheckIcon
														size={12}
														className="mt-0.5 shrink-0 text-[var(--ink-70)]"
													/>
												) : null}
											</button>
										);
									}),
								)}
							</PopoverContent>
						</Popover>

						{/* The model. Named plainly, because somebody choosing to spend
						    more on a harder question should be able to see what they
						    picked. */}
						<Popover>
							<PopoverTrigger
								title={chosen.detail}
								className="control-raised flex h-7 shrink-0 items-center rounded-md border px-2 text-[10.5px] text-[var(--ink-50)] outline-none hover:text-[var(--ink-90)]"
							>
								{chosen.name}
							</PopoverTrigger>
							<PopoverContent
								align="start"
								side="top"
								sideOffset={6}
								collisionPadding={8}
								style={{ boxShadow: "var(--lift-pop)" }}
								className="flex w-64 flex-col gap-0.5 rounded-xl border-0 bg-[var(--console-pop)] p-1.5"
							>
								{/* Grouped by provider, so adding OpenAI is data rather than
								    markup, and so somebody can see whose model they are about
								    to spend on. */}
								{[...new Set(MODELS.map((entry) => entry.provider))].map(
									(provider) => (
										<div key={provider} className="flex flex-col gap-0.5">
											<p className="px-2 pt-1 pb-0.5 text-[10px] text-[var(--ink-25)] uppercase tracking-[0.08em]">
												{provider}
											</p>
											{MODELS.filter(
												(entry) => entry.provider === provider,
											).map((entry) => (
												<button
													key={entry.id}
													type="button"
													aria-pressed={entry.id === model}
													onClick={() => {
														setModel(entry.id);
														try {
															localStorage.setItem(MODEL_KEY, entry.id);
														} catch {
															// A preference that cannot be remembered still applies
															// for this session.
														}
													}}
													className={`${menuRow} ${
														entry.id === model
															? "text-[var(--ink-90)]"
															: "text-[var(--ink-60)]"
													}`}
												>
													<span className="min-w-0 flex-1">
														<span className="block text-[12px]">
															{entry.name}
														</span>
														<span className="mt-px block text-[10.5px] text-[var(--ink-30)]">
															{entry.detail}
														</span>
													</span>
													{entry.id === model ? (
														<CheckIcon
															size={12}
															className="mt-0.5 shrink-0 text-[var(--ink-70)]"
														/>
													) : null}
												</button>
											))}
										</div>
									),
								)}
							</PopoverContent>
						</Popover>

						<span className="min-w-0 flex-1" />

						<button
							type="button"
							onClick={send}
							disabled={!draft.trim()}
							aria-label="Send"
							/* `control-lift`, not `control-raised`: it carries its own fill
							   and a raised face would paint over it. */
							className="control-lift flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-[rgb(var(--console-ink)/0.10)] px-2.5 text-[11.5px] text-[var(--ink-55)] outline-none hover:text-[var(--ink-90)] disabled:opacity-40"
						>
							<PaperPlaneRightIcon size={12} />
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
