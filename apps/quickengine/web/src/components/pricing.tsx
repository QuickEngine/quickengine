import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { GREY, ICE } from "@/components/pill";
import { formatPrice } from "@/lib/currency";
import { MODULES } from "@/lib/modules";
import {
	type Audience,
	type Cycle,
	formatLimit,
	TIER_ORDER,
	TIERS,
	type Tier,
} from "@/lib/pricing";
import { CARD } from "@/lib/surfaces";

/**
 * Pricing.
 *
 * 🔴 EVERYTHING ON THIS PAGE IS READ FROM DATA, never typed into the markup.
 * Tiers and limits come from `lib/pricing.ts` (which follows the ENFORCED
 * numbers in `packages/billing/src/plans.ts`), and module access comes from
 * `lib/modules.ts`. The previous version restated all of it inline, which is how
 * it ended up claiming every capability on every tier and every limit unlimited
 * while the metering engine enforced real ceilings.
 *
 * ⚠️ Never write the word "Unlimited" against a flat tier. Free, Launch, Grow and
 * Scale all have real caps that will actually cut somebody off.
 */

const CYCLES: { id: Cycle; label: string }[] = [
	{ id: "monthly", label: "Monthly" },
	{ id: "annual", label: "Annual" },
];

/**
 * ⚠️ NO "API" TAB. It was one card, then a full section, and it was removed on
 * 2026-08-11 because the API is not a separate product: every plan already
 * includes a request allowance and nothing prices API access on its own.
 *
 * Usage, allowances and spend belong in the account app, where a person can see
 * their real numbers, which is what every comparable product does with a
 * console. When overage pricing is decided it goes there, not here.
 */
const AUDIENCES: { id: Audience; label: string }[] = [
	{ id: "individual", label: "Individuals & small business" },
	{ id: "teams", label: "Teams & enterprise" },
];

/** Local currency, resolved after mount. See `lib/currency.ts`. */
function Amount({ usd, suffix }: { usd: number; suffix: string }) {
	// ⚠️ After mount, never during render. `navigator.language` does not exist on
	// the server, and reading it inline makes the first paint disagree with every
	// one after it.
	const [local, setLocal] = useState<ReturnType<typeof formatPrice> | null>(
		null,
	);
	useEffect(() => setLocal(formatPrice(usd)), [usd]);

	return (
		<span className="flex items-baseline gap-1.5">
			{/* `≈` only when the figure was converted. To a USD viewer this IS the
			    billed amount, and hedging an exact price reads as less trustworthy,
			    not more. */}
			{local?.estimated ? (
				<span className="font-display font-light text-[1.25rem] text-white/30 leading-none">
					≈
				</span>
			) : null}
			<span
				style={{ fontVariantNumeric: "tabular-nums" }}
				className="font-display font-light text-[2.25rem] text-white leading-none tracking-[-0.03em]"
			>
				{local ? local.text : `$${usd}`}
			</span>
			<span className="font-body font-light text-[0.875rem] text-white/40">
				{suffix}
			</span>
		</span>
	);
}

/**
 * A segmented control whose selection SLIDES rather than jumps.
 *
 * ⚠️ The indicator is one absolutely positioned element translated by index,
 * not a background colour swapped on each button. Swapping backgrounds cannot be
 * animated between two different elements — the old one has to fade out while
 * the new fades in, which reads as a flicker rather than a movement.
 *
 * The grid is what makes the maths trivial: every segment is exactly the same
 * width, so the indicator moves by `index * 100%` of its own width and the
 * transform never has to be measured.
 */
function Toggle<T extends string>({
	options,
	value,
	onChange,
}: {
	options: { id: T; label: string }[];
	value: T;
	onChange: (next: T) => void;
}) {
	const index = Math.max(
		0,
		options.findIndex((option) => option.id === value),
	);

	return (
		<div
			className="relative grid rounded-full border border-white/[0.10] bg-white/[0.02] p-1"
			style={{
				gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
			}}
		>
			{/* `inset-y-1` rather than a height, so it matches the padding on both
			    edges whatever the label size turns out to be. */}
			<span
				aria-hidden="true"
				style={{
					backgroundColor: ICE,
					width: `calc((100% - 0.5rem) / ${options.length})`,
					transform: `translateX(${index * 100}%)`,
				}}
				className="absolute inset-y-1 left-1 rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none"
			/>
			{options.map((option) => {
				const active = option.id === value;
				return (
					<button
						key={option.id}
						type="button"
						onClick={() => onChange(option.id)}
						// `relative` to sit above the indicator, which is the only reason
						// the label stays readable as it slides underneath.
						className={`relative whitespace-nowrap rounded-full px-5 py-2 font-body font-light text-[0.8125rem] transition-colors duration-200 ${
							active ? "text-black" : "text-white/50 hover:text-white"
						}`}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

/** A feature row: tick, label, and an optional qualifier under it. */
function Feature({ label, note }: { label: string; note?: string }) {
	return (
		<li className="flex items-start gap-3 border-white/[0.06] border-b py-3 last:border-b-0">
			<CheckIcon
				size={15}
				weight="bold"
				color={ICE}
				className="mt-0.5 shrink-0"
			/>
			<span className="flex flex-col gap-0.5">
				<span className="font-body font-light text-[0.875rem] text-white/85 leading-snug">
					{label}
				</span>
				{note ? (
					<span className="font-body font-light text-[0.75rem] text-white/35">
						{note}
					</span>
				) : null}
			</span>
		</li>
	);
}

function Card({ tier, cycle }: { tier: Tier; cycle: Cycle }) {
	const price = cycle === "annual" ? tier.annual : tier.monthly;
	const featured = tier.id === "grow";

	// What this tier ADDS over the one below it. Every tier listing everything it
	// includes is what made the cards identical, and it is what made the old
	// comparison table meaningless.
	const below = TIERS.filter(
		(other) => TIER_ORDER[other.id] === TIER_ORDER[tier.id] - 1,
	)[0];
	const added = MODULES.filter(
		(module) => TIER_ORDER[module.tier] === TIER_ORDER[tier.id],
	);

	return (
		<div
			style={{
				backgroundColor: CARD,
				borderColor: featured ? `${ICE}38` : undefined,
			}}
			className={`flex flex-col rounded-2xl border p-7 ${featured ? "" : "border-white/[0.08]"}`}
		>
			{/* Name and badge on one line, price beneath. The badge sits with the name
			    rather than floating over the card edge — it is a label ABOUT the plan,
			    and putting it in the corner makes it decoration. */}
			<div className="flex items-center gap-3">
				<h3 className="font-display font-light text-[1.5rem] text-white leading-none tracking-[-0.02em]">
					{tier.name}
				</h3>
				{featured ? (
					<span
						style={{ borderColor: `${ICE}45`, color: ICE }}
						className="rounded-full border px-2.5 py-[3px] font-body font-light text-[0.6875rem]"
					>
						Popular
					</span>
				) : null}
			</div>

			<div className="mt-5 flex items-baseline gap-2">
				{price === null ? (
					<span className="font-display font-light text-[2rem] text-white leading-none tracking-[-0.03em]">
						Custom pricing
					</span>
				) : (
					<Amount
						usd={cycle === "annual" ? Math.round(price / 12) : price}
						suffix={tier.perSeat ? "per seat / month" : "per month"}
					/>
				)}
			</div>

			<p className="mt-4 min-h-[2.5rem] font-body font-light text-[0.875rem] text-white/55 leading-[1.5]">
				{tier.tagline}
			</p>

			{/* The limits, as ticked rows. These are the numbers that are actually
			    enforced, which is the whole point of the rebuild. */}
			<ul className="mt-2 flex flex-col border-white/[0.06] border-t pt-1">
				<Feature
					label={`${formatLimit(tier.limits.workspaces)} workspaces`}
					note={tier.perSeat ? "Scales with your seats" : undefined}
				/>
				<Feature
					label={
						tier.perSeat
							? "Every seat billed"
							: `${formatLimit(tier.limits.seats)} seats included`
					}
					note={
						tier.minSeats
							? `From ${tier.minSeats} seats`
							: tier.extraSeat
								? `Extra seats $${tier.extraSeat} each`
								: undefined
					}
				/>
				<Feature
					label={`${formatLimit(tier.limits.storageGb, " GB")} storage`}
				/>
				<Feature
					label={`${formatLimit(tier.limits.apiRequests)} API requests / month`}
				/>
				<Feature label="Your branding, not ours" />

				{added.length ? (
					<Feature
						label={
							below
								? `Everything in ${below.name}, plus ${added.map((m) => m.name).join(", ")}`
								: added.map((m) => m.name).join(", ")
						}
					/>
				) : below ? (
					<Feature label={`Everything in ${below.name}`} />
				) : null}
			</ul>

			{/* Pushed to the bottom so three cards of different heights still line
			    their buttons up. That is the single thing that most makes a pricing
			    row look considered. */}
			<a
				href={
					tier.monthly === null
						? "/contact"
						: "https://auth.quickdash.xyz/signup"
				}
				style={
					featured
						? { backgroundColor: ICE, color: "#000000" }
						: { backgroundColor: GREY, color: ICE }
				}
				className="mt-auto inline-flex h-11 items-center justify-center rounded-full pt-0 font-body font-light text-[0.9375rem] no-underline transition-opacity duration-300 hover:opacity-85"
			>
				{tier.monthly === null ? "Talk to us" : `Choose ${tier.name}`}
			</a>

			{price !== null && cycle === "annual" ? (
				<p className="mt-3 text-center font-body font-light text-[0.75rem] text-white/35">
					${tier.annual} billed yearly, two months free
				</p>
			) : null}
		</div>
	);
}

/** A cell: a tick, a cross, or a value. */
function Cell({ value }: { value: string | boolean }) {
	if (value === true) {
		return <CheckIcon size={15} weight="bold" color={ICE} />;
	}
	if (value === false) {
		return <XIcon size={13} weight="bold" className="text-white/20" />;
	}
	return (
		<span
			style={{ fontVariantNumeric: "tabular-nums" }}
			className="font-body font-light text-[0.8125rem] text-white/75"
		>
			{value}
		</span>
	);
}

/**
 * The comparison table.
 *
 * 🔴 EVERY CELL IS DERIVED. Limits come from the tier, module ticks from
 * `TIER_ORDER`. The previous table was hand-written and ended up showing every
 * capability on every plan, which is how a page comes to contradict the metering
 * engine that will actually cut somebody off.
 *
 * 🔴 NO `overflow-x-auto` ON ANY ANCESTOR OF THIS. A horizontal scroll container
 * is also a vertical one, and that silently breaks the `sticky` header — the
 * exact bug that took this table's header out the first time. If the table has
 * to scroll sideways on a phone, solve it by dropping columns, not by wrapping
 * it in an overflow box.
 */
function Compare({ tiers, cycle }: { tiers: Tier[]; cycle: Cycle }) {
	const limits: { label: string; get: (tier: Tier) => string }[] = [
		{ label: "Workspaces", get: (t) => formatLimit(t.limits.workspaces) },
		{
			label: "Seats included",
			get: (t) => (t.perSeat ? "Per seat" : formatLimit(t.limits.seats)),
		},
		{ label: "Storage", get: (t) => formatLimit(t.limits.storageGb, " GB") },
		{
			label: "API requests / month",
			get: (t) => formatLimit(t.limits.apiRequests),
		},
		{
			label: "AI actions / month",
			get: (t) => formatLimit(t.limits.aiActions),
		},
	];

	const columns = `minmax(0, 1.6fr) repeat(${tiers.length}, minmax(0, 1fr))`;

	return (
		<div className="mt-32">
			{/* ⚠️ `top` clears the fixed header AND the banner. Sticking at 0 would
			    park this underneath the site header, where it is invisible. */}
			<div
				className="sticky top-[calc(var(--header-h)+var(--banner-h))] z-20 grid items-end gap-4 border-white/[0.10] border-b bg-black py-5"
				style={{ gridTemplateColumns: columns }}
			>
				<div>
					<h2 className="font-display font-light text-[1.5rem] text-white leading-tight tracking-[-0.02em]">
						Compare plans
					</h2>
					<p className="mt-1 font-body font-light text-[0.8125rem] text-white/40">
						Every limit here is enforced.
					</p>
				</div>
				{tiers.map((tier) => (
					<div key={tier.id} className="flex flex-col items-center gap-2.5">
						<span className="font-body font-normal text-[0.9375rem] text-white">
							{tier.name}
						</span>
						<a
							href={
								tier.monthly === null
									? "/contact"
									: "https://auth.quickdash.xyz/signup"
							}
							style={
								tier.id === "grow"
									? { backgroundColor: ICE, color: "#000000" }
									: { backgroundColor: GREY, color: ICE }
							}
							className="inline-flex h-8 items-center justify-center rounded-full px-4 font-body font-light text-[0.75rem] no-underline transition-opacity duration-300 hover:opacity-85"
						>
							{tier.monthly === null ? "Talk to us" : "Choose"}
						</a>
					</div>
				))}
			</div>

			<Group title="Limits" />
			{limits.map((row) => (
				<div
					key={row.label}
					className="grid items-center gap-4 border-white/[0.06] border-b py-4"
					style={{ gridTemplateColumns: columns }}
				>
					<span className="font-body font-light text-[0.875rem] text-white/70">
						{row.label}
					</span>
					{tiers.map((tier) => (
						<span key={tier.id} className="flex justify-center">
							<Cell value={row.get(tier)} />
						</span>
					))}
				</div>
			))}

			<Group title="Modules" />
			{MODULES.map((module) => (
				<div
					key={module.slug}
					className="grid items-center gap-4 border-white/[0.06] border-b py-4"
					style={{ gridTemplateColumns: columns }}
				>
					<span className="flex items-center gap-2">
						<a
							href={`/products/modules/${module.slug}`}
							className="font-body font-light text-[0.875rem] text-white/70 no-underline transition-colors hover:text-white"
						>
							{module.name}
						</a>
						{module.partial ? (
							<span className="rounded-full border border-white/12 px-2 py-[1px] font-body font-light text-[0.625rem] text-white/35">
								In progress
							</span>
						) : null}
					</span>
					{tiers.map((tier) => (
						<span key={tier.id} className="flex justify-center">
							<Cell value={TIER_ORDER[module.tier] <= TIER_ORDER[tier.id]} />
						</span>
					))}
				</div>
			))}

			<div className="mt-10 grid gap-8 border-white/[0.07] border-t pt-8 md:grid-cols-2">
				<div>
					<h3 className="font-body font-normal text-[0.9375rem] text-white">
						Going over a limit
					</h3>
					<p className="mt-2.5 max-w-[46ch] font-body font-light text-[0.875rem] text-white/55 leading-[1.65]">
						You are warned as you approach one, and there is a grace margin past
						it. The action that tips you over still finishes, and anything
						already running always completes. A busy month should not stop your
						business.
					</p>
				</div>
				<div>
					<h3 className="font-body font-normal text-[0.9375rem] text-white">
						What we never charge for
					</h3>
					<p className="mt-2.5 max-w-[46ch] font-body font-light text-[0.875rem] text-white/55 leading-[1.65]">
						No cut of your sales, no fee per invoice, no fee per customer.
						Shopify takes 2.9% + 30¢ of every order and charges 2% more for
						using your own payment provider. FreshBooks' entry plan caps you at
						five clients. We do neither, on any plan.
					</p>
				</div>
			</div>

			<p className="mt-8 font-body font-light text-[0.8125rem] text-white/35">
				Unlocked modules are paid once on your plan and then unlimited. You are
				never charged per customer, per invoice or per record.
				{cycle === "annual" ? " Annual plans are billed yearly." : ""}
			</p>
		</div>
	);
}

/** A band that separates one run of rows from the next. */
function Group({ title }: { title: string }) {
	return (
		<p className="pt-10 pb-3 font-body font-light text-[0.75rem] text-white/35 uppercase tracking-[0.14em]">
			{title}
		</p>
	);
}

/**
 * The questions the pricing model actually raises.
 *
 * ⚠️ Every answer here is a commitment, not marketing. "No fee per invoice" and
 * "the free nine never shrink" are promises from
 * `internal/planning/PRICING_DESIGN.md`, and breaking one later costs more trust
 * than the revenue it would earn. Do not add a question whose answer we are not
 * prepared to be held to.
 */
const FAQ: { q: string; a: React.ReactNode }[] = [
	{
		q: "What happens when I hit a limit?",
		a: (
			<>
				You are warned as you approach it, and there is a grace margin past it.
				The action that tips you over still finishes, and anything already in
				flight always completes. Hitting a cap shows an upgrade prompt; it never
				corrupts work in progress.
			</>
		),
	},
	{
		q: "Do I pay more as my business grows?",
		a: (
			<>
				Only if you use more infrastructure. There is no fee per customer, per
				invoice, or per record created, on any plan. A tool that takes a slice
				of your growth is charging you for its own success.
			</>
		),
	},
	{
		q: "Can I switch plans whenever I want?",
		a: (
			<>
				Yes, in both directions, and it takes effect immediately. Downgrading
				keeps your data; you simply stop being able to use what the lower plan
				does not include.
			</>
		),
	},
	{
		q: "Will the free modules ever become paid?",
		a: (
			<>
				No. The free set is fixed and never shrinks. New modules ship as paid
				unlocks, so what you already rely on stays where it is.
			</>
		),
	},
	{
		q: "Is annual actually cheaper?",
		a: (
			<>
				Two months free on every paid plan, which is where the yearly figure
				comes from. It is the same discount on every tier so you can check it
				without arithmetic.
			</>
		),
	},
	{
		q: "What is a workspace?",
		a: (
			<>
				One business. Its own data, modules, people and keys, sealed from every
				other. Run several if you run several businesses, and{" "}
				<a
					href="/products/workspaces"
					className="text-white underline decoration-white/30 underline-offset-4"
				>
					here is how they work
				</a>
				.
			</>
		),
	},
];

function Questions() {
	return (
		<div className="mt-28">
			<h2 className="font-display font-light text-[1.875rem] text-white leading-tight tracking-[-0.02em]">
				Questions
			</h2>
			<div className="mt-8 grid gap-x-16 gap-y-8 md:grid-cols-2">
				{FAQ.map((item) => (
					<div key={item.q}>
						<h3 className="font-body font-normal text-[0.9375rem] text-white">
							{item.q}
						</h3>
						<p className="mt-2.5 max-w-[52ch] font-body font-light text-[0.9375rem] text-white/60 leading-[1.65]">
							{item.a}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

export function Pricing() {
	const [cycle, setCycle] = useState<Cycle>("monthly");
	const [audience, setAudience] = useState<Audience>("individual");

	// 🔴 FREE IS NOT SHOWN AS A CARD, deliberately. It exists and anybody can
	// sign up for it, but a free column on a pricing page invites people to
	// compare against nothing and anchors the paid tiers as expensive. It is
	// stated as a line underneath instead, where it reads as an invitation rather
	// than an option being weighed.
	const shown = TIERS.filter(
		(tier) => tier.id !== "free" && tier.audience.includes(audience),
	);

	return (
		<section className="pt-[calc(var(--header-h)+7rem)] pb-28 site-gutter">
			<div className="mx-auto max-w-[80rem]">
				{/* ⚠️ Two lines maximum, one break, same rule as every other page. The
				    measure is what enforces it. */}
				<div className="text-center">
					<h1 className="mx-auto max-w-[20ch] font-display font-light text-[clamp(2.1rem,5vw,3.75rem)] text-white leading-[1.08] tracking-[-0.025em]">
						Priced on what it costs us.
					</h1>
					<p className="mx-auto mt-6 max-w-[56ch] font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
						Never per customer, per invoice, or per record. You are charged for
						infrastructure we actually pay for, and nothing for the business you
						build on it.
					</p>
				</div>

				<div className="mt-12 flex flex-col items-center gap-5 text-center">
					<Toggle options={AUDIENCES} value={audience} onChange={setAudience} />
					{/* Only where it changes something. An annual switch on a page showing
					    a per-seat quote and a "talk to us" is a control that does nothing. */}
					{audience === "individual" ? (
						<Toggle options={CYCLES} value={cycle} onChange={setCycle} />
					) : null}
				</div>

				{/* ⚠️ The column count follows the number of cards. Dropping Free left
				    three tiers falling through to a two-column rule, which stacked the
				    third underneath on its own. `grid-cols-3` is the case that matters —
				    the paid ladder is three wide and should read as one row. */}
				<div
					className={`mt-14 grid gap-5 ${
						shown.length === 3
							? "sm:grid-cols-2 lg:grid-cols-3"
							: shown.length === 2
								? "sm:grid-cols-2"
								: shown.length === 1
									? "mx-auto max-w-[26rem]"
									: "sm:grid-cols-2 xl:grid-cols-4"
					}`}
				>
					{shown.map((tier) => (
						<Card key={tier.id} tier={tier} cycle={cycle} />
					))}
				</div>

				<Compare tiers={shown} cycle={cycle} />

				<Questions />

				<p className="mt-20 text-center font-body font-light text-[0.9375rem] text-white/55">
					Just having a look?{" "}
					<a
						href="https://auth.quickdash.xyz/signup"
						className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white/70"
					>
						Start free
					</a>
					, no card needed.
				</p>
				<p className="mt-3 text-center font-body font-light text-[0.8125rem] text-white/35">
					Prices in USD. You are never charged per customer, per invoice or per
					record, on any plan.
				</p>
			</div>
		</section>
	);
}
