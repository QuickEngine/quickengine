"use client";

import {
	Broadcast,
	Cloud,
	CreditCard,
	Fingerprint,
	MagnifyingGlass,
	Queue,
} from "@phosphor-icons/react";
import { Logo } from "@quickengine/ui";

// Capability nodes arranged radially, wired into the central QuickDash mark —
// "all the pieces you'd normally stitch together, unified into one backend."
// Coordinates are percentages of the box (hexagonal ring at radius ~36).
// Static for now; this is the surface for the convergence animation later.
const NODES = [
	{ label: "Auth", Icon: Fingerprint, x: 86, y: 50 },
	{ label: "Billing", Icon: CreditCard, x: 68, y: 81 },
	{ label: "Storage", Icon: Cloud, x: 32, y: 81 },
	{ label: "Search", Icon: MagnifyingGlass, x: 14, y: 50 },
	{ label: "Jobs", Icon: Queue, x: 32, y: 19 },
	{ label: "Realtime", Icon: Broadcast, x: 68, y: 19 },
];

export function Convergence() {
	return (
		<div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-secondary/20">
			{/* Connecting lines from each node into the center hub. */}
			<svg
				className="absolute inset-0 h-full w-full text-border"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				{NODES.map((n) => (
					<line
						key={n.label}
						x1="50"
						y1="50"
						x2={n.x}
						y2={n.y}
						stroke="currentColor"
						strokeWidth="0.25"
					/>
				))}
			</svg>

			{/* Center hub — the QuickDash mark everything wires into. */}
			<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 flex size-16 items-center justify-center rounded-full border border-border bg-background">
				<Logo className="size-8 text-foreground" />
			</div>

			{/* Outer capability nodes. */}
			{NODES.map((n) => (
				<div
					key={n.label}
					style={{ left: `${n.x}%`, top: `${n.y}%` }}
					className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col items-center gap-1.5"
				>
					<div className="flex size-10 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground">
						<n.Icon className="size-4" />
					</div>
					<span className="text-[11px] text-muted-foreground">{n.label}</span>
				</div>
			))}
		</div>
	);
}
