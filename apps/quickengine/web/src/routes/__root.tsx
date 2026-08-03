import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	ArrowUpRightIcon,
	CheckIcon,
	CopyIcon,
} from "@phosphor-icons/react";
import { Background, ThemeProvider } from "@quickengine/ui";
import * as Sentry from "@sentry/react";
import {
	createRootRoute,
	type ErrorComponentProps,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ConnectionBanner } from "@/components/connection-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageTitle } from "@/lib/seo";

/**
 * The marketing site is being rebuilt from scratch; the previous app is
 * preserved at `internal/snapshots/web-prerebuild/`.
 *
 * `HeadContent` manages the **tab title only**. Open Graph, Twitter cards and
 * JSON-LD are static in `index.html`, because no crawler or link unfurler runs
 * JavaScript.
 */
export const Route = createRootRoute({
	head: () => ({ meta: [{ title: pageTitle() }] }),
	component: RootLayout,
	notFoundComponent: NotFound,
	errorComponent: ErrorScreen,
});

/**
 * The chrome, as its own component.
 *
 * ⚠️ `errorComponent` on the ROOT route REPLACES `component`, it does not
 * render inside it. So an error screen that relies on `RootLayout` for the
 * header, footer, theme and background gets none of them — the page renders
 * bare. `notFoundComponent` behaves the opposite way and renders in the outlet,
 * which is why the 404 kept its chrome and the 500 silently lost it.
 *
 * Both paths mount this explicitly so neither can drift.
 */
function Shell({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider>
			<HeadContent />
			<Background />
			<ConnectionBanner />
			<SiteHeader />
			{children}
			<SiteFooter />
		</ThemeProvider>
	);
}

function RootLayout() {
	return (
		<Shell>
			<Outlet />
		</Shell>
	);
}

/** Shared by both layers so they sit in exactly the same place. Any divergence
    here and the lit copy drifts off the base by a pixel, which reads as a
    print-registration error. */
const NUMERAL =
	"select-none font-display text-[clamp(14rem,24vw,28rem)] leading-none tracking-tight";

/** How far the spotlight reaches from the cursor. */
const GLOW_RADIUS = 260;

/**
 * The numeral, with a spotlight that follows the cursor across it.
 *
 * Two stacked copies: a dim base that always shows, and a bright copy revealed
 * only inside a radial mask centred on the pointer. Brightening the single
 * element instead would light the whole numeral at once — the mask is what
 * makes the light feel local, as if it is being played across the surface.
 *
 * The base fades bottom-right by two means at once. `background-clip: text`
 * paints a gradient through the glyphs, and a diagonal mask drops the whole
 * element's alpha. The gradient alone only shifts colour; the mask is what
 * makes it dissolve into the page rather than settling on a lighter grey and
 * stopping.
 *
 * `currentColor` keeps both tied to the theme, so it lights out of white on
 * black and out of black on white with no second rule set.
 */
function Numeral({ children }: { children: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [glow, setGlow] = useState<{ x: number; y: number } | null>(null);

	return (
		<div
			ref={ref}
			aria-hidden
			className={`relative hidden justify-self-end lg:block ${NUMERAL}`}
			onPointerMove={(event) => {
				const box = ref.current?.getBoundingClientRect();
				if (!box) return;
				setGlow({ x: event.clientX - box.left, y: event.clientY - box.top });
			}}
			onPointerLeave={() => setGlow(null)}
		>
			<div
				className={`bg-gradient-to-br from-current to-transparent bg-clip-text text-foreground/[0.13] ${NUMERAL}`}
				style={{
					WebkitTextFillColor: "transparent",
					maskImage:
						"linear-gradient(to bottom right, #000 35%, transparent 105%)",
				}}
			>
				{children}
			</div>

			{glow ? (
				<div
					className={`absolute inset-0 text-foreground/50 transition-opacity duration-200 ${NUMERAL}`}
					style={{
						maskImage: `radial-gradient(circle ${GLOW_RADIUS}px at ${glow.x}px ${glow.y}px, #000 0%, transparent 70%)`,
					}}
				>
					{children}
				</div>
			) : null}
		</div>
	);
}

/**
 * The stop-screen face: two round eyes and an arched frown, laid on its side so
 * it reads as `:(`.
 *
 * Drawn rather than typed. A literal `:(` inherits whatever the display face
 * does with a colon and a parenthesis, and Clash gives squared dots and a
 * shallow, tight bracket.
 *
 * The geometry is authored UPRIGHT — eyes side by side, mouth arching up in the
 * middle — because that is the only orientation these coordinates are readable
 * in. `translate(0,300) rotate(-90)` then lays it down. The rotation maps
 * `(x,y) → (y, 300−x)`, which puts the eyes on the left stacked vertically and
 * swings the mouth to the right bulging inward, exactly like the bracket in
 * `:(`. The viewBox is swapped to match, 300×200 becoming 200×300.
 *
 * Eyes are true circles; the mouth is butt-capped, so its ends cut off square
 * against the arc rather than rounding over.
 */
function StopFace({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 200 300"
			className={className}
			fill="none"
			aria-hidden
			role="presentation"
		>
			<g transform="translate(0,300) rotate(-90)">
				<circle cx="97" cy="62" r="14" fill="currentColor" />
				<circle cx="203" cy="62" r="14" fill="currentColor" />
				<path
					d="M 44 164 Q 150 68 256 164"
					stroke="currentColor"
					strokeWidth="20"
					strokeLinecap="butt"
				/>
			</g>
		</svg>
	);
}

/** The numeral, plain: same type and fade as the 404, without the glow. */
function StaticNumeral({ children }: { children: string }) {
	return (
		<div
			aria-hidden
			className={`bg-gradient-to-br from-current to-transparent bg-clip-text text-foreground/[0.13] ${NUMERAL}`}
			style={{
				WebkitTextFillColor: "transparent",
				maskImage:
					"linear-gradient(to bottom right, #000 35%, transparent 105%)",
			}}
		>
			{children}
		</div>
	);
}

const PRIMARY_BTN =
	"btn btn-solid inline-flex h-10 items-center gap-1.5 rounded-full px-5 font-medium text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const MUTED_BTN =
	"btn btn-muted inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** The shared two-column error layout: copy and actions left, numeral right. */
function ErrorLayout({
	numeral,
	lead,
	title,
	message,
	actions,
	footnote,
}: {
	/** The right-hand graphic. Each surface picks its own treatment — the
	    numeral is the constant, what happens to it carries the meaning. */
	numeral: ReactNode;
	/** Hung ABOVE the heading and out of flow, so a surface that has one lands
	    its heading, copy and buttons on exactly the same baseline as a surface
	    that does not. In flow it would push the whole column down and the error
	    pages would stop lining up with each other. */
	lead?: ReactNode;
	title: string;
	message: string;
	actions: ReactNode;
	/** Hung BELOW the buttons and out of flow, for the same reason as `lead`.
	    The grid centres each column on its own height, so anything extra in
	    flow lifts that column's heading relative to the other page's. Only the
	    heading, copy and buttons are in flow, and those are identical on every
	    surface. */
	footnote?: ReactNode;
}) {
	return (
		<main className="grid min-h-dvh place-items-center">
			<div className="page-gutter grid w-full items-center gap-12 lg:grid-cols-2">
				<div className="relative">
					{lead}
					<h1 className="font-display font-normal text-4xl text-foreground leading-[1.1] tracking-tight sm:text-5xl">
						{title}
					</h1>

					<p className="mt-5 max-w-lg text-[15px] text-muted-foreground leading-relaxed">
						{message}
					</p>

					{/* Icon placement follows direction, not decoration: an arrow back
					    leads because it points at where you are going, an arrow out
					    trails because it describes what happens after the label. */}
					<div className="mt-8 flex flex-wrap items-center gap-2">
						{actions}
					</div>

					{footnote ? (
						<div className="absolute top-full left-0 w-full">{footnote}</div>
					) : null}
				</div>

				{numeral}
			</div>
		</main>
	);
}

/**
 * 404. `min-h-dvh` fills the viewport so the footer stays below the fold.
 *
 * Two columns that collapse to one: copy and actions on the left, the numeral
 * on the right. The numeral is decorative — the accessible name comes from the
 * heading, so a screen reader is not made to announce "404" twice.
 */
function NotFound() {
	return (
		<ErrorLayout
			numeral={<Numeral>404</Numeral>}
			title="Oops, page not found…"
			message="The page either doesn't exist, or has been moved."
			actions={
				<>
					<a href="/" className={PRIMARY_BTN}>
						<ArrowLeftIcon size={14} weight="bold" />
						Back to home
					</a>
					<a href="https://docs.quickdash.xyz" className={MUTED_BTN}>
						Read the docs
						<ArrowUpRightIcon size={14} weight="bold" />
					</a>
				</>
			}
		/>
	);
}

/**
 * The Sentry event id, copyable in one click.
 *
 * Anyone reporting this has to get the id to us intact, and hand-transcribing
 * 32 hex characters from a screen is exactly where it gets corrupted. The
 * confirmation is announced politely rather than assertively so it does not
 * interrupt whatever a screen reader is already saying.
 *
 * `navigator.clipboard` rejects on insecure origins and when permission is
 * refused, so the failure path leaves the text selectable rather than claiming
 * a copy that never happened.
 */
function Reference({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<div className="mt-6 flex items-center gap-2">
			<span className="text-[12px] text-muted-foreground/70">Reference</span>
			<button
				type="button"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(value);
						setCopied(true);
					} catch {
						setCopied(false);
					}
				}}
				className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[12px] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
			>
				<span className="select-all">{value}</span>
				{copied ? (
					<CheckIcon size={12} weight="bold" />
				) : (
					<CopyIcon size={12} />
				)}
			</button>
			<span aria-live="polite" className="sr-only">
				{copied ? "Reference copied." : ""}
			</span>
		</div>
	);
}

/**
 * Route error boundary — something in the app threw.
 *
 * Distinct job from the 404. There the URL was wrong and navigation is the fix;
 * here our code broke and the visitor did nothing wrong, so the primary action
 * is to retry rather than to go elsewhere.
 *
 * The Sentry event id is shown when, and only when, a DSN is configured. Sentry
 * hands back an id whether or not it is initialised, so printing it
 * unconditionally would give people a reference number for a report that was
 * never sent — worse than showing nothing.
 */
function ErrorScreen({ error, reset }: ErrorComponentProps) {
	const [eventId, setEventId] = useState<string | null>(null);

	useEffect(() => {
		if (!import.meta.env.VITE_SENTRY_DSN) return;
		setEventId(Sentry.captureException(error));
	}, [error]);

	return (
		<Shell>
			<ErrorLayout
				lead={
					<StopFace className="absolute bottom-full left-0 mb-9 h-[clamp(5rem,10vw,8rem)] w-auto text-foreground" />
				}
				numeral={
					<div className="hidden justify-self-end lg:block">
						<StaticNumeral>500</StaticNumeral>
					</div>
				}
				title="Something went wrong…"
				message="This one is on us, not you. Trying again clears it up most of the time."
				actions={
					<>
						<button type="button" onClick={reset} className={PRIMARY_BTN}>
							<ArrowClockwiseIcon size={14} weight="bold" />
							Try again
						</button>
						<a href="/" className={MUTED_BTN}>
							<ArrowLeftIcon size={14} weight="bold" />
							Back to home
						</a>
					</>
				}
				footnote={eventId ? <Reference value={eventId} /> : null}
			/>
		</Shell>
	);
}
