import {
	CaretDown,
	CaretLeft,
	CaretRight,
	Check,
	Lock,
} from "@phosphor-icons/react";
import { useSession } from "@quickengine/auth/client";
import { ICE, Logo, useTheme } from "@quickengine/ui";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { AnimatePresence, motion } from "motion/react";

/**
 * ⚠️ A SOLID card colour, not a translucent fill.
 *
 * `bg-[var(--ob-hover-bg)]` over the gradient is not a surface — the wave moves under it
 * and the panel reads as a smudge that brightens and dims. The marketing site
 * records the same decision in `lib/surfaces.ts`; this is that value. If a third
 * app needs it, move it to `@quickengine/ui` rather than typing it again.
 */
const _CARD = "#101315";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api } from "../lib/api";
import { clientEnv } from "../lib/env";
import { FOUNDATION } from "../lib/modules";
import { findRecipe, RECIPES, type Recipe } from "../lib/recipes";

/**
 * ⚠️ `setup` and `ai` were removed on 2026-08-11 and are NOT in this union any
 * more, so nothing can navigate to a step that no longer renders. See the note
 * where they used to be for why they went and what comes back.
 */
type Step =
	| "name"
	| "work"
	| "role"
	| "path"
	| "modules"
	| "review"
	| "success";
type SetupChoice = "ai" | "manual" | "defaults";
type CatalogModule = {
	id: string;
	name: string;
	description: string;
	kind: "shared" | "domain";
	dependsOn: readonly string[];
	status: "built" | "upcoming";
};

/**
 * What the person DOES, not what they are allowed to do.
 *
 * ⚠️ RBAC's roles are `owner | admin | member`, and whoever reaches this screen
 * created the workspace, so they are always `owner`. Asking which one they are
 * would be a question with exactly one answer. This asks the useful thing
 * instead: which part of the business they are actually in.
 *
 * 🔑 It has to CHANGE something or it does not belong here. Research on 2026
 * onboarding is blunt about this — most products collect a role at signup and
 * change nothing with it, so the question costs completion and buys nothing.
 * Each answer adds the modules that part of a business reaches for, on top of
 * whatever the kind of work implies, and the count on the next card moves when
 * you pick. Same test the "kind of work" question has to pass.
 *
 * ⚠️ NOT PERSISTED. `POST /account/workspaces` takes a name, a business type and
 * module ids; there is no column for this, and adding one is an API change plus
 * a migration. It shapes the setup and is then discarded. Worth storing properly
 * when the invite flow needs it — recorded in TECH_DEBT.
 */
const ROLES = [
	{
		id: "owner",
		label: "I run the business",
		detail: "A bit of everything, most days.",
		adds: [],
	},
	{
		id: "sales",
		label: "Winning the work",
		detail: "Enquiries, quotes and getting a yes.",
		adds: ["client-records", "quotes-estimates"],
	},
	{
		id: "accounts",
		label: "Looking after clients",
		detail: "The people who already bought, and keeping them.",
		adds: ["client-records", "content"],
	},
	{
		id: "delivery",
		label: "Doing the work",
		detail: "Jobs and projects, start to finish.",
		adds: ["projects-tasks", "time-tracking"],
	},
	{
		id: "field",
		label: "Out on the job",
		detail: "On site, on the tools, on the road.",
		adds: ["bookings", "quotes-estimates"],
	},
	{
		id: "scheduling",
		label: "Running the diary",
		detail: "Who is where, and when.",
		adds: ["bookings", "client-records"],
	},
	{
		id: "operations",
		label: "Keeping it moving",
		detail: "Orders in, orders out, nothing stuck.",
		adds: ["orders", "inventory"],
	},
	{
		id: "dispatch",
		label: "Packing and shipping",
		detail: "Labels, couriers and where the parcel is.",
		adds: ["shipping", "fulfillment"],
	},
	{
		id: "stock",
		label: "Minding the stock",
		detail: "What is on the shelf and what is running out.",
		adds: ["inventory", "products-services"],
	},
	{
		id: "purchasing",
		label: "Buying and suppliers",
		detail: "What comes in, and who it comes from.",
		adds: ["inventory", "orders"],
	},
	{
		id: "catalogue",
		label: "What we sell",
		detail: "The range, the prices, the descriptions.",
		adds: ["products-services", "content"],
	},
	{
		id: "finance",
		label: "Money and admin",
		detail: "Invoices out, payments in, books straight.",
		adds: ["invoicing", "payments"],
	},
	{
		id: "paperwork",
		label: "Contracts and compliance",
		detail: "Agreements, signatures and keeping records.",
		adds: ["contracts-esign", "files"],
	},
	{
		id: "support",
		label: "Answering customers",
		detail: "Questions, problems and putting things right.",
		adds: ["client-records", "files"],
	},
	{
		id: "marketing",
		label: "Getting us seen",
		detail: "Pages, campaigns and what people find.",
		adds: ["content", "reporting-analytics"],
	},
	{
		id: "data",
		label: "Watching the numbers",
		detail: "What is working, and what is not.",
		adds: ["reporting-analytics"],
	},
	{
		id: "technical",
		label: "Building and connecting",
		detail: "The API, the data, the other systems.",
		adds: ["files", "reporting-analytics"],
	},
] as const;

type RoleId = (typeof ROLES)[number]["id"];

const _panel =
	"rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-5 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]";

/**
 * A raised surface.
 *
 * ⚠️ Cards were tried here before and failed — but the reason recorded at the
 * time was that a moving gradient ran underneath them, so a panel read as a
 * smudge rather than a surface. The gradient is gone, the ground is flat
 * `--console-bg`, and `--console-pop` is the console's own raised tone. The
 * objection does not survive the change that caused it.
 */
function _Card({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`rounded-2xl border border-[var(--ob-line)] bg-[var(--ob-card)] ${className}`}
		>
			{children}
		</div>
	);
}

/**
 * The cool end of the palette, as literal hex.
 *
 * 🔴 Deliberately NOT `var(--accent-hi)`, which is what the first attempt used.
 * Two things make a token the wrong tool here: `--accent` is shadowed later in
 * `theme.css` by the shadcn mapping (`--accent: var(--surface-2)`), so the
 * obvious name silently resolves to a near-black neutral; and both accent tokens
 * are defined per theme, so the backdrop would change colour with the theme
 * rather than staying the one image it is meant to be. These four are one
 * family, sampled toward ICE, and they do not move.
 */
const SKY = "#7FA8C9";
const BLUE = "#3E6C8F";
const DEEP = "#1D3A4F";

/**
 * The ground the deck sits on.
 *
 * ── Why the blue was invisible ───────────────────────────────────────────────
 *
 * 🔴 It was painted into the TOP corners, and the vignette is darkest exactly
 * there — the two layers were fighting and the darkening won. The colour now
 * sits where the vignette is weakest, and the vignette only darkens the top,
 * where there is no colour to lose.
 *
 * ── The layout ───────────────────────────────────────────────────────────────
 *
 * A wave rising out of the BOTTOM-LEFT corner and running diagonally up and
 * across, deepest at the corner and thinning as it goes, with a weaker echo at
 * the bottom right so the screen is not lopsided. Slate stays the ground; the
 * blues are a family sampled toward ICE rather than a separate hue, and ICE
 * itself only lifts the very bottom edge.
 *
 * ⚠️ Every radial is centred BELOW the viewport, so only the flat top of each
 * falloff is on screen. That is what keeps it a wave rather than a spotlight —
 * a visible dome under a centred card reads as a stage.
 *
 * Fixed rather than absolute: the deck is vertically centred, and a backdrop
 * that scrolled with it would detach from the window at short heights.
 */
function Glow() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-0"
			style={{
				backgroundImage: [
					// ICE, only along the very bottom edge — the highlight on the crest.
					`radial-gradient(70% 26% at 26% 104%, ${ICE}1f 0%, ${ICE}0a 40%, transparent 72%)`,
					// The crest, palest and smallest, furthest up the diagonal.
					`radial-gradient(58% 42% at 40% 108%, ${SKY}2b 0%, transparent 68%)`,
					// The body of the wave.
					`radial-gradient(74% 58% at 22% 108%, ${BLUE}52 0%, ${BLUE}1f 40%, transparent 72%)`,
					// The deep water it rises out of, anchored in the corner.
					`radial-gradient(96% 76% at 4% 116%, ${DEEP}a6 0%, ${DEEP}52 34%, transparent 74%)`,
					// The echo, weaker, so the screen is not lopsided.
					`radial-gradient(66% 48% at 94% 112%, ${DEEP}5c 0%, ${DEEP}1f 38%, transparent 70%)`,
					// A flat lift so the bottom edge never ends on a hard line.
					`linear-gradient(to top, ${BLUE}17 0%, ${BLUE}08 24%, transparent 52%)`,
					// ⚠️ TOP ONLY. A centred vignette would sit straight on the wave.
					"linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 26%, transparent 46%)",
				].join(", "),
			}}
		>
			{/* The moving part. Three soft masses low on the screen, drifting on
			    unrelated periods so the light at the bottom is never quite the same
			    twice.
			    ⚠️ They paint OVER the wave's gradients, not under them — a child
			    always paints above its parent's background. That is fine and in fact
			    wanted: the clouds are low and the wave's veil is high, so they never
			    meet, and the crest reads as the fixed edge of moving water. */}
			<div className="onboard-clouds">
				<span className="onboard-cloud" />
				<span className="onboard-cloud" />
				<span className="onboard-cloud" />
			</div>
		</div>
	);
}

/**
 * 🔴 EVERY selectable thing in onboarding is this control, and nothing else is.
 *
 * The three question cards each grew their own: the work card used a flat tinted
 * cell, the path card a bordered panel, the module card a borderless row. All
 * three do exactly the same job — offer a thing you can pick — so three
 * treatments taught the person nothing except that the screens were built at
 * different times. Consistency here is not tidiness; it is what lets somebody
 * learn the flow once on card two and stop reading controls after that.
 *
 * ⚠️ The right-hand slot is ALWAYS occupied, by a tick, a lock, or a spacer of
 * the same size. Collapsing it when unselected shifts the label sideways the
 * instant you choose, which reads as the layout flinching.
 */
function Option({
	label,
	detail,
	note,
	selected = false,
	locked = false,
	held = false,
	onClick,
}: {
	label: string;
	detail?: string;
	/** Why this one is behaving differently. Shown under the detail. */
	note?: string;
	selected?: boolean;
	/** Not built yet. Cannot be chosen at all. */
	locked?: boolean;
	/**
	 * Chosen, and cannot be un-chosen while something else needs it.
	 *
	 * 🔴 This state used to be INVISIBLE. `toggleModule` silently refused to
	 * remove a module another selected module depends on, so the row absorbed the
	 * click and nothing happened — no movement, no message, nothing to read. The
	 * only conclusion available to the person is that the product is broken, and
	 * the only move left is to click it again harder.
	 */
	held?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={locked}
			onClick={onClick}
			aria-disabled={held || undefined}
			// 🔴 A chosen option is FILLED. `--ob-fill` is ICE on slate and deep
			// glacier on snow, with `--ob-fill-ink` as its partner — the same pair
			// the primary button uses, so "this is the active thing" looks identical
			// everywhere in the flow.
			style={
				selected
					? {
							backgroundColor: "var(--ob-fill)",
							borderColor: "var(--ob-fill)",
							color: "var(--ob-fill-ink)",
						}
					: undefined
			}
			className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 disabled:opacity-25 ${
				held ? "cursor-default" : ""
			} ${selected ? "" : "border-[var(--ob-line)] hover:bg-[var(--ob-hover-bg)]"}`}
		>
			<span className="min-w-0">
				{/* 🔴 `--ob-mark`, not ICE. ICE is a pale blue-white: right as the
				    brightest thing on slate, and very nearly invisible on glacier — a
				    selected option was rendering white text on a white card. The token
				    is ICE in dark and deep glacier in light: the same job done from
				    each end of the palette. */}
				<span
					className={`block font-body font-light text-[0.9375rem] leading-[1.3] ${selected ? "" : "text-[var(--ob-ink-70)]"}`}
				>
					{label}
				</span>
				{detail ? (
					<span
						className={`mt-1 block font-body font-light text-[0.8125rem] leading-[1.4] ${
							selected ? "opacity-65" : "text-[var(--ob-ink-35)]"
						}`}
					>
						{detail}
					</span>
				) : null}
				{note ? (
					<span
						className={`mt-1.5 block font-body font-light text-[0.75rem] leading-[1.35] ${
							selected ? "opacity-80" : "text-[var(--ob-ink-45)]"
						}`}
					>
						{note}
					</span>
				) : null}
			</span>
			{locked ? (
				<Lock size={15} className="mt-0.5 shrink-0 text-[var(--ob-ink-25)]" />
			) : selected ? (
				// Phosphor defaults `color` to `currentColor`, so the class carries it
				// and the icon can never disagree with the label beside it.
				// Phosphor defaults `color` to `currentColor`, so the class carries it
				// and the tick can never disagree with the label beside it.
				<Check
					size={15}
					weight="bold"
					className={`mt-0.5 shrink-0 ${held ? "opacity-40" : ""}`}
				/>
			) : (
				<span aria-hidden="true" className="mt-0.5 size-[15px] shrink-0" />
			)}
		</button>
	);
}

/**
 * 🔴 ONE WIDTH FOR EVERY CARD. The width is what makes it a deck — the ghost
 * layers line up with the live card's edges, and a card that changed width would
 * shear off the stack behind it and break the illusion in one frame.
 *
 * ⚠️ Height is NOT fixed, and was. Holding every card to one height padded the
 * short ones with dead space below their content, which reads as a card waiting
 * for something that never arrives. Height follows the content; the stack still
 * reads because the edges either side never move.
 */
const CARD_WIDTH = "52rem";

/**
 * One shell for every step, so five screens are one object rather than five.
 *
 * ⚠️ There is no "Continue". Every step moves on the same pair — Back on the
 * left, Next on the right, each carrying the chevron that says which way it
 * goes. A per-step verb made every card's footer a slightly different shape and
 * gave somebody something new to read on a control they had already learned.
 */
/**
 * Whether a scrollable area has anything hidden above or below it.
 *
 * ⚠️ Measured, not assumed. Masking both edges unconditionally fades the first
 * and last line of content that fits perfectly well, which reads as a rendering
 * fault rather than an affordance. The mask appears only on a side that
 * genuinely has more behind it.
 *
 * The observer watches the CHILDREN too: the module list arrives from a query
 * after first paint, so measuring the container alone would decide there is
 * nothing to scroll and never revisit it.
 */
function useScrollEdges<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [edges, setEdges] = useState({ top: false, bottom: false });

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const measure = () => {
			const overflow = node.scrollHeight - node.clientHeight;
			setEdges((current) => {
				const next = {
					top: node.scrollTop > 2,
					bottom: overflow > 2 && node.scrollTop < overflow - 2,
				};
				return current.top === next.top && current.bottom === next.bottom
					? current
					: next;
			});
		};
		measure();
		node.addEventListener("scroll", measure, { passive: true });
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		for (const child of node.children) observer.observe(child);
		return () => {
			node.removeEventListener("scroll", measure);
			observer.disconnect();
		};
	});

	return { ref, edges };
}

/** "Orders", "Orders and Shipping", "Orders, Shipping and Payments". */
function listNames(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? "";
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * How many modules stagger before they all land together.
 *
 * ⚠️ Past about a dozen the stagger stops reading as assembly and starts reading
 * as a queue — and a workspace with twenty modules would keep somebody waiting
 * on an animation they have already finished reading.
 */
const STAGGER_CAP = 10;

/**
 * Light / Dark / System, as one control with a thumb that slides.
 *
 * 🔴 It is a real control again. It was pulled out because `ThemeProvider` was
 * never mounted in this app, so `setTheme` was the context default — a literal
 * no-op — and because `--console-*` had no light values, so even a working
 * provider would have flipped the ramp and left the shell black. Both are fixed:
 * the provider is mounted in `__root.tsx` and `theme.css` now defines the
 * console under `:root:not(.dark)`.
 *
 * ⚠️ The thumb is ONE element that moves between three slots, not three
 * backgrounds fading in and out. A crossfade tells you the state changed; a
 * thumb that travels tells you WHERE it went, which is the whole reason a
 * segmented control beats three buttons.
 *
 * `layoutId` is what makes that work across separate children — Motion measures
 * the element in its old position and its new one and animates the difference,
 * so the movement is correct at any width without a single hard-coded offset.
 */
function ThemeSwitch() {
	const { theme, setTheme } = useTheme();
	const options = ["light", "dark", "system"] as const;

	return (
		<div>
			<span className="mb-2 block font-body font-light text-[0.75rem] text-[var(--ob-ink-35)]">
				Appearance
			</span>
			{/* ⚠️ Sized to its labels, not to the grid. Three short words do not need
			    half a card, and a control stretched to fill a column reads as more
			    important than the fields above it. */}
			<div className="relative inline-flex h-11 items-center gap-1 rounded-full border border-[var(--ob-line)] bg-[var(--ob-field-bg)] p-1">
				{options.map((option) => {
					const active = theme === option;
					return (
						<button
							key={option}
							type="button"
							onClick={() => setTheme(option)}
							className="relative h-full rounded-full px-4 font-body font-light text-[0.8125rem] capitalize outline-none"
						>
							{active ? (
								<motion.span
									layoutId="theme-thumb"
									/**
									 * 🔴 No entrance. `layoutId` animates an element from where
									 * the previous one WAS — and on the very first render there
									 * is no previous one, so Motion measures against the card
									 * mid-slide and the thumb flies in from the top of the card
									 * to its slot. `initial={false}` says: the first position is
									 * simply the position, animate only from the second onwards.
									 */
									initial={false}
									style={{ backgroundColor: "var(--ob-fill)" }}
									className="absolute inset-0 rounded-full"
									transition={{
										type: "spring",
										stiffness: 420,
										damping: 34,
									}}
								/>
							) : null}
							{/* Above the thumb, and its colour flips with the state. */}
							<span
								className={`relative z-10 transition-colors duration-200 ${
									active
										? "text-[var(--ob-fill-ink)]"
										: "text-[var(--ob-ink-45)] hover:text-[var(--ob-ink)]"
								}`}
							>
								{option}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/**
 * How a card leaves and how the next one arrives.
 *
 * 🔑 A straight horizontal SLIDE and nothing else. The first version added a
 * rotation, a scale and a vertical drop to suggest a card being flicked off a
 * pile, and all three fought each other — what you saw was a small shape
 * wobbling, not a card moving. One axis reads as one movement.
 *
 * ⚠️ Direction is the whole point: Next sends the old card LEFT and brings the
 * new one in from the RIGHT; Back does the reverse. That is what makes the deck
 * feel like a place you are moving through rather than a series of screens.
 *
 * The travel is far enough to clear the card and the fade finishes before it
 * would reach anything else, so nothing has to be clipped — clipping would take
 * the shadow and the tracer's glow with it.
 */
/**
 * 🔴 ONE spring for the slide AND the height.
 *
 * They are the same movement seen from two directions. Given separate curves —
 * or worse, one animated and the other snapping — the card arrives before the
 * box around it has finished resizing, and the footer visibly settles after the
 * content it belongs to.
 */
const DECK_SPRING = {
	type: "spring",
	stiffness: 380,
	// ⚠️ Damped hard enough not to overshoot. A card that springs PAST its
	// resting width and comes back reintroduces exactly the wobble that removing
	// the rotation and scale was meant to fix.
	damping: 42,
	mass: 0.8,
} as const;

const SLIDE = {
	enter: (direction: number) => ({ x: direction * 340, y: "-50%", opacity: 0 }),
	settled: { x: 0, y: "-50%", opacity: 1 },
	leave: (direction: number) => ({
		x: direction * -340,
		y: "-50%",
		opacity: 0,
	}),
};

/**
 * Every country, as ISO 3166-1 alpha-2 codes.
 *
 * 🔑 CODES ONLY, because everything else is derivable. `Intl.DisplayNames`
 * turns each into a name in the reader's own language, and the flag is computed
 * from the two letters directly. A hand-written list of names would be English
 * forever and would need maintaining every time a country renames itself.
 */
const COUNTRY_CODES =
	"AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GH GI GL GM GN GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW".split(
		" ",
	);

/**
 * The flag, computed rather than stored.
 *
 * ⚠️ A flag emoji is just the country's two letters written in REGIONAL
 * INDICATOR symbols, which sit at U+1F1E6 + (letter - 'A'). So `CA` is
 * 🇨 + 🇦, and the font pairs them. No image, no sprite sheet, no table — and it
 * stays correct for any code added later.
 */
function flagOf(code: string): string {
	return String.fromCodePoint(
		...[...code.toUpperCase()].map(
			(letter) => 0x1f1e6 + letter.charCodeAt(0) - 65,
		),
	);
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** The languages the product could plausibly be read in, widest first. */
const LANGUAGE_CODES =
	"en es fr de pt it nl pl sv da no fi cs el tr ru uk ar he hi bn ur fa id ms th vi ja ko zh".split(
		" ",
	);

/**
 * A searchable list behind a popover trigger.
 *
 * ⚠️ One component for country, language and time zone. They differ only in
 * what a row looks like, so three near-identical pickers would be three places
 * for the search behaviour to drift apart.
 */
function PickerList({
	options,
	current,
	onPick,
	render,
	placeholder,
}: {
	options: readonly string[];
	current: string;
	onPick: (value: string) => void;
	render: (value: string) => React.ReactNode;
	placeholder: string;
}) {
	const [query, setQuery] = useState("");
	const terms = query.trim().toLowerCase();
	const matches = options
		.filter((option) =>
			`${option} ${labelFor(option)}`.toLowerCase().includes(terms),
		)
		.slice(0, 60);

	/**
	 * 🔴 Dressed in onboarding's OWN tokens and geometry, not the console's.
	 *
	 * It was built from `--ink-*` and `rgb(var(--console-ink)/…)` at 12px in
	 * `rounded-md`, which is the console's language — so it ignored the light
	 * theme entirely and arrived as a small square dropdown hanging off a large
	 * pill-shaped field. A popover is part of the control that opened it: if the
	 * field is a pill at 15px, its list cannot be a 12px rectangle.
	 *
	 * ⚠️ The search box matches the FIELDS, not the rows. It is an input, and the
	 * one thing a person needs to recognise instantly when a list of four hundred
	 * opens is where to type.
	 */
	return (
		<div className="flex max-h-[23rem] min-h-0 flex-1 flex-col">
			<input
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder={placeholder}
				className="mb-1.5 h-11 w-full shrink-0 rounded-full border border-[var(--ob-line)] bg-[var(--ob-field-bg)] px-4 font-body font-light text-[0.9375rem] text-[var(--ob-ink)] outline-none transition-colors duration-300 placeholder:text-[var(--ob-ink-25)] focus:border-[var(--ob-line-focus)]"
			/>
			<div className="ob-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
				{matches.length === 0 ? (
					<p className="px-3 py-4 font-body font-light text-[0.875rem] text-[var(--ob-ink-35)]">
						Nothing matches that.
					</p>
				) : (
					matches.map((option) => {
						const chosen = option === current;
						return (
							<button
								key={option}
								type="button"
								onClick={() => onPick(option)}
								style={chosen ? { color: "var(--ob-mark)" } : undefined}
								className={`flex h-12 w-full shrink-0 items-center gap-2 rounded-full px-4 font-body font-light text-[0.9375rem] transition-colors ${
									chosen
										? "bg-[var(--ob-sel-bg)]"
										: "text-[var(--ob-ink-70)] hover:bg-[var(--ob-hover-bg)]"
								}`}
							>
								<span className="flex-1 truncate text-left">
									{render(option)}
								</span>
								{chosen ? (
									<Check
										size={14}
										weight="bold"
										className="shrink-0 text-[var(--ob-mark)]"
									/>
								) : null}
							</button>
						);
					})
				)}
			</div>
		</div>
	);
}

/** Whatever a value is called, for searching. */
function labelFor(value: string): string {
	if (/^[A-Z]{2}$/.test(value)) return countryNames.of(value) ?? value;
	if (value.includes("/")) return value.replace(/_/g, " ");
	return languageNames.of(value) ?? value;
}

/** A popover trigger that looks like the text fields beside it. */
function PickerField({
	label,
	hint,
	display,
	children,
}: {
	label: string;
	hint?: string;
	display: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div>
			<span className="mb-2 block font-body font-light text-[0.75rem] text-[var(--ob-ink-35)]">
				{label}
				{hint ? (
					<span className="ml-1.5 text-[var(--ob-ink-25)]">{hint}</span>
				) : null}
			</span>
			<Popover>
				<PopoverTrigger
					aria-label={label}
					className="flex h-11 w-full items-center gap-2 rounded-full border border-[var(--ob-line)] bg-[var(--ob-field-bg)] px-4 text-left font-body font-light text-[0.9375rem] text-[var(--ob-ink)] outline-none transition-colors duration-300 hover:border-[var(--ob-line-hover)] focus-visible:border-[var(--ob-line-focus)]"
				>
					<span className="min-w-0 flex-1 truncate">{display}</span>
					<CaretDown size={12} className="shrink-0 text-[var(--ob-ink-35)]" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					sideOffset={6}
					// 🔴 Keeps the panel inside the window instead of letting it flip.
					// The card is vertically centred and tall, so the lower fields sit
					// close to the bottom edge; a 23rem panel did not fit beneath them,
					// Radix flipped it above the field, and the search box — pinned to
					// the panel's top — landed near the top of the screen, a long way
					// from the control that opened it.
					collisionPadding={16}
					style={{
						// The exact room left between the trigger and the window edge, so
						// the panel SHRINKS to fit rather than moving somewhere it fits.
						maxHeight: "var(--radix-popover-content-available-height)",
						boxShadow: "var(--ob-card-shadow)",
						backgroundImage: "var(--ob-sheen)",
					}}
					// ⚠️ `rounded-2xl` to match the card and `p-2` so the rows are not
					// pressed against the edge. The default here was `rounded-md`, which
					// is the console's radius — half the card's, and visibly a different
					// component hanging off the same field.
					className="flex w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-[1.75rem] border-[var(--ob-card-line)] bg-[var(--ob-card)] p-2.5"
				>
					{children}
				</PopoverContent>
			</Popover>
		</div>
	);
}

/**
 * A labelled text field.
 *
 * 🔴 DEFINED AT MODULE SCOPE, and it has to be.
 *
 * It was declared inside `OnboardingPage`'s body, which meant every keystroke
 * re-rendered the page, produced a NEW function identity for this component, and
 * so made React unmount the old input and mount a fresh one. The DOM node the
 * cursor was in stopped existing — you could type exactly one character before
 * losing focus, every time.
 *
 * ⚠️ The rule is general: a component declared inside another component's render
 * is a different component on every render. Never define one there.
 */
function Field({
	label,
	value,
	onChange,
	placeholder,
	hint,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
	placeholder: string;
	hint?: string;
}) {
	return (
		<label className="block">
			<span className="mb-2 block font-body font-light text-[0.75rem] text-[var(--ob-ink-35)]">
				{label}
				{hint ? (
					<span className="ml-1.5 text-[var(--ob-ink-25)]">{hint}</span>
				) : null}
			</span>
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="h-11 w-full rounded-full border border-[var(--ob-line)] bg-[var(--ob-field-bg)] px-4 font-body font-light text-[0.9375rem] text-[var(--ob-ink)] outline-none transition-colors duration-300 placeholder:text-[var(--ob-ink-25)] focus:border-[var(--ob-line-focus)]"
			/>
		</label>
	);
}

/**
 * Every time zone the runtime knows, with the current one guaranteed present.
 *
 * ⚠️ `supportedValuesOf` is not universal. Where it is missing the list falls
 * back to the detected zone alone — which still leaves the field correct and
 * submittable, just not browsable. A hand-maintained list of four hundred zones
 * would be wrong within a year; the IANA database changes every few months.
 */
function zoneOptions(current: string): string[] {
	const supported =
		typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("timeZone")
			: [];
	return supported.includes(current) ? supported : [current, ...supported];
}

/** How far the fade reaches in from a scrollable edge. */
const FADE = "1.75rem";

function NextButton({
	label = "Next",
	onClick,
	href,
	disabled,
}: {
	label?: string;
	onClick?: () => void;
	href?: string;
	disabled?: boolean;
}) {
	const shared =
		"ms-auto inline-flex h-9 items-center justify-center gap-1 rounded-full px-4 font-body font-normal text-[0.875rem] no-underline transition-opacity duration-300 ease-out hover:opacity-85 disabled:opacity-25";
	/* 🔴 The FILL token, not ICE. ICE is a pale blue-white: the brightest thing
	   available on slate, and very nearly the card itself on glacier. The token
	   is ICE in dark and deep glacier water with white on it in light — the same
	   relationship (strongest contrast against the surface) reached from each end
	   of the palette. */
	const tone = {
		backgroundColor: "var(--ob-fill)",
		color: "var(--ob-fill-ink)",
	};
	return href ? (
		<a href={href} style={tone} className={shared}>
			{label}
			<CaretRight className="size-3.5" weight="bold" />
		</a>
	) : (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			style={tone}
			className={shared}
		>
			{label}
			<CaretRight className="size-3.5" weight="bold" />
		</button>
	);
}

function DeckCard({
	stepKey,
	direction = 1,
	scrolls = true,
	tracer = false,
	title,
	subtitle,
	children,
	onBack,
	leftSlot,
	onSkip,
	skipLabel = "Skip setup",
	next,
	footNote,
	jumper,
}: {
	/**
	 * A light that runs the card's border. Only the arrival uses one — it is the
	 * one card with something to celebrate, and a flourish on every card is not a
	 * flourish.
	 */
	/** Which card this is. Changing it is what deals the next one. */
	stepKey: string;
	/** 1 going forward through the deck, -1 coming back. */
	direction?: 1 | -1;
	/**
	 * ⚠️ Off for a card whose content is FIXED and known to fit — the first one,
	 * which is a form. A form that scrolls inside a card hides fields behind an
	 * edge nobody has reason to suspect is there, and the fade marking that edge
	 * reads as the end of the card. A catalog of unknown length still scrolls; a
	 * form never should.
	 */
	scrolls?: boolean;
	tracer?: boolean;
	title: string;
	subtitle?: string;
	children?: React.ReactNode;
	/**
	 * ⚠️ Omitted on the FIRST card, where Back is still drawn but disabled. It
	 * used to be dropped entirely, which left one small button alone in a wide
	 * empty footer and made card one look like a different component. A greyed
	 * Back is understood everywhere and says plainly: this is the beginning.
	 */
	onBack?: () => void;
	/** Replaces Back on the last card, which has nothing behind it either. */
	leftSlot?: React.ReactNode;
	/** Absent where skipping would leave nothing behind. */
	onSkip?: () => void;
	skipLabel?: string;
	/**
	 * `label` is "Next" everywhere except the two cards that do something other
	 * than turn a page. `href` is for the last card, which leaves for the
	 * dashboard and must therefore be a real link, not a button that navigates.
	 */
	next?: {
		label?: string;
		onClick?: () => void;
		href?: string;
		disabled?: boolean;
	};
	/** Sits between the content and the footer. Errors go here. */
	footNote?: React.ReactNode;
	jumper?: React.ReactNode;
}) {
	/**
	 * 🔴 THE CARD CENTRES ITSELF, and that is the whole fix for the diagonal.
	 *
	 * A wrapper used to animate between the two cards' heights while the column
	 * centred it. Centring holds the MIDDLE still, so every height change moved
	 * the card's top and bottom — and that vertical drift, happening at the same
	 * time as the horizontal slide, is what read as diagonal. The variants were
	 * only ever moving x; the thing they were measured against was moving.
	 *
	 * Each card is now pinned to `top-1/2` and lifted by half its OWN height, so
	 * a card of any height centres on the same axis with nothing measured and
	 * nothing animated. Two cards of different heights share one centre line, so
	 * the slide is provably horizontal.
	 *
	 * ⚠️ The lift is `y: "-50%"` inside the VARIANTS, not a `-translate-y-1/2`
	 * class. Motion writes `transform` itself, so a Tailwind translate on the
	 * same element is overwritten the moment the animation starts and the card
	 * would drop half its height as it began to move.
	 */
	const scroll = useScrollEdges<HTMLDivElement>();
	/**
	 * 🔴 ONE gradient shape, only its two lengths change.
	 *
	 * This used to swap the colour of the end stops — `transparent 0` when there
	 * was more above, `#000 0` when there was not — which changes the gradient's
	 * STRUCTURE rather than its measurements. A browser cannot interpolate
	 * between two differently shaped masks, so it swaps them outright, and on a
	 * layer that is already being repainted by scrolling that swap lands as a
	 * hard edge instead of a fade. It showed on the top and not the bottom purely
	 * because the top is the stop that toggles while you are scrolling INTO it.
	 *
	 * Now both ends are always `transparent → #000`; when an edge has nothing
	 * hidden behind it the fade is simply `0px` long, which paints as fully
	 * opaque and needs no change of shape to get there.
	 */
	const fadeTop = scroll.edges.top ? FADE : "0px";
	const fadeBottom = scroll.edges.bottom ? FADE : "0px";
	const fade = `linear-gradient(to bottom, transparent 0, #000 ${fadeTop}, #000 calc(100% - ${fadeBottom}), transparent 100%)`;

	/**
	 * 🔴 `h-svh` with `overflow-hidden`, not `min-h-svh`.
	 *
	 * Onboarding is a deck, and a deck does not scroll. A card that can be pushed
	 * off the top of the window breaks the illusion of moving sideways through a
	 * stack, and the ghost layers end up floating in the middle of a long page.
	 *
	 * ⚠️ `svh`, never `vh`. On a phone `vh` is the tallest the viewport ever gets,
	 * so with the browser's chrome showing the page is already taller than the
	 * screen and scrolls before anything has been added to it.
	 *
	 * A card whose content genuinely cannot fit still scrolls INSIDE itself. That
	 * is the only scrolling this screen has.
	 */
	return (
		<div className="relative isolate h-svh overflow-hidden bg-[var(--ob-page)]">
			<Glow />
			{/* Product chrome, not decoration. Somebody has just arrived from
			    auth.quickdash.xyz and this says they are still in the same place.
			    Top-left because that is where a mark lives; centred over the deck it
			    would collide with the ghost cards peeling up behind the live one.
			    ⚠️ The MARK, not the lockup — it is the same artwork as the favicon
			    (both generated from `public/logo.svg` by `pnpm brand:sync`), so the
			    tab and the page agree. And at full strength: a mark faded to 20% is
			    not restraint, it reads as a placeholder that failed to load. */}
			<Logo
				aria-hidden="true"
				className="pointer-events-none absolute top-7 left-7 z-10 size-6 text-[var(--ob-logo)] sm:top-9 sm:left-9 sm:size-7"
			/>
			<main className="relative z-10 mx-auto flex h-full w-full flex-col items-center justify-center px-6 py-10">
				<div className="relative w-full" style={{ maxWidth: CARD_WIDTH }}>
					{/* The rest of the deck, peeled up behind the live card. It is the
					    only thing on screen that says there is more than one of these. */}
					<div
						aria-hidden="true"
						className="-translate-y-2.5 absolute inset-x-5 top-0 h-16 rounded-2xl border border-[var(--ob-line)] bg-[var(--ob-card)] opacity-70"
					/>
					<div
						aria-hidden="true"
						className="-translate-y-5 absolute inset-x-11 top-0 h-16 rounded-2xl border border-[var(--ob-line)] bg-[var(--ob-card)] opacity-40"
					/>

					{/*
					 * 🔴 `mode="popLayout"` is what makes this a SHUFFLE rather than a
					 * crossfade. Without it the outgoing card still occupies layout while
					 * it leaves, so the incoming one is pushed down the page and both
					 * slide together. Popped out of flow, the new card lands in the old
					 * one's place and the old one travels away over the top of it.
					 *
					 * ⚠️ `initial={false}` on the first render. Otherwise the very first
					 * card animates in from the deal position on page load, which reads
					 * as a glitch — nothing was there for it to replace.
					 */}
					{/*
					 * The wrapper owns the height and animates it; the cards inside are
					 * absolutely positioned so neither the arriving nor the departing one
					 * can push it around.
					 *
					 * ⚠️ `height: "auto"` until the first measurement, so the very first
					 * paint is the card's natural height rather than zero — otherwise the
					 * page opens collapsed and expands, which is the same jump moved to
					 * a worse moment.
					 */}
					<AnimatePresence mode="popLayout" custom={direction} initial={false}>
						<motion.div
							key={stepKey}
							custom={direction}
							variants={SLIDE}
							initial="enter"
							animate="settled"
							exit="leave"
							transition={DECK_SPRING}
							className="absolute inset-x-0 top-1/2"
						>
							<div
								style={{
									boxShadow: "var(--ob-card-shadow)",
									// ⚠️ `backgroundImage` over `backgroundColor`, so the sheen
									// layers on the card's own colour rather than replacing it.
									backgroundImage: "var(--ob-sheen)",
								}}
								className={`onboard-lit relative flex flex-col rounded-2xl bg-[var(--ob-card)] p-7 sm:p-8 ${
									tracer
										? "onboard-tracer overflow-hidden"
										: "border border-[var(--ob-card-line)]"
								}`}
							>
								{/* One pass of light, once, on arrival. Only the card with
								    something to celebrate gets it. */}
								{tracer ? (
									<span aria-hidden="true" className="onboard-sweep" />
								) : null}

								<h1 className="font-display font-light text-[clamp(1.375rem,3vw,1.75rem)] text-[var(--ob-ink)] leading-[1.15] tracking-[-0.02em]">
									{title}
								</h1>
								{subtitle ? (
									<p className="mt-2.5 font-body font-light text-[0.875rem] text-[var(--ob-ink-45)] leading-[1.5]">
										{subtitle}
									</p>
								) : null}

								{/* Takes the slack, so the footer sits on the bottom edge of a card
						    that is always the same height whatever is in it. */}
								{/* 🔑 The fade is a MASK, not an overlaid gradient. A gradient
						    would have to be painted in the card's own colour, so it would
						    be wrong the moment that colour changed, and it would sit over
						    the content and swallow the pointer. */}
								{scrolls ? (
									<div
										ref={scroll.ref}
										// 🔴 `pb-7` clears the fade. The mask eats the bottom
										// 1.75rem of the box, and with no padding the LAST row
										// sat in exactly that band — so scrolling to the end
										// still left it half dissolved, with nowhere further to
										// scroll to rescue it. The padding gives the fade empty
										// space to act on instead of content.
										className="ob-scroll max-h-[46vh] min-h-0 overflow-y-auto pt-6 pb-7"
										style={{ maskImage: fade, WebkitMaskImage: fade }}
									>
										{children}
									</div>
								) : (
									<div className="pt-6">{children}</div>
								)}

								{footNote ? <div className="pt-4">{footNote}</div> : null}

								{/* 🔴 No rule above it. A hairline is there to separate things that
						    would otherwise be confused for each other, and nothing on a card
						    this size is. Drawn on every card it just boxed the footer in. */}
								<div className="mt-5 flex items-center gap-3">
									{leftSlot ?? (
										<button
											type="button"
											onClick={onBack}
											disabled={!onBack}
											className="-ms-2 inline-flex h-9 items-center gap-1 rounded-full px-3 font-body font-light text-[0.875rem] text-[var(--ob-ink-45)] transition-colors duration-200 hover:text-[var(--ob-ink)] disabled:pointer-events-none disabled:text-[var(--ob-ink-15)]"
										>
											<CaretLeft className="size-3.5" weight="bold" />
											Back
										</button>
									)}
									{next ? <NextButton {...next} /> : null}
								</div>
							</div>

							{/* 🔴 Outside the card, and quiet. Skipping leaves onboarding
							    without a workspace — a real state, but not one to invite.
							    ⚠️ `top-full` so it hangs off the CARD's bottom edge, which
							    moves with the card's height. Left in the container it would
							    land on the screen's centre line, on top of the card. */}
							{onSkip ? (
								<div className="absolute inset-x-0 top-full mt-5 text-center">
									<button
										type="button"
										onClick={onSkip}
										className="font-body font-light text-[0.8125rem] text-[var(--ob-ink-35)] transition-colors duration-200 hover:text-[var(--ob-ink-70)]"
									>
										{skipLabel}
									</button>
								</div>
							) : null}
						</motion.div>
					</AnimatePresence>
				</div>
				{jumper}
			</main>
		</div>
	);
}

function _Tertiary({
	children,
	onClick,
	href,
}: {
	children: React.ReactNode;
	onClick?: () => void;
	href?: string;
}) {
	const className =
		"mt-4 inline-block font-body font-light text-[0.8125rem] text-[var(--ob-ink-45)] no-underline transition-colors duration-200 hover:text-[var(--ob-ink)] hover:underline underline-offset-4";
	return href ? (
		<a href={href} className={className}>
			{children}
		</a>
	) : (
		<button type="button" onClick={onClick} className={className}>
			{children}
		</button>
	);
}

/**
 * Dev-only step navigation.
 *
 * ⚠️ Onboarding is a one-way flow by design: each step is only reachable by
 * completing the one before it, and `success` needs a workspace that was really
 * created. That makes reviewing the screens almost impossible without signing up
 * repeatedly and truncating the database between attempts, which is how screens
 * end up shipped unlooked-at.
 *
 * 🔴 `import.meta.env.DEV` is a BUILD-TIME constant. Vite substitutes `false` in
 * a production build and the bundler removes this component and every call to it
 * entirely — there is no runtime path to it and no flag that turns it on. Do not
 * swap it for an env var or a query parameter.
 *
 * It jumps between steps WITHOUT creating anything, so the later screens render
 * against whatever state has been filled in so far. That is deliberate: seeing a
 * step with empty state is how you find the empty state.
 */
const STEPS: Step[] = [
	"name",
	"work",
	"role",
	"path",
	"modules",
	"review",
	"success",
];

function StepJumper({
	step,
	onJump,
}: {
	step: Step;
	onJump: (next: Step) => void;
}) {
	if (!import.meta.env.DEV) return null;

	return (
		<div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-1.5 border-white/10 border-t bg-black/85 px-4 py-2 backdrop-blur-sm">
			<span className="mr-1 font-mono text-[10px] text-white/30 uppercase tracking-[0.12em]">
				dev only
			</span>
			{STEPS.map((candidate) => (
				<button
					key={candidate}
					type="button"
					onClick={() => onJump(candidate)}
					className={`rounded-full px-3 py-1 font-mono text-[11px] transition-colors ${
						candidate === step
							? "bg-white text-black"
							: "text-white/45 hover:bg-white/10 hover:text-white"
					}`}
				>
					{candidate}
				</button>
			))}
		</div>
	);
}

function OnboardingPage() {
	const queryClient = useQueryClient();
	const [step, setStep] = useState<Step>("name");
	/**
	 * Which way through the deck the last move went.
	 *
	 * ⚠️ Derived from STEPS rather than set by hand at each call site. Thirty-odd
	 * `setStep` calls would each have had to remember to say which way they were
	 * going, and the one that forgot would deal a card backwards.
	 */
	const [direction, setDirection] = useState<1 | -1>(1);
	const navigate = (next: Step) => {
		setDirection(STEPS.indexOf(next) >= STEPS.indexOf(step) ? 1 : -1);
		setStep(next);
	};
	const [businessName, setBusinessName] = useState("");

	/**
	 * The person behind the login, prefilled from the session.
	 *
	 * `null` means untouched, so whatever the session already knows shows through
	 * until somebody edits it — which is why these cannot simply be initialised
	 * from `sessionUser`: the session resolves after first render and a state
	 * initialiser only runs once, so the fields would stay empty for anyone who
	 * already has a name.
	 *
	 * ⚠️ The split is seeded from `name` for anyone who arrived through Google or
	 * GitHub, which hand back one string. Splitting on the FIRST space only:
	 * everything after it is the surname, so "Ada Byron Lovelace" keeps
	 * "Byron Lovelace" together rather than losing a middle name.
	 */
	const { data: sessionData } = useSession();
	const sessionUser = sessionData?.user;
	const [firstName, setFirstName] = useState<string | null>(null);
	const [lastName, setLastName] = useState<string | null>(null);
	const [nickname, setNickname] = useState<string | null>(null);
	const sessionSplit = (sessionUser?.name ?? "").trim().split(/\s+(.*)/);
	const first = firstName ?? sessionUser?.firstName ?? sessionSplit[0] ?? "";
	const last = lastName ?? sessionUser?.lastName ?? sessionSplit[1] ?? "";
	const nick = nickname ?? sessionUser?.nickname ?? "";

	/**
	 * 🔑 Detected, never asked. Every date the product renders or EMAILS is
	 * otherwise resolved from whichever browser happens to be open — which is
	 * nothing at all for a receipt sent by a cron job. The browser already knows
	 * the answer, so making somebody pick from a list of four hundred zones would
	 * be asking a question we can answer ourselves.
	 */
	const resolved = Intl.DateTimeFormat().resolvedOptions();
	const [zone, setZone] = useState<string | null>(null);
	const [countryCode, setCountry] = useState<string | null>(null);
	const [languageCode, setLanguage] = useState<string | null>(null);
	const timezone = zone ?? sessionUser?.timezone ?? resolved.timeZone;
	/**
	 * ⚠️ Both halves come from the browser's own resolved locale, then are SPLIT
	 * — `en-CA` gives `en` and `CA`. They are stored separately because they vary
	 * independently: somebody in Montreal may want French dates on Canadian
	 * paper. The literals are a last resort, for a browser reporting a bare
	 * language with no region.
	 */
	const detected = new Intl.Locale(resolved.locale).maximize();
	const country =
		countryCode ?? sessionUser?.country ?? detected.region ?? "US";
	const language =
		languageCode ?? sessionUser?.language ?? detected.language ?? "en";

	const [recipe, setRecipe] = useState<Recipe | null>(null);
	const [roleId, setRoleId] = useState<RoleId | null>(null);
	const role = ROLES.find((entry) => entry.id === roleId) ?? null;
	/**
	 * What the two questions add up to. The kind of work sets the base; the role
	 * adds what that part of a business reaches for. Order matters only in that
	 * the role can add to the recipe and never take away from it.
	 */
	const suggestedModules = [
		...new Set([
			...(recipe ? recipe.modules : FOUNDATION),
			...(role?.adds ?? []),
		]),
	];
	const [setupChoice, setSetupChoice] = useState<SetupChoice | null>(null);
	const setupChoiceWasManual = setupChoice === "manual";
	/**
	 * 🔴 EMPTY, not seeded.
	 *
	 * `FOUNDATION` used to be pre-ticked here, and four modules arriving already
	 * chosen reads as a requirement rather than a suggestion — nobody unticks a
	 * box the product ticked for them. Choosing is now genuinely the user's, and
	 * `FOUNDATION` survives as the fallback for the guided path when the answer
	 * to "what kind of work" matches no recipe.
	 */
	const [moduleIds, setModuleIds] = useState<readonly string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [description, _setDescription] = useState(
		Route.useSearch().prompt?.slice(0, 500) ?? "",
	);
	const [_recommendationReason, setRecommendationReason] = useState<
		string | null
	>(null);
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);

	const catalog = useQuery({
		queryKey: ["account", "module-catalog"],
		queryFn: async () =>
			(await api.request<{ items: CatalogModule[] }>("/account/module-catalog"))
				.data.items,
	});
	/**
	 * The person's name, saved on the way past.
	 *
	 * 🔴 Why onboarding asks at all: the signup surface is email code, Google,
	 * GitHub and passkey, and only the two OAuth providers hand back a name.
	 * Everybody who signs up with a code or a passkey has an EMPTY one, and
	 * `console-shell.tsx` renders `name || "Account"` — so QuickDash greets them
	 * as "Account". It reaches further than the sidebar: the signup hook names
	 * their personal organization `user.name ?? user.email`, so a nameless user
	 * gets an organization named after their email address.
	 *
	 * ⚠️ The NAME only. Pictures belong in Account → Settings → Profile, where
	 * there is room to frame them and no cost to completion; onboarding asks for
	 * the one thing the product cannot work without.
	 *
	 * Failure is deliberately NOT fatal. A workspace is the thing somebody came
	 * here for, and refusing to continue because a display name would not save
	 * would be losing the transaction over the receipt. It is recoverable in
	 * settings, and the next card can create the workspace regardless.
	 */
	const saveName = useMutation({
		mutationFn: () =>
			api.request("/account/profile", {
				method: "PATCH",
				body: {
					firstName: first.trim(),
					lastName: last.trim(),
					// `null` clears it; the product falls back to the first name.
					nickname: nick.trim() || null,
					timezone,
					country,
					language,
				},
			}),
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: ["account"] });
			navigate("work");
		},
	});

	const create = useMutation({
		mutationFn: () =>
			api.request<{ id: string }>("/account/workspaces", {
				method: "POST",
				body: {
					name: businessName,
					businessType: recipe?.id ?? "custom",
					moduleIds,
					completeOnboarding: true,
				},
			}),
		onSuccess: async ({ data: workspace }) => {
			await queryClient.invalidateQueries({ queryKey: ["account"] });
			setWorkspaceId(workspace.id);
			navigate("success");
		},
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "We couldn't create your workspace. Nothing was partially saved.",
			),
	});
	const _recommend = useMutation({
		mutationFn: () =>
			api.request<{
				recipeId: string;
				moduleIds: readonly string[];
				rationale: string;
				source: "ai" | "catalog-fallback";
			}>("/account/onboarding/recommend", {
				method: "POST",
				body: {
					description,
					recipes: RECIPES.map((candidate) => ({
						id: candidate.id,
						name: candidate.name,
						category: candidate.category,
						keywords: candidate.keywords,
						moduleIds: candidate.modules,
					})),
				},
			}),
		onSuccess: ({ data }) => {
			setRecipe(findRecipe(data.recipeId) ?? null);
			setModuleIds(data.moduleIds);
			setRecommendationReason(
				data.source === "ai"
					? data.rationale
					: `${data.rationale} QuickDash used its built-in business catalog because an AI provider was not available.`,
			);
			setSetupChoice("ai");
			navigate("review");
		},
		onError: (cause) =>
			setError(
				cause instanceof Error && cause.message.includes("limit")
					? "You've reached the recommendation limit for now. Build it yourself or start with defaults."
					: "Recommendations are unavailable right now. Build it yourself or start with defaults.",
			),
	});

	/**
	 * The guided path. Takes the modules the chosen kind of work implies and goes
	 * straight to review — no picker, no decisions.
	 *
	 * ⚠️ Falls back to `FOUNDATION` only when no recipe was chosen, which happens
	 * when somebody skips the work question entirely.
	 */
	const startGuided = (chosen: Recipe | null = recipe) => {
		setRecipe(chosen);
		setRecommendationReason(null);
		setSetupChoice("defaults");
		setModuleIds([
			...new Set([
				...(chosen ? chosen.modules : FOUNDATION),
				...(role?.adds ?? []),
			]),
		]);
		navigate("review");
	};
	const _startManual = () => {
		setRecipe(null);
		setRecommendationReason(null);
		setSetupChoice("manual");
		setModuleIds(FOUNDATION);
		navigate("modules");
	};
	/**
	 * The selected modules that need this one, by name.
	 *
	 * ⚠️ Dependencies move in BOTH directions invisibly: choosing Orders silently
	 * ADDS Client records, and then Client records silently REFUSES to be
	 * removed. One line naming the dependency answers both at once — it says why
	 * the row appeared and why it will not go away.
	 */
	const heldBy = (id: string, modules: readonly CatalogModule[]) => {
		const byId = new Map(modules.map((module) => [module.id, module]));
		return moduleIds
			.filter(
				(selected) =>
					selected !== id && byId.get(selected)?.dependsOn.includes(id),
			)
			.map((selected) => byId.get(selected)?.name ?? selected);
	};

	const toggleModule = (id: string) => {
		const modules = catalog.data ?? [];
		const byId = new Map(modules.map((module) => [module.id, module]));
		const next = new Set(moduleIds);
		if (next.has(id)) {
			const required = [...next].some(
				(selected) =>
					selected !== id && byId.get(selected)?.dependsOn.includes(id),
			);
			if (!required) next.delete(id);
		} else {
			const add = (moduleId: string) => {
				if (next.has(moduleId)) return;
				next.add(moduleId);
				for (const dependency of byId.get(moduleId)?.dependsOn ?? [])
					add(dependency);
			};
			add(id);
		}
		setModuleIds([...next]);
	};

	if (step === "name") {
		const ready = first.trim() && last.trim() && businessName.trim();
		const go = () => {
			if (ready) saveName.mutate();
		};
		/**
		 * 🔴 The person's name is asked HERE rather than at signup, and it is not
		 * optional.
		 *
		 * The signup surface is email code, Google, GitHub and passkey, and only
		 * the two OAuth providers hand back a name. Everybody who signs up with a
		 * code or a passkey has an EMPTY one, and `console-shell.tsx` renders
		 * `name || "Account"` — so QuickDash greets them as "Account". It reaches
		 * past the sidebar too: the signup hook names their personal organization
		 * `user.name ?? user.email`, so a nameless user ends up with an
		 * organization named after their email address.
		 *
		 * ⚠️ Shown even when the session already has a name, rather than appearing
		 * only for the people missing one. A card whose shape depends on which
		 * button somebody pressed at signup is a card nobody can be taught, and a
		 * prefilled field costs a glance.
		 *
		 * ⚠️ Everything else a profile can hold — picture, banner, and later a bio
		 * and links — is in Account settings. This card carries the fields the
		 * product cannot work without, and nothing else: every extra field here is
		 * paid for in completion.
		 */
		return (
			<DeckCard
				scrolls={false}
				title="Let's get you set up"
				subtitle="Who you are, and what the business is called."
				next={{ onClick: go, disabled: !ready || saveName.isPending }}
				stepKey={step}
				direction={direction}
				jumper={<StepJumper step={step} onJump={navigate} />}
			>
				{/*
				 * The person on top, the business under them, preferences last.
				 *
				 * 🔑 Business name spans BOTH columns rather than sitting beside the
				 * nickname. It is the only field here that is not about the person, and
				 * giving it its own full-width row separates the two subjects without
				 * needing a heading to say so.
				 */}
				<form
					className="grid gap-x-4 gap-y-4 sm:grid-cols-2"
					onSubmit={(event) => {
						event.preventDefault();
						go();
					}}
				>
					<Field
						label="First name"
						value={first}
						onChange={setFirstName}
						placeholder="Ada"
					/>
					<Field
						label="Last name"
						value={last}
						onChange={setLastName}
						placeholder="Lovelace"
					/>

					<div className="sm:col-span-2">
						<Field
							label="Business name"
							value={businessName}
							onChange={setBusinessName}
							placeholder="Kestrel Audio"
						/>
					</div>

					{/* 🔑 A separate field, not a nicety. `name` is what the product
					    calls somebody when it talks ABOUT them — on an invoice, in an
					    audit entry. This is what it calls them when it talks TO them.
					    Somebody called Alexander on both may still want "Morning, Alex". */}
					<Field
						label="What should we call you?"
						hint="optional"
						value={nick}
						onChange={setNickname}
						placeholder={first.trim() || "Ada"}
					/>

					<PickerField
						label="Country"
						display={
							<span className="flex items-center gap-2">
								<span aria-hidden="true">{flagOf(country)}</span>
								{countryNames.of(country) ?? country}
							</span>
						}
					>
						<PickerList
							options={COUNTRY_CODES}
							current={country}
							onPick={setCountry}
							placeholder="Search countries"
							render={(code) => (
								<span className="flex items-center gap-2">
									<span aria-hidden="true">{flagOf(code)}</span>
									{countryNames.of(code) ?? code}
								</span>
							)}
						/>
					</PickerField>

					{/*
					 * 🔴 A POPOVER, never a native `<select>`. A `<select>` renders the
					 * OPERATING SYSTEM's list — Aqua on a Mac, something else on
					 * Windows, a full-height drum on a phone — none of which can be
					 * styled. One OS control in a designed screen makes the whole screen
					 * read as a form somebody forgot to finish.
					 *
					 * ⚠️ Searchable, not merely scrollable: several hundred zones make a
					 * long scroll worse than the control it replaced.
					 */}
					<PickerField
						label="Time zone"
						hint="detected"
						display={timezone.replace(/_/g, " ")}
					>
						<PickerList
							options={zoneOptions(timezone)}
							current={timezone}
							onPick={setZone}
							placeholder="Search zones"
							render={(zone) => zone.replace(/_/g, " ")}
						/>
					</PickerField>

					<PickerField
						label="Language"
						display={languageNames.of(language) ?? language}
					>
						<PickerList
							options={LANGUAGE_CODES}
							current={language}
							onPick={setLanguage}
							placeholder="Search languages"
							render={(code) => languageNames.of(code) ?? code}
						/>
					</PickerField>

					<ThemeSwitch />
				</form>

				<p className="mt-5 font-body font-light text-[0.75rem] text-[var(--ob-ink-25)] leading-[1.5]">
					Your picture, banner and the rest of your profile are in Account
					settings whenever you want them.
				</p>
			</DeckCard>
		);
	}

	/**
	 * ONE routing question, and the only one this flow asks.
	 *
	 * 🔑 It earns its place because it visibly changes the very next screen — the
	 * modules it implies and the wording of the guided option. Research on 2026
	 * onboarding is blunt about the failure here: most products collect a role and
	 * a use case at signup and change nothing with either, so the question costs
	 * completion and buys nothing.
	 *
	 * ⚠️ CATEGORIES, not the 53 individual recipes. A list of 53 is a directory,
	 * and a directory is a decision. Ten named kinds of work is a choice.
	 *
	 * 🔴 Choosing does NOT advance. It used to, and a card that flips itself the
	 * instant you touch it takes the deck out of the person's hands — there is no
	 * moment to see what you picked, and a mis-tap is a step you have to undo.
	 * Selection marks; Next moves.
	 */
	if (step === "work") {
		const categories = [...new Set(RECIPES.map((entry) => entry.category))];
		return (
			<DeckCard
				title={`What kind of work is ${businessName || "it"}?`}
				subtitle="This decides what we suggest. Nothing is locked in."
				onBack={() => navigate("name")}
				onSkip={() => startGuided(null)}
				next={{ onClick: () => navigate("role"), disabled: !recipe }}
				stepKey={step}
				direction={direction}
				jumper={<StepJumper step={step} onJump={navigate} />}
			>
				<div className="grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
					{categories.map((category) => (
						<Option
							key={category}
							label={category}
							selected={recipe?.category === category}
							onClick={() =>
								setRecipe(
									RECIPES.find((entry) => entry.category === category) ?? null,
								)
							}
						/>
					))}
				</div>
			</DeckCard>
		);
	}

	if (step === "role") {
		return (
			<DeckCard
				title="And what do you do there?"
				subtitle="This adds the parts you'll actually be in. It changes what we suggest, nothing else."
				onBack={() => navigate("work")}
				onSkip={() => startGuided()}
				next={{ onClick: () => navigate("path"), disabled: !roleId }}
				stepKey={step}
				direction={direction}
				jumper={<StepJumper step={step} onJump={navigate} />}
			>
				<div className="grid gap-2 text-left sm:grid-cols-2">
					{ROLES.map((entry) => (
						<Option
							key={entry.id}
							label={entry.label}
							detail={entry.detail}
							selected={roleId === entry.id}
							onClick={() => setRoleId(entry.id)}
						/>
					))}
				</div>
			</DeckCard>
		);
	}

	/**
	 * The fork. Two ways forward, neither a sequence somebody is trapped in.
	 *
	 * 🔑 The guided option names what it will actually do — the modules, counted —
	 * rather than saying "recommended" and hoping.
	 */
	if (step === "path") {
		return (
			<DeckCard
				title="How do you want to set it up?"
				subtitle="Either way you end up in the same place, with the same freedom to change it."
				onBack={() => navigate("role")}
				onSkip={() => startGuided()}
				next={{
					onClick: () => {
						if (setupChoice === "manual") {
							setModuleIds(suggestedModules);
							navigate("modules");
							return;
						}
						startGuided();
					},
					disabled: !setupChoice,
				}}
				stepKey={step}
				direction={direction}
				jumper={<StepJumper step={step} onJump={navigate} />}
			>
				<div className="grid gap-2 sm:grid-cols-2">
					<Option
						label="Set it up for me"
						detail={`${suggestedModules.length} modules${recipe ? ` for ${recipe.name.toLowerCase()}` : ""}, ready to use.`}
						selected={setupChoice === "defaults"}
						onClick={() => setSetupChoice("defaults")}
					/>
					<Option
						label="Choose myself"
						detail="See everything and pick. Suggestions are already ticked."
						selected={setupChoice === "manual"}
						onClick={() => setSetupChoice("manual")}
					/>
				</div>
			</DeckCard>
		);
	}

	if (step === "modules") {
		const modules = catalog.data ?? [];
		return (
			<DeckCard
				title="What does it need?"
				subtitle="Turn anything on or off later. Nothing here is permanent."
				onBack={() => navigate("path")}
				onSkip={() => startGuided()}
				next={{
					onClick: () => navigate("review"),
					disabled: moduleIds.length === 0,
				}}
				stepKey={step}
				direction={direction}
				jumper={<StepJumper step={step} onJump={navigate} />}
			>
				{/* 🔑 The description is the point of this card for anyone who has not
				    used the product. "Inventory" means nothing; "Track available
				    stock" means everything. */}
				<div className="grid gap-2 text-left sm:grid-cols-2">
					{modules.map((module) => {
						const selected = moduleIds.includes(module.id);
						const held = selected ? heldBy(module.id, modules) : [];
						return (
							<Option
								key={module.id}
								label={module.name}
								detail={module.description}
								note={
									held.length > 0 ? `Needed by ${listNames(held)}` : undefined
								}
								selected={selected}
								locked={module.status === "upcoming"}
								held={held.length > 0}
								onClick={() => toggleModule(module.id)}
							/>
						);
					})}
				</div>
			</DeckCard>
		);
	}

	if (step === "success") {
		/**
		 * The arrival — and it is a CARD, like everything before it.
		 *
		 * 🔴 It was built uncarded on the reasoning that the other screens are
		 * cards because they ask for something and this one does not. That was
		 * wrong in practice: after four cards in a deck the card IS the flow, so
		 * dropping it at the finish reads as landing somewhere else entirely
		 * rather than as arriving. The last card is still a card.
		 *
		 * ⚠️ NOTHING BURSTS. A confetti cannon says "well done" about nothing in
		 * particular, every product does it, and it reads as decoration bolted onto
		 * a form. This card instead does what the product does: it REPORTS. The
		 * workspace comes online and each module reports ready in turn. The
		 * satisfaction is that it is the person's own decisions read back.
		 *
		 * 🔑 The workspace id is shown because it is genuinely needed — it is what
		 * goes in an env file and what the Connect page asks for — not because a
		 * monospace string looks technical.
		 */
		/**
		 * ⚠️ EVERY module, not the first eight.
		 *
		 * It used to truncate to eight and add "and 3 more", which meant the card
		 * never overflowed and so never scrolled — and a card that never scrolls
		 * never shows the edge fade every other card has. Worse, the manifest is
		 * the whole point of this screen: a list that stops short is not the thing
		 * you made read back to you, it is a preview of it. It scrolls now, inside
		 * the same masked container as the module picker.
		 */
		const stagger = (position: number) =>
			`${240 + Math.min(position, STAGGER_CAP) * 65}ms`;
		return (
			<DeckCard
				title={businessName || "Your workspace"}
				subtitle={`${
					recipe
						? `Configured for ${recipe.name.toLowerCase()}.`
						: "Configured and ready."
				} Everything here can be changed later.`}
				tracer
				leftSlot={
					/**
					 * 🔴 It pointed at DASH_URL, which is QuickDash's root — not the
					 * list of workspaces, and not even the same application. The two
					 * exits from this card go to two different places and the labels
					 * have to say which: this one stays in Account, the primary leaves
					 * for the dashboard.
					 *
					 * ⚠️ A router `Link`, not an `<a>`. Onboarding lives in the Account
					 * app, so this is an internal navigation — a full page load would
					 * throw away the session's warm query cache to arrive at a route
					 * the router could have rendered immediately.
					 */
					<Link
						to="/workspaces"
						className="font-body font-light text-[0.8125rem] text-[var(--ob-ink-35)] no-underline transition-colors duration-200 hover:text-[var(--ob-ink-70)]"
					>
						Manage in Account
					</Link>
				}
				next={{
					// The one control that leaves Account for QuickDash itself.
					label: `Open ${businessName || "workspace"}`,
					href: workspaceId
						? `${clientEnv.DASH_URL}/${workspaceId}`
						: clientEnv.DASH_URL,
				}}
				stepKey={step}
				direction={direction}
				jumper={<StepJumper step={step} onJump={navigate} />}
			>
				{/* The manifest. Dotted leaders because the eye needs a track to carry
				    it from a short module name across to the status on the right. */}
				<ul className="flex flex-col">
					{moduleIds.map((id, position) => (
						<li
							key={id}
							className="onboard-row flex items-baseline gap-3 py-[7px]"
							style={{ animationDelay: stagger(position) }}
						>
							<span className="font-body font-light text-[0.875rem] text-[var(--ob-ink-70)] capitalize">
								{id.replaceAll("-", " ")}
							</span>
							<span
								aria-hidden="true"
								className="-translate-y-[0.2em] min-w-6 flex-1 border-[var(--ob-line)] border-b border-dotted"
							/>
							<span
								style={{ color: "var(--ob-mark)" }}
								className="font-body font-light text-[0.6875rem] uppercase tracking-[0.14em]"
							>
								Ready
							</span>
						</li>
					))}
				</ul>

				{/* Real values, not chrome. The id is what an env file wants. */}
				{/* 🔴 Only the id is monospaced, and it is the one thing here that is a
				    machine string — something you copy into an env file or paste into
				    the Connect page. Setting the labels in mono too made the card read
				    as a terminal pretending to be a product. */}
				<dl
					className="onboard-in mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-body font-light text-[0.8125rem]"
					style={{ animationDelay: stagger(moduleIds.length + 2) }}
				>
					<div className="flex items-baseline gap-2">
						<dt className="text-[var(--ob-ink-35)]">Modules</dt>
						<dd
							className="text-[var(--ob-ink-70)]"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{moduleIds.length}
						</dd>
					</div>
					<div className="flex min-w-0 items-baseline gap-2">
						<dt className="shrink-0 text-[var(--ob-ink-35)]">Workspace ID</dt>
						<dd className="truncate font-mono text-[0.75rem] text-[var(--ob-ink-70)]">
							{workspaceId ?? "pending"}
						</dd>
					</div>
				</dl>
			</DeckCard>
		);
	}

	// The review card, and the last one before a workspace exists.
	return (
		<DeckCard
			title={`Ready to create ${businessName || "your workspace"}?`}
			subtitle="Nothing is charged. You can rename it, add modules or start again at any point."
			onBack={() => setStep(setupChoiceWasManual ? "modules" : "path")}
			onSkip={() => startGuided()}
			next={{
				// ⚠️ The one card whose Next is not called Next. Everywhere else the
				// button moves you; here it CREATES something, and hiding that behind
				// the same word would make the commit indistinguishable from a page
				// turn on the step where it matters most.
				label: create.isPending ? "Creating…" : "Create workspace",
				onClick: () => create.mutate(),
				disabled: create.isPending,
			}}
			footNote={
				// Reserved height, so the footer never jumps when a failure appears.
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
			}
			stepKey={step}
			direction={direction}
			jumper={<StepJumper step={step} onJump={navigate} />}
		>
			<dl className="flex flex-col text-left">
				<div className="flex items-baseline justify-between gap-6 py-1.5">
					<dt className="font-body font-light text-[0.8125rem] text-[var(--ob-ink-45)]">
						Workspace
					</dt>
					<dd className="font-body font-light text-[0.9375rem] text-[var(--ob-ink)]">
						{businessName || "Untitled"}
					</dd>
				</div>
				{role ? (
					<div className="flex items-baseline justify-between gap-6 py-1.5">
						<dt className="font-body font-light text-[0.8125rem] text-[var(--ob-ink-45)]">
							Your part in it
						</dt>
						<dd className="font-body font-light text-[0.9375rem] text-[var(--ob-ink)]">
							{role.label}
						</dd>
					</div>
				) : null}
				{recipe ? (
					<div className="flex items-baseline justify-between gap-6 py-1.5">
						<dt className="font-body font-light text-[0.8125rem] text-[var(--ob-ink-45)]">
							Set up for
						</dt>
						<dd className="font-body font-light text-[0.9375rem] text-[var(--ob-ink)]">
							{recipe.name}
						</dd>
					</div>
				) : null}
				<div className="flex items-baseline justify-between gap-6 py-1.5">
					<dt className="font-body font-light text-[0.8125rem] text-[var(--ob-ink-45)]">
						Modules
					</dt>
					<dd
						style={{ fontVariantNumeric: "tabular-nums" }}
						className="font-body font-light text-[0.9375rem] text-[var(--ob-ink)]"
					>
						{moduleIds.length}
					</dd>
				</div>
			</dl>

			<div className="mt-4 flex flex-wrap gap-1.5">
				{moduleIds.map((id) => (
					<span
						key={id}
						className="rounded-full border border-[var(--ob-line)] px-2.5 py-1 font-body font-light text-[0.75rem] text-[var(--ob-ink-45)] capitalize"
					>
						{id.replaceAll("-", " ")}
					</span>
				))}
			</div>
		</DeckCard>
	);
}

export const Route = createFileRoute("/onboarding")({
	validateSearch: z.object({ prompt: z.string().optional() }),
	component: OnboardingPage,
});
