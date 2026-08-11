import { createFileRoute } from "@tanstack/react-router";
import { ICE } from "@/components/pill";
import { TextPage } from "@/components/text-page";

/**
 * The public changelog.
 *
 * 🔴 THIS IS NOT GENERATED FROM `CHANGELOG.md`, AND IT MUST NOT BE.
 *
 * Two ledgers, decided 2026-08-10 and recorded in `internal/STATE.md`:
 *
 * - `CHANGELOG.md` is the exhaustive engineering record and compliance
 *   evidence. Append-only, every change, including CI and migrations.
 * - This page is a curated product feed. Only what a customer would care about,
 *   grouped by date, assembled by hand at each release.
 *
 * The reason it is not automated is DISCLOSURE, not effort. That file contains
 * entries like provider tokens not being encrypted at rest and webhooks reaching
 * private networks. Published verbatim, each one states exactly what was wrong,
 * when, and therefore which deployments are still vulnerable. A person decides
 * whether, how and when a security entry is said publicly. A pipeline gets that
 * wrong once and it is permanent.
 *
 * ⚠️ Curation rules for anyone adding an entry:
 * - Would a customer notice, or care? If not, it belongs only in `CHANGELOG.md`.
 * - Say what changed for THEM, not what was refactored.
 * - Never publish a security fix that reveals a live weakness.
 * - Do not invent a date. Entries here are dated when they shipped.
 */

type Entry = {
	date: string;
	title: string;
	body: string;
	tag: "Added" | "Changed" | "Fixed" | "Security";
};

/**
 * ⚠️ Pre-launch, so these describe work on a product nobody is running yet, and
 * the page says so above. They are real and they are dated correctly — none of
 * this is filler.
 */
const ENTRIES: Entry[] = [
	{
		date: "2026-08-10",
		tag: "Added",
		title: "The interface, designed rather than assembled",
		body: "A new marketing site, a pricing page driven by the real plan ladder, and every sign-in, verification and recovery screen rebuilt on one shell. Error, loading and connection states now look like the rest of the product instead of a framework default.",
	},
	{
		date: "2026-08-10",
		tag: "Changed",
		title: "Passwords have real rules, visible as you type",
		body: "Setting a password shows a strength bar and a live checklist. Signing up still needs no password at all, a code, Google, GitHub or a passkey, and a password stays something you add later if you want one.",
	},
	{
		date: "2026-08-09",
		tag: "Security",
		title: "Every API route is attacked for tenant confusion on every build",
		body: "Our test suite walks the real route table with valid credentials deliberately combined in invalid ways. Any route that answers across a workspace boundary fails the build, including routes written years from now.",
	},
	{
		date: "2026-08-09",
		tag: "Added",
		title: "Edit your website's words in QuickDash",
		body: "Every content slot your developer declared, grouped as they grouped it, with a publish switch per slot and unsaved changes shown before you leave.",
	},
	{
		date: "2026-08-08",
		tag: "Added",
		title: "The connection kit is on npm",
		body: "`@quickengine/quick` installs the ordinary way, so connecting a website no longer means copying files around or pointing at a folder on one machine.",
	},
];

const TAG_STYLE: Record<Entry["tag"], string> = {
	Added: "border-white/20 text-white/70",
	Changed: "border-white/20 text-white/70",
	Fixed: "border-white/20 text-white/70",
	Security: "",
};

function Item({ entry }: { entry: Entry }) {
	// Parsed once for display. The stored value stays ISO so it sorts and never
	// depends on the reader's locale to be unambiguous.
	const shown = new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	return (
		<article className="grid gap-x-12 gap-y-4 border-white/[0.07] border-t py-12 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
			{/* The date in a rail, so the column of dates reads as a timeline on its
			    own. Sticky on wide screens: a long entry otherwise scrolls away from
			    the date it belongs to. */}
			<div className="lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
				<time
					dateTime={entry.date}
					style={{ fontVariantNumeric: "tabular-nums" }}
					className="font-body font-light text-[0.8125rem] text-white/35"
				>
					{shown}
				</time>
			</div>

			<div>
				<span
					style={
						entry.tag === "Security"
							? { borderColor: ICE, color: ICE }
							: undefined
					}
					className={`inline-flex h-6 items-center rounded-full border px-3 font-body font-light text-[0.6875rem] uppercase tracking-[0.1em] ${TAG_STYLE[entry.tag]}`}
				>
					{entry.tag}
				</span>

				<h2 className="mt-4 font-display font-light text-[clamp(1.25rem,2vw,1.625rem)] text-white leading-snug tracking-[-0.02em]">
					{entry.title}
				</h2>
				<p className="mt-3 max-w-[62ch] font-body font-light text-[1.0625rem] text-white/65 leading-[1.7]">
					{entry.body}
				</p>
			</div>
		</article>
	);
}

function ChangelogPage() {
	return (
		<TextPage
			title="What we shipped."
			lede="QuickDash is pre-launch, so this is a record of the product being built rather than of releases. Every entry is real and dated when it happened."
		>
			<div className="flex flex-col">
				{ENTRIES.map((entry) => (
					<Item key={`${entry.date}-${entry.title}`} entry={entry} />
				))}
			</div>
		</TextPage>
	);
}

export const Route = createFileRoute("/changelog")({
	component: ChangelogPage,
});
