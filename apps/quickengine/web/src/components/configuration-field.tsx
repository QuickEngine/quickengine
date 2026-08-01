import { useEffect, useState } from "react";

/**
 * The configuration field — the page's one signature element.
 *
 * The thesis it renders: **the same substrate, configured differently per
 * business.** Every QuickDash workspace draws from one set of modules; a shop
 * lights a different subset than an agency. A gradient behind centred text could
 * sit on any product's landing page. This can only belong to a modular backend.
 *
 * It absorbs what `Showcase` and `Convergence` were each doing weakly — "pick a
 * business type and watch it assemble" and "scattered capabilities converge" —
 * into one moment, so the page makes its argument once, well.
 *
 * Everything here is real: the fifteen modules are the fifteen that exist in
 * `packages/modules`, and each configuration follows an anchor workflow from
 * ROADMAP.md rather than a shape chosen because it looked good.
 */

type Module = { id: string; label: string; x: number; y: number };

// Positioned by hand on a loose grid. A regular lattice reads as decoration; a
// fully random scatter reads as noise. The slight vertical jitter is what makes
// it look like a system rather than a table.
const MODULES: Module[] = [
	{ id: "products", label: "Products", x: 140, y: 112 },
	{ id: "inventory", label: "Inventory", x: 322, y: 134 },
	{ id: "orders", label: "Orders", x: 502, y: 106 },
	{ id: "payments", label: "Payments", x: 688, y: 128 },
	{ id: "fulfillment", label: "Fulfilment", x: 868, y: 104 },
	{ id: "clients", label: "Clients", x: 92, y: 292 },
	{ id: "quotes", label: "Quotes", x: 272, y: 274 },
	{ id: "invoices", label: "Invoices", x: 452, y: 300 },
	{ id: "shipping", label: "Shipping", x: 638, y: 278 },
	{ id: "bookings", label: "Bookings", x: 828, y: 296 },
	{ id: "projects", label: "Projects", x: 178, y: 452 },
	{ id: "time", label: "Time", x: 358, y: 470 },
	{ id: "files", label: "Files", x: 540, y: 444 },
	{ id: "contracts", label: "Contracts", x: 722, y: 466 },
	{ id: "analytics", label: "Analytics", x: 898, y: 448 },
];

// Each path is a real workflow from the roadmap's anchor journeys, in order, so
// the wiring animates the way the business actually runs.
const CONFIGURATIONS = [
	{
		label: "Retail shop",
		path: [
			"products",
			"inventory",
			"orders",
			"payments",
			"fulfillment",
			"shipping",
		],
	},
	{
		label: "Design agency",
		path: ["clients", "projects", "time", "quotes", "invoices", "files"],
	},
	{
		label: "Consultancy",
		path: ["clients", "bookings", "contracts", "invoices", "payments"],
	},
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export function ConfigurationField() {
	const [index, setIndex] = useState(0);
	// Read once on mount rather than via a media-query listener: someone changing
	// this preference mid-visit is vanishingly rare, and the listener costs more
	// than it earns. Static field, no cycling, still legible.
	const [still] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);

	useEffect(() => {
		if (still) return;
		const timer = setInterval(
			() => setIndex((i) => (i + 1) % CONFIGURATIONS.length),
			4200,
		);
		return () => clearInterval(timer);
	}, [still]);

	const active = CONFIGURATIONS[index];
	const lit = new Set(active.path);
	const edges = active.path
		.slice(0, -1)
		.map((from, i) => [BY_ID.get(from), BY_ID.get(active.path[i + 1])] as const)
		.filter((pair): pair is readonly [Module, Module] =>
			Boolean(pair[0] && pair[1]),
		);

	return (
		<div className="relative w-full">
			{/* Decorative: the argument is carried by the heading and the label below.
			    A screen reader reciting fifteen module names would be noise. */}
			<svg
				viewBox="0 0 1000 560"
				className="w-full"
				role="presentation"
				aria-hidden="true"
			>
				<title>Module configuration field</title>
				<defs>
					<radialGradient id="field-wash" cx="50%" cy="42%" r="62%">
						<stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.20" />
						<stop offset="55%" stopColor="#12203F" stopOpacity="0.10" />
						<stop offset="100%" stopColor="#05070D" stopOpacity="0" />
					</radialGradient>
				</defs>

				<rect width="1000" height="560" fill="url(#field-wash)" />

				{/* Dormant modules stay visible. The point is that the whole field is
				    always THERE and only the configuration changes — fading them out
				    would say "you get fewer modules", the opposite of the claim. */}
				{MODULES.map((m) => {
					const on = lit.has(m.id);
					return (
						<g key={m.id}>
							<circle
								cx={m.x}
								cy={m.y}
								r={on ? 5.5 : 3}
								className="transition-all duration-700 ease-out"
								fill={on ? "#5B9BFF" : "#16203A"}
							/>
							{on && (
								<circle
									cx={m.x}
									cy={m.y}
									r="15"
									fill="none"
									stroke="#2E6BFF"
									strokeOpacity="0.28"
								/>
							)}
							<text
								x={m.x}
								y={m.y + 30}
								textAnchor="middle"
								className="transition-all duration-700"
								fill={on ? "#E8EDF7" : "#8A97B0"}
								fillOpacity={on ? 0.95 : 0.32}
								style={{
									font: "500 13px var(--font-mono)",
									letterSpacing: "0.02em",
								}}
							>
								{m.label}
							</text>
						</g>
					);
				})}

				{/* Wiring drawn last so it sits above the rests. Keyed on the config so
				    React remounts the paths and the draw-on animation replays. */}
				{edges.map(([from, to]) => (
					<line
						key={`${active.label}-${from.id}-${to.id}`}
						x1={from.x}
						y1={from.y}
						x2={to.x}
						y2={to.y}
						stroke="#2E6BFF"
						strokeWidth="1.25"
						strokeOpacity="0.55"
						className={still ? undefined : "field-wire"}
					/>
				))}
			</svg>

			<p className="mt-2 text-center font-mono text-dim text-xs tracking-[0.18em] uppercase sm:text-[13px]">
				Configured for{" "}
				<span className="text-glow transition-colors duration-500">
					{active.label}
				</span>
			</p>

			<style>{`
				.field-wire {
					stroke-dasharray: 1000;
					stroke-dashoffset: 1000;
					animation: field-draw 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
				}
				@keyframes field-draw { to { stroke-dashoffset: 0; } }
				@media (prefers-reduced-motion: reduce) {
					.field-wire { animation: none; stroke-dashoffset: 0; }
				}
			`}</style>
		</div>
	);
}
