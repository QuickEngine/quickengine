/**
 * Every palette in QuickDash, and the script that writes them.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * 🔴 Fifty palettes is eight hundred CSS custom properties. Hand maintaining
 * that is not possible, and the values were generated from a table that lived
 * nowhere: change one anchor and there was no way to regenerate without redoing
 * the whole thing from memory. The table is the source of truth and this script
 * writes `theme.css` from it.
 *
 * Run it with `node packages/ui/scripts/build-palettes.mjs`.
 *
 * ── What a palette IS ────────────────────────────────────────────────────────
 *
 * 🔑 Five AUTHORED colours per mode: ground, surface, raised, line, accent. Only
 * the rungs between them are computed. That is the whole reason these read as
 * different themes rather than one theme tinted fifty ways: the distance from
 * the ground to the raised surface is a decision somebody made per palette, so
 * Linen is flat and Obsidian is dramatic even though one function emits both.
 *
 * ⚠️ Hue rotation is NOT a theme. Three earlier attempts rotated a single
 * ladder and every one of them looked like the same design in different
 * colours. If a palette is added, author its five colours; do not derive them.
 *
 * ⚠️ The ORDER of the ladder is load bearing: floor under outlet under tile
 * under card under popover. Break it and cards read as holes in the page. The
 * script asserts it for all hundred ramps and refuses to write if any fail.
 */

const PALETTES = {
	obsidian: {
		dark: ["#0b0910", "#1c1826", "#2a2438", "#3d3550", "#a78bfa"],
		light: ["#eae7f2", "#f7f5fb", "#fdfcff", "#c3bcd6", "#6d4aca"],
		note: "Black glass. The longest climb from floor to card.",
	},
	abyss: {
		dark: ["#04080d", "#0e1a26", "#16283a", "#1f3c56", "#38bdf8"],
		light: ["#e2edf5", "#f2f8fc", "#fbfdff", "#adc7da", "#0369a1"],
		note: "Deep water. Cold and very dark.",
	},
	void: {
		dark: ["#08070a", "#151318", "#211d26", "#332c3b", "#e879f9"],
		light: ["#efe4f2", "#f7edf8", "#fcf5fd", "#cdb6d2", "#a21caf"],
		note: "Almost nothing, then a flash of orchid.",
	},
	sandstone: {
		dark: ["#2a2419", "#302a1f", "#373025", "#4d442f", "#d6b981"],
		light: ["#e8dfcc", "#efe8d8", "#f5efe2", "#cbbb9c", "#8a6f3c"],
		note: "Almost flat. The hairlines carry it.",
	},
	linen: {
		dark: ["#22201c", "#282621", "#2e2c26", "#403c33", "#c9bfa8"],
		light: ["#ece7de", "#f3efe8", "#f8f5f0", "#cdc4b4", "#7a7060"],
		note: "Paper and thread. Quiet and close.",
	},
	concrete: {
		dark: ["#1e1e1f", "#242426", "#2a2a2c", "#3a3a3d", "#9fa3a8"],
		light: ["#e3e3e4", "#ebebec", "#f2f2f3", "#c3c3c6", "#5c6066"],
		note: "Poured grey. Nothing shouts.",
	},
	gloaming: {
		dark: ["#1a1420", "#241d2e", "#2d2740", "#3f3557", "#f0a868"],
		light: ["#ece5ef", "#f6f1f7", "#fbf8fb", "#cfc0d2", "#b5651d"],
		note: "Violet dusk with a warm lamp in it.",
	},
	harvest: {
		dark: ["#241c14", "#2b251b", "#333024", "#4a442c", "#8fbf6a"],
		light: ["#eae2d2", "#f3eee2", "#f9f6ee", "#c8bda2", "#4d7a2e"],
		note: "Warm earth, cool green growing out of it.",
	},
	lagoon: {
		dark: ["#0f2024", "#16303a", "#1d3f4d", "#28596b", "#f4a4a4"],
		light: ["#dcecee", "#eaf5f6", "#f4fafb", "#a8c9cd", "#c05a5a"],
		note: "Cold water, warm coral under it.",
	},
	tundra: {
		dark: ["#171b1a", "#1f2725", "#273330", "#334340", "#e2c391"],
		light: ["#e0e6e3", "#eef2f0", "#f7faf9", "#bcc7c3", "#8a6a34"],
		note: "Grey green ice, low sun.",
	},
	aubergine: {
		dark: ["#1b1018", "#261722", "#31202d", "#452e40", "#9ad1a4"],
		light: ["#efe3ec", "#f7eff5", "#fcf7fa", "#d3bccb", "#2f7d45"],
		note: "Deep purple, sharp green.",
	},
	driftwood: {
		dark: ["#2f2b28", "#383431", "#413c39", "#544d48", "#c9b8a2"],
		light: ["#e8e2da", "#f2eee8", "#f9f6f2", "#cabfae", "#6f5f4a"],
		note: "A lighter dark. Gentle and dusty.",
	},
	pewter: {
		dark: ["#2c3033", "#353a3e", "#3e444a", "#4e565e", "#a9c0d0"],
		light: ["#dee4e8", "#edf1f4", "#f6f9fb", "#b6c3cd", "#476a80"],
		note: "Soft metal. Blue in the shadows.",
	},
	sage: {
		dark: ["#2a302b", "#333a34", "#3c443d", "#4b564c", "#c2d6ae"],
		light: ["#e2e8dd", "#eff3ea", "#f8faf5", "#bdc7b3", "#55703f"],
		note: "A lit room with plants in it.",
	},
	ultraviolet: {
		dark: ["#150b2e", "#1f1140", "#2a1856", "#3d2379", "#22d3ee"],
		light: ["#e6e0f7", "#f2ecfd", "#faf7ff", "#c1b3e2", "#0e7490"],
		note: "Saturated purple, electric cyan.",
	},
	inferno: {
		dark: ["#1d0a0a", "#2b0f0e", "#3a1513", "#54201c", "#fb923c"],
		light: ["#f6dedb", "#fdeeeb", "#fff8f6", "#dfb4ad", "#c2410c"],
		note: "Hot and red. Not subtle.",
	},
	acid: {
		dark: ["#111a06", "#19260a", "#22330e", "#334d16", "#bef264"],
		light: ["#e6f0d2", "#f1f8e4", "#f9fcf2", "#c2d4a0", "#4d7c0f"],
		note: "Toxic green. Awake at 3am.",
	},
	flamingo: {
		dark: ["#2b0f22", "#3a142e", "#4a1a3b", "#652553", "#fda4af"],
		light: ["#fadfe9", "#fdeef3", "#fff8fa", "#e6b7c6", "#be185d"],
		note: "Pink on pink, and proud.",
	},
	cyber: {
		dark: ["#0a0e1a", "#101828", "#182338", "#243352", "#f0abfc"],
		light: ["#e4e7f2", "#f0f2f8", "#f9fafd", "#b8bfd4", "#a21caf"],
		note: "Blue city, magenta signage.",
	},
	fog: {
		dark: ["#1c2022", "#232829", "#2a3032", "#374042", "#94a8ad"],
		light: ["#e0e5e6", "#eef1f2", "#f7f9f9", "#bcc6c8", "#4a6165"],
		note: "Grey and damp. Almost no colour.",
	},
	dune: {
		dark: ["#221f1a", "#2a2620", "#322d26", "#443d31", "#d4b483"],
		light: ["#e9e2d5", "#f3efe6", "#faf7f1", "#cbc0ac", "#8a6b3d"],
		note: "Sand at dusk. Warm and low.",
	},
	juniper: {
		dark: ["#161d1b", "#1d2624", "#242f2c", "#2f3d3a", "#7fb8a5"],
		light: ["#dee7e4", "#ecf2f0", "#f6faf9", "#b3c4bf", "#33705f"],
		note: "Still water in a forest.",
	},
	plumsmoke: {
		dark: ["#1a171f", "#221e28", "#2a2532", "#3a3344", "#b8a6c9"],
		light: ["#e7e3ec", "#f2eff5", "#faf8fc", "#c6bdd0", "#63527a"],
		note: "Smoke with a purple cast.",
	},
	cinder: {
		dark: ["#1a1817", "#221f1e", "#2a2725", "#3a3532", "#c4a99a"],
		light: ["#e6e1de", "#f1eeec", "#f9f7f6", "#c8bfb9", "#75604f"],
		note: "Cooling ash. Warm grey.",
	},
	emerald: {
		dark: ["#06140f", "#0d2419", "#123324", "#194a34", "#34d399"],
		light: ["#dcefe5", "#f0faf5", "#fafffc", "#a9cdbc", "#047857"],
		note: "One green stone, cut deep.",
	},
	sapphire: {
		dark: ["#070f22", "#0d1936", "#12224a", "#1b3269", "#60a5fa"],
		light: ["#dee7f7", "#eff4fd", "#fafcff", "#aabdda", "#1d4ed8"],
		note: "Blue with weight behind it.",
	},
	ruby: {
		dark: ["#170609", "#260a11", "#360e18", "#4d1424", "#fb7185"],
		light: ["#f7dde2", "#fdeef1", "#fff9fa", "#dfaeb6", "#be123c"],
		note: "Red, and expensive about it.",
	},
	topaz: {
		dark: ["#171006", "#26190a", "#35230d", "#4c3212", "#fbbf24"],
		light: ["#f6e9cf", "#fdf6e6", "#fffcf5", "#dcc79b", "#b45309"],
		note: "Warm yellow, lit from inside.",
	},
	amethyst: {
		dark: ["#120a1c", "#1d1030", "#281745", "#3a2166", "#c084fc"],
		light: ["#ece2f7", "#f7f1fd", "#fdfaff", "#c8b6dd", "#7e22ce"],
		note: "Purple crystal, cool not sweet.",
	},
	crt: {
		dark: ["#0d1108", "#141a0c", "#1c2411", "#293617", "#b8e04a"],
		light: ["#e4ead2", "#f2f6e6", "#fafcf3", "#c3cda6", "#5b7315"],
		note: "An old monitor with the brightness up.",
	},
	polaroid: {
		dark: ["#221f1b", "#2b2721", "#332f28", "#443f34", "#e8c39a"],
		light: ["#efe8dc", "#f8f4ec", "#fdfbf7", "#cfc4ae", "#9a6b3a"],
		note: "A photograph left in the sun.",
	},
	typewriter: {
		dark: ["#1a1917", "#232220", "#2b2a27", "#3b3934", "#d9d2c2"],
		light: ["#e9e6df", "#f4f2ed", "#fbfaf7", "#cbc6b9", "#5f594c"],
		note: "Ribbon ink on cheap paper.",
	},
	oxide: {
		dark: ["#1c1210", "#2a1a16", "#38221d", "#4e3028", "#e08a5f"],
		light: ["#f2e2d9", "#fbf1eb", "#fffaf7", "#d8b8a7", "#a8542a"],
		note: "Iron left out in the rain.",
	},
	glacier: {
		dark: ["#0e1a20", "#16272f", "#1e343f", "#284757", "#7dd3fc"],
		light: ["#dceaf0", "#eef6fa", "#f9fdff", "#aac6d3", "#0369a1"],
		note: "Blue ice, very cold light.",
	},
	monsoon: {
		dark: ["#131a1c", "#1b2528", "#233135", "#2f4247", "#94d2bd"],
		light: ["#dfe8e8", "#eef4f4", "#f9fcfc", "#b3c5c5", "#317268"],
		note: "Warm rain on grey stone.",
	},
	savanna: {
		dark: ["#1e1a11", "#2a2417", "#362e1e", "#4a4029", "#e3b23c"],
		light: ["#efe6cf", "#f9f3e2", "#fefcf4", "#cfc09a", "#96701a"],
		note: "Dry grass, long light.",
	},
	canyon: {
		dark: ["#1d120e", "#2b1a14", "#39231a", "#503226", "#e2794a"],
		light: ["#f3e0d5", "#fcefe7", "#fffaf6", "#d9b49f", "#a84b1c"],
		note: "Layered rock, late sun.",
	},
	reef: {
		dark: ["#08181e", "#0e2830", "#133844", "#1b4f5f", "#f9a8d4"],
		light: ["#dceef1", "#eff8fa", "#fafeff", "#a8c9cf", "#be5a8e"],
		note: "Teal water, pink coral.",
	},
	meadow: {
		dark: ["#141c10", "#1d2718", "#26331f", "#33452a", "#a3e635"],
		light: ["#e2ebd6", "#f1f7e9", "#fbfdf7", "#bccdae", "#4d7c0f"],
		note: "Grass in full sun.",
	},
	thunder: {
		dark: ["#111318", "#191d24", "#212630", "#2d3542", "#fcd34d"],
		light: ["#e0e3e9", "#eff1f5", "#fafbfd", "#b7bcc7", "#a16207"],
		note: "Slate sky, lightning yellow.",
	},
	aurora: {
		dark: ["#0a1418", "#102028", "#162d38", "#1e404f", "#a7f3d0"],
		light: ["#dfeeea", "#f0f8f5", "#fbfefd", "#adc9c2", "#0f766e"],
		note: "Night sky with green in it.",
	},
	espresso: {
		dark: ["#171110", "#221917", "#2d211d", "#3d2d27", "#c89f7a"],
		light: ["#eae0d7", "#f6efe9", "#fdfaf7", "#c9b8a8", "#7a5236"],
		note: "Very dark, very warm.",
	},
	matcha: {
		dark: ["#161c14", "#1f271c", "#283225", "#354430", "#9ccc65"],
		light: ["#e4ebd9", "#f2f7ea", "#fbfdf6", "#bfcbaf", "#5a7c2a"],
		note: "Powdered green, milky light.",
	},
	honey: {
		dark: ["#1c1508", "#2a200c", "#382b11", "#4e3d18", "#f0c14b"],
		light: ["#f2e7cc", "#fbf5e4", "#fffdf6", "#d5c69f", "#9a6f10"],
		note: "Thick, golden, slow.",
	},
	mulberry: {
		dark: ["#170d14", "#241420", "#301b2b", "#432740", "#e58bbd"],
		light: ["#f0dfe9", "#faeef4", "#fff9fc", "#d5b3c6", "#a63d76"],
		note: "Dark fruit, stained fingers.",
	},
	outrun: {
		dark: ["#12082a", "#1c0e40", "#261356", "#371d7a", "#ff6ec7"],
		light: ["#e9dcf8", "#f5ecfd", "#fdf9ff", "#c4b0e0", "#b02a86"],
		note: "Sunset over a grid. Chrome and pink.",
	},
	arcade: {
		dark: ["#0d0f1c", "#141829", "#1c2238", "#28304f", "#fde047"],
		light: ["#e1e3ef", "#f0f2f9", "#fafbfe", "#b6bacf", "#a16207"],
		note: "Dark cabinet, bright buttons.",
	},
	blueprint: {
		dark: ["#0a1424", "#102038", "#162c4c", "#1f3e6b", "#dbeafe"],
		light: ["#dbe6f5", "#edf3fb", "#f9fbfe", "#a9bdd8", "#1e40af"],
		note: "Drafting paper, reversed.",
	},
	peacock: {
		dark: ["#07201f", "#0c2f2d", "#113e3b", "#175553", "#e8b93f"],
		light: ["#dbeae7", "#eaf5f3", "#f6fcfb", "#a5c6c1", "#8a6a10"],
		note: "Deep teal with a gold thread through it. The richest of them.",
	},
	parchment: {
		dark: ["#191512", "#221d18", "#2b241d", "#3b3128", "#e8dcc0"],
		light: ["#e8dfc8", "#f2ecdb", "#faf6ec", "#c6b894", "#5f4a2a"],
		note: "Aged paper and brown ink. Made for reading.",
	},
};

const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const hex = (t) =>
	`#${t
		.map((c) =>
			Math.max(0, Math.min(255, Math.round(c)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
const mix = (a, b, t) => hex(rgb(a).map((x, i) => x + (rgb(b)[i] - x) * t));
const lum = (h) => rgb(h).reduce((a, b) => a + b, 0);

/**
 * The reading ink, per palette.
 *
 * 🔴 It used to be one neutral for every theme: `237 237 237` in dark and
 * `24 24 27` in light. So Peacock put plain white text on a teal ground and
 * Parchment put plain black on cream, and the whole console read as a coloured
 * background behind somebody else's typography. Ink now carries a trace of its
 * palette's accent.
 *
 * 🔴 It borrows the accent's HUE ONLY. The first version mixed 12% toward the
 * accent and stopped there, which quietly wrecked light mode: accents are mid
 * tone, so mixing a near black ink toward one LIGHTENS it. Light ink went from
 * a luminance sum of 75 to between 92 and 110 across the fifty palettes, and
 * every light theme lost its bite. Taking hue and saturation from the mix while
 * forcing the base's own lightness back means the tint arrives and the contrast
 * is bit for bit what it always was.
 *
 * ⚠️ Ink is the most contrast-critical colour in the product. Anything done to
 * it has to be provably lightness-neutral, not approximately so.
 */
const toHsl = ([r, g, b]) => {
	const [R, G, B] = [r / 255, g / 255, b / 255];
	const max = Math.max(R, G, B);
	const min = Math.min(R, G, B);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h =
		max === R
			? ((G - B) / d + (G < B ? 6 : 0)) / 6
			: max === G
				? ((B - R) / d + 2) / 6
				: ((R - G) / d + 4) / 6;
	return [h, s, l];
};

const fromHsl = ([h, s, l]) => {
	if (s === 0) return [l, l, l].map((c) => c * 255);
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const channel = (t) => {
		let x = t;
		if (x < 0) x += 1;
		if (x > 1) x -= 1;
		if (x < 1 / 6) return p + (q - p) * 6 * x;
		if (x < 1 / 2) return q;
		if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
		return p;
	};
	return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map(
		(c) => c * 255,
	);
};

const ink = (accent, dark) => {
	const base = dark ? "#f2f2f2" : "#191919";
	const [h, s] = toHsl(rgb(mix(base, accent, 0.5)));
	const [, , l] = toHsl(rgb(base));
	// Saturation held well back: hue is what makes ink belong to its palette,
	// chroma is what makes body text tiring to read.
	return fromHsl([h, Math.min(s, 0.16), l])
		.map((c) => Math.round(c))
		.join(" ");
};

const ramp = ([ground, surface, raised, line, accent], dark) => ({
	"--console-floor": dark
		? mix(ground, "#000000", 0.35)
		: mix(ground, line, 0.3),
	"--console-panel": ground,
	"--console-bg": ground,
	"--console-card": surface,
	"--console-pop": raised,
	"--pop-rail": mix(ground, surface, 0.7),
	"--console-line": mix(surface, line, 0.75),
	"--console-line-soft": mix(surface, line, 0.3),
	"--console-line-strong": mix(surface, line, 0.75),
	"--empty-line": mix(line, accent, 0.35),
	"--console-ink": ink(accent, dark),
	"--surface-panel": surface,
	"--surface-card": raised,
	"--surface-tray": mix(surface, raised, 0.5),
	"--surface-tile": mix(ground, surface, 0.7),
	"--surface-recess": dark
		? mix(ground, "#000000", 0.16)
		: mix(ground, line, 0.12),
	"--face-field": mix(ground, surface, 0.55),
	"--glow-deep": mix(accent, ground, dark ? 0.62 : 0.24),
	"--glow-body": mix(accent, ground, dark ? 0.38 : 0.1),
	"--glow-crest": mix(accent, "#ffffff", dark ? 0.26 : 0.42),
	/**
	 * What a chart is drawn in.
	 *
	 * 🔑 The ACCENT, not the ink. A chart is the one place in the console that is
	 * pure data, and drawing it in reading ink made every dashboard a grey line
	 * on a coloured card. It is also the only element that may use the accent at
	 * full strength: everything else borrows a trace of it.
	 */
	"--chart-ink": dark ? mix(accent, ground, 0.12) : mix(accent, "#000000", 0.1),
	/**
	 * The mark that says this workspace is NOT real.
	 *
	 * 🔑 Derived from the palette, not fixed. It was one amber for all fifty
	 * themes, which read as a warning badge stuck onto whatever you had chosen
	 * and looked identical on a theme built out of amber. Sandbox is not a
	 * warning and not an error: nothing is wrong, the workspace simply is not
	 * live. It has one job, which is to be impossible not to notice.
	 *
	 * 🔴 The accent's OPPOSITE hue, at full commitment. Opposing the theme is
	 * what makes it leap off a surface built entirely from the accent; taking the
	 * theme's own saturation and lightness is what stops it looking like a
	 * sticker from another product. On a blue console it is warm, on a green one
	 * it is magenta, and on every one of them it is the one thing on screen that
	 * is not a shade of the theme.
	 *
	 * ⚠️ Lightness is pinned into the readable band rather than inherited. Some
	 * accents are nearly black and some nearly white, and the opposite of an
	 * invisible colour is still invisible.
	 */
	"--signal-sandbox": opposite(accent, dark),
});

/**
 * The far side of the colour wheel from an accent, kept vivid enough to see.
 *
 * ⚠️ Saturation has a FLOOR. A near-grey accent has no meaningful opposite, and
 * rotating its hue produces another near-grey: exactly the case where the mark
 * matters most, because a neutral console gives the eye nothing else to catch
 * on.
 */
function opposite(accent, dark) {
	const [h, s, l] = toHsl(rgb(accent));
	return hex(
		fromHsl([
			(h + 0.5) % 1,
			Math.min(1, Math.max(0.62, s)),
			dark
				? Math.min(0.72, Math.max(0.58, l))
				: Math.min(0.52, Math.max(0.38, l)),
		]),
	);
}

const LADDER = [
	"--console-floor",
	"--console-bg",
	"--surface-tile",
	"--console-card",
	"--console-pop",
];

let out = "";
const broken = [];
for (const [name, { dark, light, note }] of Object.entries(PALETTES)) {
	for (const [mode, anchors, selector] of [
		["dark", dark, `:root.${name}`],
		["light", light, `:root.light.${name}`],
	]) {
		const r = ramp(anchors, mode === "dark");
		const steps = LADDER.map((k) => lum(r[k]));
		if (steps.some((v, i) => i && v < steps[i - 1]))
			broken.push(`${name} ${mode}`);
		// A light popover within a hair of white is the bug where every palette's
		// buttons came out stark white regardless of the theme around them.
		if (mode === "light" && lum(r["--console-pop"]) > 760)
			broken.push(`${name} light is white`);
		if (mode === "dark")
			out += `\n/* ${name[0].toUpperCase()}${name.slice(1)}: ${note} */\n`;
		out += `${selector} {\n`;
		for (const [k, v] of Object.entries(r)) out += `\t${k}: ${v};\n`;
		out += "}\n";
	}
}

if (broken.length) {
	console.error("Refusing to write. Ramps out of order:", broken.join(", "));
	process.exit(1);
}

const { readFileSync, writeFileSync } = await import("node:fs");
const path = new URL("../src/theme.css", import.meta.url);
const css = readFileSync(path, "utf8");
const start = css.indexOf("/* ── Palettes ─");
const marker = css.indexOf("*/", start) + 3;
writeFileSync(path, `${css.slice(0, marker)}\n${out}`);
console.log(
	`${Object.keys(PALETTES).length} palettes written, ${Object.keys(PALETTES).length * 2} ramps, all ordered.`,
);
