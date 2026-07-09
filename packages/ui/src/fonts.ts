import localFont from "next/font/local";

// Self-hosted brand faces, defined once for every app. General Sans = body,
// Clash Grotesk = display. Apps apply `.variable` on <html> and reference them
// via the CSS vars in brand.css.
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
