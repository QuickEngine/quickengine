import localFont from "next/font/local";

// Self-hosted brand faces (variable woff2) — matches web + auth. General Sans =
// body, Clash Grotesk = display.
export const generalSans = localFont({
	src: "./fonts/GeneralSans-Variable.woff2",
	variable: "--font-general",
	weight: "200 700",
	display: "swap",
});

export const clashGrotesk = localFont({
	src: "./fonts/ClashGrotesk-Variable.woff2",
	variable: "--font-clash",
	weight: "200 700",
	display: "swap",
});
