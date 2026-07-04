export function QuickMeshBackground() {
	return (
		<div className="quick-bg">
			<div className="quick-bg__light" aria-hidden="true">
				<div className="quick-bg__glow quick-bg__glow--top" />
				<div className="quick-bg__glow quick-bg__glow--left" />
				<div className="quick-bg__glow quick-bg__glow--right" />
				<div className="quick-bg__glow quick-bg__glow--bottom" />
				<div className="quick-bg__beam quick-bg__beam--one" />
				<div className="quick-bg__beam quick-bg__beam--two" />
				<div className="quick-bg__beam quick-bg__beam--three" />
			</div>

			<div className="quick-bg__wash" aria-hidden="true" />
			<div className="quick-bg__vignette" aria-hidden="true" />

			<svg
				className="quick-bg__noise"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
			>
				<filter id="quick-engine-noise">
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.72"
						numOctaves="4"
						stitchTiles="stitch"
					/>
				</filter>
				<rect width="100%" height="100%" filter="url(#quick-engine-noise)" />
			</svg>
		</div>
	);
}
