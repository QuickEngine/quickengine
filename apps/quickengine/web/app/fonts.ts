import localFont from "next/font/local";

// Self-hosted brand faces (variable woff2) — no external CDN fetch, so no
// flash-of-unstyled-text on refresh, and next/font preloads + prevents layout
// shift. General Sans = body, Clash Grotesk = display.
export const generalSans = localFont({
	src: "../public/GeneralSans_Complete/Fonts/WEB/fonts/GeneralSans-Variable.woff2",
	variable: "--font-general",
	weight: "200 700",
	display: "swap",
});

export const clashGrotesk = localFont({
	src: "../public/ClashGrotesk_Complete/Fonts/WEB/fonts/ClashGrotesk-Variable.woff2",
	variable: "--font-clash",
	weight: "200 700",
	display: "swap",
});
