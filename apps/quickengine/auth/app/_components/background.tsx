// Site-wide mesh + grain background (styles in globals.css). Fixed behind all
// content, non-interactive. Matches the marketing site so auth feels continuous.
export function Background() {
	return <div aria-hidden className="site-background" />;
}
