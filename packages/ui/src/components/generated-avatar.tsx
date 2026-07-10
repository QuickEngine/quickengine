"use client";

import { useId } from "react";

// FNV-1a string hash → 32-bit uint. Stable across runs.
function hashSeed(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// mulberry32 seeded PRNG → deterministic 0..1 sequence from a seed.
function makeRng(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Deterministic avatar: a two-hue linear gradient with a fine dot-grid mesh over
// it. EVERYTHING derives from the seed — the hue pair, gradient angle, grid
// spacing, dot size, and grid rotation — so every user is effectively unique and
// even near-matches never render identically. Same `seed` → same image, so pass
// the user's id (no storage needed).
export function GeneratedAvatar({
	seed,
	className,
}: {
	seed: string;
	className?: string;
}) {
	const uid = useId().replace(/:/g, "");
	const rng = makeRng(hashSeed(seed));

	const hue1 = Math.floor(rng() * 360);
	// Second hue 40–110° away for a harmonious (not clashing) gradient.
	const hue2 = Math.floor((hue1 + 40 + rng() * 70) % 360);
	const angle = Math.floor(rng() * 360);
	const spacing = 4 + rng() * 3; // grid density: 4–7 units
	const dotR = spacing * (0.36 + rng() * 0.1); // dot size, proportional
	const gridAngle = Math.floor(rng() * 90); // grid rotation

	return (
		<svg viewBox="0 0 100 100" className={className} aria-hidden="true">
			<defs>
				<linearGradient
					id={`${uid}-g`}
					x1="0"
					y1="0.5"
					x2="1"
					y2="0.5"
					gradientTransform={`rotate(${angle} 0.5 0.5)`}
				>
					<stop offset="0%" stopColor={`hsl(${hue1} 70% 58%)`} />
					<stop offset="100%" stopColor={`hsl(${hue2} 68% 46%)`} />
				</linearGradient>
				<pattern
					id={`${uid}-dots`}
					width={spacing}
					height={spacing}
					patternUnits="userSpaceOnUse"
					patternTransform={`rotate(${gridAngle})`}
				>
					<circle
						cx={spacing / 2}
						cy={spacing / 2}
						r={dotR}
						fill="#000"
						fillOpacity="0.2"
					/>
				</pattern>
			</defs>
			<rect width="100" height="100" fill={`url(#${uid}-g)`} />
			<rect width="100" height="100" fill={`url(#${uid}-dots)`} />
		</svg>
	);
}
