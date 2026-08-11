import {
	CalendarBlankIcon,
	CaretDownIcon,
	ChartLineIcon,
	MagnifyingGlassIcon,
	PackageIcon,
	ReceiptIcon,
	ShoppingBagIcon,
	SquaresFourIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { Logo } from "@quickengine/ui";
import { ICE } from "@/components/pill";
import { STAGE } from "@/lib/surfaces";

/**
 * Meet QuickDash — the product introduction, staged rather than screenshotted.
 *
 * The move here is the STAGE, not the picture. A flat image on a black page
 * reads as a press kit; the same content inside a macOS window on a lit backdrop
 * reads as software running on a machine. Depth is what sells it, and depth
 * costs three divs.
 *
 * The window contents are DRAWN — see `Workspace` below. There is no image.
 *
 * A second window holding the `quick` CLI overhung the bottom-right corner until
 * 2026-08-10. It was removed on the same principle the page has followed
 * throughout: one idea per section. The CLI is a real product and deserves its
 * own moment rather than a cameo in this one.
 *
 * The backdrop is the page's own gradient rather than a photograph, so the stage
 * belongs to this site instead of looking like stock wallpaper — and it costs no
 * asset and no request.
 *
 * ⚠️ Everything shown in the window must stay INVENTED. This is a public page,
 * so any client name, invoice amount or email address visible here is published.
 * Drawing it rather than screenshotting a workspace is partly what guarantees
 * that — there is no live data anywhere near this file.
 */

/** The macOS traffic lights, in their actual system colours. These were neutral
 *  grey until 2026-08-10 — grey is the safer choice in the abstract, but it also
 *  reads as a generic "browser mockup". The real colours are what make the frame
 *  register as macOS at a glance, which is the whole point of the frame. */
const LIGHTS = ["#FF5F57", "#FEBC2E", "#28C840"];

function WindowDots() {
	return (
		<div className="flex shrink-0 items-center gap-[6px]">
			{LIGHTS.map((colour) => (
				<span
					key={colour}
					className="size-[11px] rounded-full"
					style={{ backgroundColor: colour }}
				/>
			))}
		</div>
	);
}

// Module names are the real ones from `packages/modules`. Every record is
// invented and must stay that way — see the warning at the top of this file.
const NAV = [
	{ label: "Overview", Icon: SquaresFourIcon, active: true },
	{ label: "Clients", Icon: UsersIcon },
	{ label: "Orders", Icon: ShoppingBagIcon, badge: "12" },
	{ label: "Invoices", Icon: ReceiptIcon, badge: "3" },
	{ label: "Inventory", Icon: PackageIcon },
	{ label: "Bookings", Icon: CalendarBlankIcon },
	{ label: "Reporting", Icon: ChartLineIcon },
];

const STATS = [
	{ label: "Revenue", value: "$48,290", delta: "+12.4%", up: true },
	{ label: "Orders", value: "1,284", delta: "+3.1%", up: true },
	{ label: "Outstanding", value: "$3,740", delta: "-8.0%", up: false },
];

const ACTIVITY = [
	{
		who: "Northwind Traders",
		what: "Invoice INV-1042 sent",
		when: "2m",
		tone: "#DCE7ED",
	},
	{
		who: "Bright Harbour Co.",
		what: "Payment received · $980.00",
		when: "18m",
		tone: "#28C840",
	},
	{
		who: "Ridgeway Studio",
		what: "Order #4417 fulfilled",
		when: "1h",
		tone: "#DCE7ED",
	},
	{
		who: "Calder & Sons",
		what: "Invoice overdue · $1,340.00",
		when: "3h",
		tone: "#FF5F57",
	},
	{
		who: "Meridian Works",
		what: "Booking confirmed · Thu 14:00",
		when: "5h",
		tone: "#DCE7ED",
	},
	{
		who: "Pike & Fletcher",
		what: "Quote accepted · $6,400.00",
		when: "6h",
		tone: "#28C840",
	},
	{
		who: "Ashgrove Interiors",
		what: "Order #4412 shipped",
		when: "9h",
		tone: "#DCE7ED",
	},
	{
		who: "Rowan Cooperative",
		what: "Stock low · Brass fittings, 6 left",
		when: "11h",
		tone: "#FEBC2E",
	},
	{
		who: "Halcyon Group",
		what: "Client added",
		when: "1d",
		tone: "#DCE7ED",
	},
];

// Twelve months, normalised 0-1. Hand-picked rather than random so the line has
// a shape a real business would recognise — a soft dip mid-year, a strong finish.
const SERIES = [
	0.32, 0.38, 0.34, 0.46, 0.52, 0.44, 0.5, 0.62, 0.58, 0.71, 0.83, 0.95,
];

/** Builds a smooth-ish path across the series. Points are joined with short
 *  horizontal control handles, which rounds the corners without the overshoot a
 *  full cardinal spline gives on a rising line. */
function chartPath(points: number[], width: number, height: number) {
	const step = width / (points.length - 1);
	const y = (v: number) => height - v * height;
	let d = `M 0 ${y(points[0]).toFixed(2)}`;
	for (let i = 1; i < points.length; i += 1) {
		const x0 = step * (i - 1);
		const x1 = step * i;
		const cx = step * 0.4;
		d += ` C ${(x0 + cx).toFixed(2)} ${y(points[i - 1]).toFixed(2)}, ${(x1 - cx).toFixed(2)} ${y(points[i]).toFixed(2)}, ${x1.toFixed(2)} ${y(points[i]).toFixed(2)}`;
	}
	return d;
}

/**
 * The workspace interior, drawn rather than screenshotted.
 *
 * Replaced `public/quickdash-preview.png` on 2026-08-10. Markup beats an image
 * on every axis that matters here: sharp at any size instead of soft on retina,
 * restyles with the page instead of going stale when a colour changes, weighs a
 * fraction of 92KB, and can never accidentally publish a real client name.
 *
 * `aria-hidden`: this is an illustration of the product. Reciting a fake ledger
 * to a screen reader is noise, and the heading above it carries the meaning.
 */
function Workspace() {
	const w = 560;
	const h = 150;
	const line = chartPath(SERIES, w, h);

	return (
		<div
			aria-hidden="true"
			className="flex aspect-[1504/1150] bg-[#0a0d10] font-body text-[11.5px] sm:aspect-[1504/945]"
		>
			{/* The sidebar runs to the top edge and holds the traffic lights itself.
			    That is the whole reason there is no title bar: the chrome belongs to
			    the panel that is already there, not to a strip added above it. */}
			<aside className="flex w-[27%] max-w-[218px] shrink-0 flex-col border-white/[0.06] border-r bg-[#101418]">
				<div className="flex items-center gap-2.5 px-4 pt-4 pb-5">
					<WindowDots />
				</div>

				<div className="flex items-center justify-between px-4 pb-4">
					<div className="flex min-w-0 items-center gap-2">
						<Logo className="h-[13px] w-auto shrink-0 text-white/85" />
						<span className="truncate font-normal text-[12.5px] text-white/85">
							Harbour Supply
						</span>
						<CaretDownIcon size={9} className="shrink-0 text-white/35" />
					</div>
					<MagnifyingGlassIcon size={13} className="shrink-0 text-white/35" />
				</div>

				<nav className="flex flex-col gap-0.5 px-2.5">
					{NAV.map(({ label, Icon, active, badge }) => (
						<span
							key={label}
							className={`flex items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] font-light ${
								active ? "bg-white/[0.08] text-white" : "text-white/45"
							}`}
						>
							<Icon size={14} weight={active ? "fill" : "regular"} />
							<span className="flex-1 truncate">{label}</span>
							{badge ? (
								<span className="rounded-full bg-white/[0.09] px-1.5 py-px text-[9.5px] text-white/55">
									{badge}
								</span>
							) : null}
						</span>
					))}
				</nav>

				<div className="mt-6 px-4 pb-2 font-light text-[10px] text-white/25 uppercase tracking-[0.14em]">
					Connected
				</div>
				<div className="flex flex-col gap-0.5 px-2.5">
					{["Storefront", "Stripe", "Resend"].map((item) => (
						<span
							key={item}
							className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-[6px] font-light text-white/40"
						>
							<span className="size-[5px] rounded-full bg-[#28C840]" />
							<span className="truncate">{item}</span>
						</span>
					))}
				</div>

				<div className="mt-auto flex items-center gap-2.5 border-white/[0.06] border-t px-4 py-3">
					<span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-white/[0.12] font-normal text-[10px] text-white/80">
						AR
					</span>
					<span className="truncate font-light text-white/55">Alex Reyes</span>
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex items-center justify-between border-white/[0.06] border-b px-6 py-4">
					<div>
						<div className="font-normal text-[14px] text-white">Overview</div>
						<div className="mt-0.5 font-light text-[10.5px] text-white/35">
							Last 12 months
						</div>
					</div>
					<span
						style={{ backgroundColor: ICE }}
						className="rounded-full px-3.5 py-[6px] font-normal text-[10.5px] text-black"
					>
						New invoice
					</span>
				</div>

				<div className="grid grid-cols-3 border-white/[0.06] border-b">
					{STATS.map((stat, i) => (
						<div
							key={stat.label}
							className={`px-6 py-4 ${i < 2 ? "border-white/[0.06] border-r" : ""}`}
						>
							<div className="font-light text-[10.5px] text-white/35">
								{stat.label}
							</div>
							<div className="mt-2 flex items-baseline gap-2">
								<span
									style={{ fontVariantNumeric: "tabular-nums" }}
									className="font-light text-[17px] text-white"
								>
									{stat.value}
								</span>
								<span
									style={{ color: stat.up ? "#28C840" : "#FF5F57" }}
									className="font-light text-[10px]"
								>
									{stat.delta}
								</span>
							</div>
						</div>
					))}
				</div>

				{/* The chart. `preserveAspectRatio="none"` lets it stretch to whatever
				    width the window ends up at while the stroke stays even, because
				    `vector-effect` keeps it from scaling with the viewBox. */}
				<div className="border-white/[0.06] border-b px-6 py-5">
					<svg
						viewBox={`0 0 ${w} ${h}`}
						preserveAspectRatio="none"
						className="h-[19%] max-h-[150px] min-h-[68px] w-full"
						role="presentation"
					>
						<title>Revenue</title>
						<defs>
							<linearGradient id="qd-fill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#DCE7ED" stopOpacity="0.22" />
								<stop offset="100%" stopColor="#DCE7ED" stopOpacity="0" />
							</linearGradient>
						</defs>
						<path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill="url(#qd-fill)" />
						<path
							d={line}
							fill="none"
							stroke="#DCE7ED"
							strokeWidth="1.5"
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
				</div>

				<div className="flex min-h-0 flex-1 flex-col px-6 py-4">
					<div className="pb-2 font-light text-[10px] text-white/25 uppercase tracking-[0.14em]">
						Activity
					</div>
					{ACTIVITY.map((row) => (
						<div
							key={row.what}
							className="flex items-center gap-3 border-white/[0.04] border-b py-[9px] last:border-b-0"
						>
							<span
								className="size-[5px] shrink-0 rounded-full"
								style={{ backgroundColor: row.tone }}
							/>
							<span className="w-[34%] shrink-0 truncate font-light text-white/85">
								{row.who}
							</span>
							<span className="min-w-0 flex-1 truncate font-light text-white/40">
								{row.what}
							</span>
							<span
								style={{ fontVariantNumeric: "tabular-nums" }}
								className="shrink-0 font-light text-[10px] text-white/25"
							>
								{row.when}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function MeetQuickDash() {
	return (
		// Less top padding than bottom, deliberately. This is the first section on
		// the panel, so its top spacing is measured from the panel's own edge — the
		// symmetric 128/128 that suits a section between two others left it sitting
		// low and made the panel look like it started late.
		<section className="pt-20 pb-32 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				Meet QuickDash
			</h2>

			<p className="mt-7 max-w-[58ch] font-body font-light text-[clamp(1rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
				Bring your day-to-day operations together in a workspace designed to
				give you a clearer view of your business.
			</p>

			{/* The stage. Generous padding is the point — the margin of backdrop
			    around the window is what reads as space behind the glass, and
			    tightening it collapses the effect back into a bordered screenshot. */}
			<div
				className="relative mt-16 overflow-hidden rounded-3xl p-4 sm:p-10 lg:p-16"
				style={{ background: STAGE }}
			>
				{/* The workspace window. Ring rather than border so the outline sits
				    outside the radius and does not clip the corners.

				    ⚠️ NO TITLE BAR. A full-width chrome strip across the top was here
				    until 2026-08-10 and it aged the whole thing, every application
				    worth copying now runs the sidebar to the top edge and puts the
				    traffic lights inside it. The lights live in `Workspace`. */}
				{/* ⚠️ Below `sm` the window is held at a fixed 860px and allowed to
				    CROP against the stage, rather than shrinking to fit. Scaled down
				    to phone width the sidebar collapses to about 90px and the 11.5px
				    interface text becomes unreadable, the thing meant to show the
				    product ends up proving it does not work.

				    Cropping keeps every pixel at its real size: you see the sidebar
				    and the start of the workspace exactly as they are, and the rest
				    runs off the edge. 980px, not 860, the wider it is held, the
				    larger the interface reads on a phone, at the cost of showing
				    less of it. That trade is worth taking: legible and partial beats
				    complete and unreadable. A strip of backdrop stays visible on the left,
				    so it reads as a window sitting on a desk rather than as content
				    that overflowed by accident. */}
				<div className="w-[980px] overflow-hidden rounded-2xl shadow-[0_40px_90px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/10 sm:w-full">
					<Workspace />
				</div>
			</div>
		</section>
	);
}
