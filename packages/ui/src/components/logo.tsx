import type { SVGProps } from "react";

// QuickEngine brand mark. Colored via currentColor so it adapts to the surface —
// set the color with a text-* class (dark on light, light on dark). Size it with
// a className (e.g. size-7).
//
// GENERATED from `public/logo.svg` by `pnpm brand:sync`. Edit the SVG, not this file.
export function Logo(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 250 250"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="QuickEngine"
			{...props}
		>
			<title>QuickEngine</title>
			<g fill="currentColor">
				<path d="M221.479 110.817L221.381 110.719L166.11 166.028V55.4078H55.3698V166.223H166.11V166.127L221.381 221.437L221.479 221.338V221.631H0V110.669L55.2725 55.3589L0 0.0484818V0H221.479V110.817Z" />
				<path d="M250 250H171.695L127.128 205.403L166.281 166.223L250 250Z" />
			</g>
		</svg>
	);
}
