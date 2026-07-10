import { TrendDown, TrendUp } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@quickengine/ui";
import type { ReactNode } from "react";

// Cyber-minimal data surface: void-black panel, hairline border, generous
// padding. The shared look for every page-content card, matching docs/test.
export function Panel({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6",
				className,
			)}
		>
			{children}
		</div>
	);
}

// Small uppercase tracked label that sits atop panels and stats.
export function PanelLabel({ children }: { children: ReactNode }) {
	return (
		<div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
			{children}
		</div>
	);
}

type Direction = "up" | "down";

// Inline trend line drawn straight from the numbers. Monochrome via currentColor
// so the parent tints it to match the delta direction.
function Sparkline({
	data,
	className,
}: {
	data: number[];
	className?: string;
}) {
	const width = 72;
	const height = 28;
	const pad = 2;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const step = (width - pad * 2) / Math.max(data.length - 1, 1);
	const points = data
		.map((d, i) => {
			const x = pad + i * step;
			const y = pad + (1 - (d - min) / range) * (height - pad * 2);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			fill="none"
			className={className}
			role="img"
			aria-label="Trend"
		>
			<title>Trend</title>
			<polyline
				points={points}
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// Metric card: tracked label → big Clash-Grotesk number → sparkline + delta. The
// character comes from the data (trend line + up/down delta), not decoration.
export function StatCard({
	label,
	value,
	hint,
	delta,
	data,
}: {
	label: string;
	value: string;
	hint?: string;
	delta?: { text: string; dir: Direction };
	data?: number[];
}) {
	const trendColor = delta
		? delta.dir === "down"
			? "text-rose-400"
			: "text-emerald-400"
		: undefined;

	return (
		<Panel>
			<PanelLabel>{label}</PanelLabel>
			<div className="mt-3 flex items-end justify-between gap-3">
				<div className="font-display font-normal text-[2.5rem] text-foreground leading-none tracking-tight tabular-nums">
					{value}
				</div>
				{data ? (
					<Sparkline data={data} className={cn("shrink-0", trendColor)} />
				) : null}
			</div>
			<div className="mt-2 flex items-center gap-2 text-sm">
				{delta ? (
					<span
						className={cn("flex items-center gap-1 font-medium", trendColor)}
					>
						{delta.dir === "down" ? (
							<TrendDown className="size-3.5" />
						) : (
							<TrendUp className="size-3.5" />
						)}
						{delta.text}
					</span>
				) : null}
				{hint ? <span className="text-muted-foreground">{hint}</span> : null}
			</div>
		</Panel>
	);
}
