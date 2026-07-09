// Site-wide mesh + grain background (styles in globals.css). Fixed behind all
// content, non-interactive. Matches web + auth so the whole product feels
// continuous.
export function Background() {
	return <div aria-hidden className="site-background" />;
}
