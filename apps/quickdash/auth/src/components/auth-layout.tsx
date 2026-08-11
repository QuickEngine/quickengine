import { ArrowLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { GREY, ICE, Logo } from "@quickengine/ui";
import { WaveBackground } from "@quickengine/ui/wave-background";
import { type ReactNode, useEffect, useState } from "react";
import { env } from "@/lib/env";

// The real fifteen, from `packages/modules`, in workflow order.
const MODULES = [
	"Clients",
	"Products & Services",
	"Quotes & Estimates",
	"Invoicing",
	"Payments",
	"Orders",
	"Inventory",
	"Fulfilment",
	"Shipping",
	"Bookings",
	"Projects & Tasks",
	"Time Tracking",
	"Files & Documents",
	"Contracts & E-sign",
	"Reporting",
];

// Real configurations, not decorative ones — each is the module set that
// business type actually enables. Cycling them turns a static pattern into the
// argument: same fifteen, different subset, depending on who you are.
const CONFIGURATIONS = [
	{
		label: "a consultancy",
		modules: [
			"Clients",
			"Bookings",
			"Invoicing",
			"Payments",
			"Contracts & E-sign",
		],
	},
	{
		label: "a retail shop",
		modules: [
			"Products & Services",
			"Inventory",
			"Orders",
			"Payments",
			"Fulfilment",
			"Shipping",
		],
	},
	{
		label: "a design agency",
		modules: [
			"Clients",
			"Projects & Tasks",
			"Time Tracking",
			"Quotes & Estimates",
			"Invoicing",
			"Files & Documents",
		],
	},
];

/**
 * The auth bar's buttons.
 *
 * ⚠️ This mirrors `apps/quickengine/web/src/components/pill.tsx` by hand — same
 * heights, same fills, same disc. It is duplicated rather than shared because
 * the marketing Pill carries sizes and a `block` mode this bar has no use for.
 * If these two ever disagree, share the component instead of patching one.
 *
 * The disc is black on BOTH variants, matching the marketing buttons: the disc
 * reads as a hole punched in the pill, so it takes the page's colour rather than
 * the button's.
 */
function AuthPill({
	href,
	variant,
	glyph,
	children,
}: {
	href: string;
	variant: "primary" | "secondary";
	/** `back` is kept for the secondary form; nothing renders it right now. */
	glyph: "back" | "launch";
	children: ReactNode;
}) {
	const primary = variant === "primary";
	const Glyph = glyph === "back" ? ArrowLeftIcon : ArrowUpRightIcon;

	return (
		<a
			href={href}
			style={
				primary
					? { backgroundColor: ICE, color: "#000000" }
					: { backgroundColor: GREY, color: ICE }
			}
			className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full font-body font-light text-[13px] leading-none no-underline transition-opacity duration-300 ease-out hover:opacity-85 hover:duration-150 focus-visible:opacity-85 ${
				glyph === "back" ? "ps-1.5 pe-4" : "ps-4 pe-1.5"
			}`}
		>
			{/* Leading on Back, trailing on the forward action — the disc sits on the
			    side it points towards. */}
			{glyph === "back" ? <Disc Glyph={Glyph} side="lead" /> : null}
			{children}
			{glyph === "back" ? null : <Disc Glyph={Glyph} side="trail" />}
		</a>
	);
}

function Disc({
	Glyph,
	side,
}: {
	Glyph: typeof ArrowLeftIcon;
	side: "lead" | "trail";
}) {
	return (
		<span
			aria-hidden="true"
			className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-black ${
				side === "lead" ? "me-2" : "ms-2"
			}`}
		>
			<Glyph size={12} color={ICE} weight="bold" />
		</span>
	);
}

/**
 * Auth shell — the animated field, full bleed, with the form on top.
 *
 * It runs the SAME `WaveBackground` as the marketing hero, not a copy of it. It moved into `@quickengine/ui` behind a `/wave-background`
 * subpath so both apps read one file; a duplicated 150-line shader is the kind
 * of thing that gets tuned in one place and quietly diverges in the other.
 *
 * ⚠️ Subpath, never the barrel. `@quickengine/ui` is imported by every app for
 * things like `Logo`, and exporting this from the index would pull three.js into
 * all of their bundles — the same class of mistake as hard rule 12.
 *
 * ⚠️ The form now sits ON the moving gradient rather than beside it. That is a
 * legibility risk worth watching: the pale band drifts, and any text or field
 * placed here needs enough of its own contrast to survive the brightest frame,
 * not just the one on screen when it was designed.
 */
export function AuthLayout({
	children,
	footer,
	swap,
	home = false,
}: {
	children?: ReactNode;
	/** Legal line, pinned to the bottom of the page. */
	footer?: ReactNode;
	/** The opposite screen — sign-up from sign-in, and the reverse. */
	swap?: { label: string; href: string };
	/**
	 * Show the bar with the mark alone, no action beside it.
	 *
	 * ⚠️ Added for the error screens. The bar was gated entirely on `swap`, which
	 * is right for the stripped screens but wrong for a page like maintenance:
	 * there is nowhere contextual to send anyone, so it passed no `swap` and lost
	 * the mark with it — leaving a message floating on a gradient with no way
	 * home and nothing identifying whose site it was.
	 */
	home?: boolean;
}) {
	return (
		<main className="relative flex min-h-dvh bg-black">
			{/* The bar — mark on the left at the marketing header's inset, the
			    opposite action on the right where Try QuickDash sits. It spans BOTH
			    halves rather than living inside the form column, so the two pages
			    read as one site rather than as an app the visitor was handed off to.

			    Inset from the top rather than filling a fixed bar height: the
			    marketing header can sit flush because it has an opaque background
			    holding it, and this one has none.

			    ⚠️ The WHOLE bar is gated on `swap`, mark included. A page that passes
			    nothing is the background and nothing else, which is what the stripped
			    screens want, the chrome is not load-bearing and should not appear
			    just because a layout was used. */}
			{/* The mark on the left, the opposite screen on the right.

			    The mark IS the way back, it points at the marketing site, not at
			    `/`, which in this app redirects straight to sign-in and would look
			    broken.

			    ⚠️ Matches the marketing header exactly, `--header-h` tall, the same
			    gutter, a 24px mark, and a 36px button. The web header is the master
			    for this bar. They were a mark size and a vertical inset apart, which
			    is invisible on either page alone and obvious the moment you move
			    between them. */}
			{/* ⚠️ Wrapper and header, exactly as the marketing app builds it — the
			    outer box spans the viewport and the inner one carries the height and
			    the gutter. The web header gets its shape from an opaque background;
			    this one has none, so without a container of its own it had no
			    defined box at all and every alignment here was a coincidence of
			    content size. Invisible, same size, same element order. */}
			{swap || home ? (
				<div className="absolute inset-x-0 top-0 z-20">
					<header className="flex h-[var(--header-h)] items-center justify-between site-gutter">
						<a
							href={env.VITE_WEB_URL}
							aria-label="QuickEngine home"
							className="w-fit shrink-0 transition-opacity duration-300 ease-out hover:opacity-70 hover:duration-150"
						>
							<Logo className="h-6 w-auto text-white" />
						</a>

						{swap ? (
							<AuthPill href={swap.href} variant="primary" glyph="launch">
								{swap.label}
							</AuthPill>
						) : null}
					</header>
				</div>
			) : null}

			{/* Full bleed. It was half the screen with black beside it until
			    2026-08-10; the split is gone and the animation now runs edge to edge
			    at every width, which also means there is no longer a breakpoint where
			    it disappears. */}
			<div aria-hidden="true" className="absolute inset-0 overflow-hidden">
				<WaveBackground position="absolute" />
			</div>

			<div className="relative flex w-full flex-col items-center justify-center px-6 pt-24 pb-20 sm:py-16">
				<div className="w-full max-w-sm">{children}</div>

				{/* Pinned to the page rather than sitting under the form, so it stays
				    out of the reading path, legal text belongs available, not in the
				    way. */}
				{footer ? (
					<div className="absolute inset-x-0 bottom-0 flex h-16 items-center justify-center px-6">
						{footer}
					</div>
				) : null}
			</div>
		</main>
	);
}

// Not rendered. The cycling module column — fifteen names, a real business
// configuration lit at a time. Kept whole for the design pass; stripping the
// presentation is not the same as deleting what works.
//
// Named as a component rather than `_ModulePanel`: the underscore made the hook
// rule read it as a plain function and reject every hook inside it.
// biome-ignore lint/correctness/noUnusedVariables: held for the auth design pass, not dead.
function ModulePanel() {
	const [index, setIndex] = useState(0);
	const [still] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);

	useEffect(() => {
		if (still) return;
		const timer = setInterval(
			() => setIndex((i) => (i + 1) % CONFIGURATIONS.length),
			4600,
		);
		return () => clearInterval(timer);
	}, [still]);

	const lit = new Set(CONFIGURATIONS[index].modules);

	return (
		<div className="relative hidden w-1/2 shrink-0 overflow-hidden border-edge border-r bg-field lg:block">
			<div
				aria-hidden="true"
				className="absolute inset-0 flex flex-col justify-center gap-4 pl-[16%]"
				style={{
					maskImage:
						"linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
				}}
			>
				{MODULES.map((name) => (
					<span
						key={name}
						className={`font-body text-[15px] tracking-[-0.01em] transition-colors duration-700 ${
							lit.has(name) ? "text-ink" : "text-dim/30"
						}`}
						style={{ transitionDelay: `${MODULES.indexOf(name) * 28}ms` }}
					>
						{name}
					</span>
				))}
			</div>
		</div>
	);
}

// Not rendered. Kept so the split layout can be restored without rebuilding
// the composition — see the note above.
function _MeshPanel() {
	return (
		<div
			aria-hidden="true"
			className="relative hidden w-1/2 shrink-0 overflow-hidden bg-void lg:block"
		>
			{/* Four lobes at staggered positions, sizes and lightnesses. Every hue is
			    an OFFSET from `--h` rather than an absolute colour, so the panel is a
			    relative of the page's own hue, changing the theme moves it too, and
			    no value here can land somewhere that clashes.

			    Blur is what turns four hard ellipses into a mesh. Without it these
			    read as circles; with it the edges dissolve into each other. */}
			<div
				className="absolute inset-0"
				style={{
					filter: "blur(70px)",
					backgroundColor: `oklch(0.16 calc(0.03 * var(--c)) var(--h))`,
					backgroundImage: [
						"radial-gradient(ellipse 80% 70% at 18% 22%," +
							" oklch(0.62 calc(0.17 * var(--ca)) calc(var(--h) - 18)) 0%," +
							" transparent 62%)",
						"radial-gradient(ellipse 70% 75% at 82% 34%," +
							" oklch(0.42 calc(0.14 * var(--ca)) calc(var(--h) + 26)) 0%," +
							" transparent 60%)",
						"radial-gradient(ellipse 95% 65% at 46% 88%," +
							" oklch(0.3 calc(0.1 * var(--ca)) calc(var(--h) - 40)) 0%," +
							" transparent 66%)",
						"radial-gradient(ellipse 60% 55% at 66% 8%," +
							" oklch(0.78 calc(0.11 * var(--ca)) calc(var(--h) + 8)) 0%," +
							" transparent 58%)",
					].join(","),
				}}
			/>

			{/* Grain over the top. A gradient this large and this smooth bands badly
			    on 8-bit displays; noise is the fix, and it is also the texture that
			    stops it reading as flat CSS. */}
			<div className="noise-layer absolute inset-0" />
		</div>
	);
}
