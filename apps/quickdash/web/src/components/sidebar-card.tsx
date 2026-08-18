import { XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { clientEnv } from "../lib/env";

/**
 * The quiet surface at the foot of the sidebar.
 *
 * ── What this is, and what it is NOT ─────────────────────────────────────────
 *
 * 🔴 It is the NEXT THING WORTH DOING, not a place to sell modules.
 *
 * The first version of this suggested any module that happened to be switched
 * off. That was wrong on its own terms: `module-registry/availability.ts` states
 * that no plan gates any module — "Omitted today, so every module is allowed" —
 * so a module being off is a CHOICE, never a purchase. Suggesting one is not an
 * upgrade prompt at all; it is nagging somebody about a decision they already
 * made, and doing that to a paying customer is worse than saying nothing.
 *
 * ⚠️ What plans actually limit is RESOURCES: API requests, AI actions, storage,
 * seats, workspaces. So the only honest upgrade prompt is one that appears when
 * an account is close to a ceiling it will really hit. That is a fact about
 * their own usage, not an opinion about how they should run their business.
 *
 * ── Order, and why it is not random ──────────────────────────────────────────
 *
 * 🔑 Sorted by consequence, never rotated:
 *   1. A limit already exceeded — things are failing right now.
 *   2. A limit close enough to matter — they will hit it soon.
 *   3. The next setup step they have not done.
 *
 * Rotating the card on every refresh, which is what several products do, trains
 * people to dismiss it without reading — if the contents are arbitrary, the only
 * rational response is to make it go away. A stable order means a change in this
 * card is information.
 *
 * ⚠️ Silence is allowed and is the common case. A fully set-up account well
 * inside its limits sees nothing at all.
 */

type Limit = {
	meter: string;
	used: number;
	limit: number | null;
	remaining: number | null;
	exceeded: boolean;
};

type NextStep = {
	id: string;
	label: string;
	description: string;
	href: string;
};

/** Warn at the same fraction the billing package warns at. */
const WARN_AT = 0.8;

/**
 * 🔴 Only COUNTERS belong in this card. Mirrors `METER_KIND` in
 * `@quickengine/billing/plans`.
 *
 * A counter accumulates over a period and running out genuinely breaks things:
 * requests start being refused. A GAUGE is a current tally — seats in use,
 * workspaces that exist, bytes stored — and being at its limit is not a failure
 * at all. It is the ordinary resting state of a healthy account.
 *
 * ⚠️ Free allows one seat, so every account on day one is at "1 of 1 seats".
 * Treating that as an exceeded limit put a red "requests are being refused"
 * card in front of every new customer, describing a problem that did not exist.
 * One person using their one seat is not a problem, it is a person.
 *
 * A gauge at capacity only matters when somebody TRIES to exceed it — inviting a
 * second member, creating a second workspace. That belongs in a soft wall at
 * the moment of the action, where the answer is useful, not in an ambient card
 * that interrupts work nobody was doing.
 */
const COUNTERS = new Set(["apiRequests", "aiActions", "webhookDeliveries"]);

const METER_LABEL: Record<string, string> = {
	apiRequests: "API requests",
	aiActions: "AI actions",
	storageBytes: "Storage",
	seats: "Seats",
	workspaces: "Workspaces",
	webhookDeliveries: "Webhook deliveries",
};

const DISMISS_DAYS = 30;
const storeKey = (workspaceId: string) =>
	`quickdash-sidebar-card:${workspaceId}`;

function readDismissals(workspaceId: string): Record<string, number> {
	try {
		const raw = localStorage.getItem(storeKey(workspaceId));
		return raw ? (JSON.parse(raw) as Record<string, number>) : {};
	} catch {
		// An unavailable or corrupt store must never take the sidebar down.
		return {};
	}
}

function remember(workspaceId: string, id: string) {
	try {
		const all = readDismissals(workspaceId);
		all[id] = Date.now();
		localStorage.setItem(storeKey(workspaceId), JSON.stringify(all));
	} catch {
		// Not persisting a dismissal is a much smaller problem than crashing.
	}
}

const dismissedRecently = (at: number | undefined) =>
	typeof at === "number" && Date.now() - at < DISMISS_DAYS * 86_400_000;

export function SidebarCard({
	workspaceId,
	usage,
	nextStep,
}: {
	workspaceId: string;
	/** `undefined` until the plan has loaded — never an empty object. */
	usage: Record<string, Limit> | undefined;
	/** The same step Home shows, so the two can never disagree. */
	nextStep: NextStep | null | undefined;
}) {
	const [dismissed, setDismissed] = useState(() => readDismissals(workspaceId));

	const drop = (id: string) => {
		remember(workspaceId, id);
		setDismissed(readDismissals(workspaceId));
	};

	/**
	 * 🔴 An exceeded limit is NOT dismissible.
	 *
	 * Requests are being refused while it is on screen. Letting somebody hide
	 * that would leave them debugging a failure the console already knew the
	 * cause of, which is the exact opposite of the job.
	 */
	const breached = Object.values(usage ?? {}).find(
		(meter) => meter.exceeded && COUNTERS.has(meter.meter),
	);
	if (breached) {
		return (
			<Card
				title={METER_LABEL[breached.meter] ?? breached.meter}
				badge="Over"
				badgeTone="var(--signal-failure)"
				body={`${breached.used.toLocaleString()} of ${(breached.limit ?? 0).toLocaleString()} this period. Anything past the limit is being turned away until the period resets or the plan changes.`}
				href={`${clientEnv.ACCOUNT_URL}/billing`}
				cta="See plans"
			/>
		);
	}

	const nearing = Object.values(usage ?? {})
		.filter(
			(meter) =>
				COUNTERS.has(meter.meter) &&
				meter.limit !== null &&
				meter.limit > 0 &&
				meter.used / meter.limit >= WARN_AT &&
				!dismissedRecently(dismissed[`meter:${meter.meter}`]),
		)
		.sort((a, b) => b.used / (b.limit ?? 1) - a.used / (a.limit ?? 1))[0];

	if (nearing) {
		return (
			<Card
				title={METER_LABEL[nearing.meter] ?? nearing.meter}
				badge={`${Math.round((nearing.used / (nearing.limit ?? 1)) * 100)}%`}
				badgeTone="var(--signal-attention)"
				body={`${nearing.used.toLocaleString()} of ${(nearing.limit ?? 0).toLocaleString()} used. A larger plan raises this, and nothing changes about how the workspace works.`}
				href={`${clientEnv.ACCOUNT_URL}/billing`}
				cta="See plans"
				onDismiss={() => drop(`meter:${nearing.meter}`)}
			/>
		);
	}

	if (nextStep && !dismissedRecently(dismissed[`step:${nextStep.id}`])) {
		return (
			<Card
				title={nextStep.label}
				badge="Setup"
				badgeTone="var(--signal-news)"
				body={nextStep.description}
				href={nextStep.href}
				cta="Show me"
				onDismiss={() => drop(`step:${nextStep.id}`)}
			/>
		);
	}

	// Nothing true and useful to say, so nothing said.
	return null;
}

function Card({
	title,
	badge,
	badgeTone,
	body,
	href,
	cta,
	onDismiss,
}: {
	title: string;
	badge: string;
	badgeTone: string;
	body: string;
	href: string;
	cta: string;
	onDismiss?: () => void;
}) {
	return (
		<div className="rounded-xl border border-[var(--console-line)] bg-[var(--console-pop)] p-3 shadow-[0_12px_32px_rgb(0_0_0/0.35)]">
			<div className="flex items-start gap-2">
				<p className="min-w-0 flex-1 text-[12.5px] text-[var(--ink-85)]">
					{title}
				</p>
				{/* ⚠️ Colour by inline style: these tokens are hex, so an arbitrary
				    Tailwind value with an alpha channel would produce no rule at all. */}
				<span
					className="shrink-0 rounded-full border px-2 py-0.5 text-[10px]"
					style={{ color: badgeTone, borderColor: badgeTone }}
				>
					{badge}
				</span>
				{onDismiss ? (
					<button
						type="button"
						aria-label={`Dismiss ${title}`}
						onClick={onDismiss}
						className="-mr-0.5 shrink-0 text-[var(--ink-30)] transition-colors hover:text-[var(--ink-85)]"
					>
						<XIcon size={13} />
					</button>
				) : null}
			</div>
			<p className="mt-1.5 text-[11px] text-[var(--ink-40)] leading-[1.45]">
				{body}
			</p>
			<a
				href={href}
				className="mt-2.5 flex h-8 items-center justify-center rounded-lg bg-[rgb(var(--console-ink))] text-[11.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85"
			>
				{cta}
			</a>
		</div>
	);
}
