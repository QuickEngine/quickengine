import { type ReactNode, useEffect, useState } from "react";

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
 * Centred auth shell.
 *
 * The split layout is gone from the render, not from the file. `_ModulePanel`
 * below still holds the cycling module column, and `_MeshPanel` the gradient
 * version — both unused, both intact, so either can be dropped back in without
 * rebuilding the composition.
 */
export function AuthLayout({
	children,
	footer,
}: {
	children?: ReactNode;
	/** Legal line, pinned to the bottom of the page. */
	footer?: ReactNode;
}) {
	return (
		<main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-void px-6 py-16">
			<div
				aria-hidden="true"
				className="noise-layer pointer-events-none absolute inset-0"
			/>

			<div className="relative">{children}</div>

			{/* Pinned to the page rather than sitting under the form, so it stays out
			    of the reading path — legal text belongs available, not in the way. */}
			{footer ? (
				<div className="site-gutter absolute inset-x-0 bottom-0 flex h-16 items-center justify-center">
					{footer}
				</div>
			) : null}
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
			    relative of the page's own hue — changing the theme moves it too, and
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
