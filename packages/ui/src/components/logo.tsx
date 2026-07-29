import type { SVGProps } from "react";

// QuickEngine brand mark. Colored via currentColor so it adapts to the surface —
// set the color with a text-* class (dark on light, light on dark). Size it with
// a className (e.g. size-7).
//
// GENERATED from `public/logo.svg` by `pnpm brand:sync`. Edit the SVG, not this file.
export function Logo(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 500 500"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="QuickEngine"
			{...props}
		>
			<title>QuickEngine</title>
			<g fill="currentColor">
				<path d="M308.804 0C391.594 0 458.709 67.1573 458.709 150V229.494L458.504 229.29L344.032 343.835V164.75C344.032 137.136 321.66 114.75 294.063 114.75H114.677V294.25C114.677 321.864 137.049 344.25 164.645 344.25H344.032V344.036L458.504 458.582L458.709 458.377V459H149.905C67.1147 459 2.56001e-06 391.843 0 309V229.195L114.469 114.653L0 0.110352V0H308.804Z" />
				<path d="M500 500H337.468L262.833 425.317L344.099 344L500 500Z" />
			</g>
		</svg>
	);
}
