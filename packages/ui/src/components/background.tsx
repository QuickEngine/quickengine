// Site-wide mesh + grain background (styles in brand.css). Fixed behind all
// content, non-interactive. Shared across every app so the product feels
// continuous.
export function Background() {
	return <div aria-hidden className="site-background" />;
}
