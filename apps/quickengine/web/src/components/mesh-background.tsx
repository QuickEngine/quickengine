/**
 * The page field: a static blue mesh over the surface colour, with grain on top.
 *
 * Deliberately quiet. Opaque page content covers this almost entirely — it is
 * seen at the overscroll edge behind the header and very little else, which is
 * exactly the intent. A brighter, white-cored version was tried against the
 * Aurion/Halo references on 2026-07-31 and rejected: those wash the whole field,
 * which fights a steel ramp that already carries colour of its own.
 *
 * ⚠️ `z-0`, NOT `-z-10`. A negative z-index with no ancestor stacking context
 * paints behind `body`'s background, which is opaque — the field was invisible
 * until this was corrected.
 *
 * Blobs draw from the ramp's own steps, so this is not a separate palette
 * painted behind the page. Change `--h` in `styles.css` and the whole page,
 * field included, moves hue together.
 */
export function MeshBackground() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-void"
		>
			{/* Sized in vmax so the composition holds its proportions from a phone to
			    an ultrawide, instead of the blobs becoming dots on a large display. */}
			<div
				className="mesh-blob"
				style={{
					top: "-18%",
					left: "-10%",
					width: "70vmax",
					height: "70vmax",
					background:
						"radial-gradient(circle, oklch(0.62 0.13 var(--h) / 0.22) 0%, transparent 68%)",
				}}
			/>
			<div
				className="mesh-blob"
				style={{
					top: "5%",
					right: "-20%",
					width: "62vmax",
					height: "62vmax",
					background:
						"radial-gradient(circle, oklch(0.5 0.1 var(--h) / 0.24) 0%, transparent 70%)",
				}}
			/>
			<div
				className="mesh-blob"
				style={{
					bottom: "-25%",
					left: "18%",
					width: "78vmax",
					height: "78vmax",
					background:
						"radial-gradient(circle, oklch(0.38 0.06 var(--h) / 0.26) 0%, transparent 72%)",
				}}
			/>

			<div className="noise-layer absolute inset-0" />
		</div>
	);
}
