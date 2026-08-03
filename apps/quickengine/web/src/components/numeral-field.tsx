import { useEffect, useRef } from "react";

/**
 * A status code rendered as a field of particles that your cursor pushes
 * around.
 *
 * The glyphs are drawn once to an offscreen canvas, then sampled on a grid:
 * every pixel with ink becomes a dot that remembers where it belongs. Each
 * frame the dots are pulled home by a spring and shoved away by the pointer, so
 * the number deforms as you sweep through it and reassembles behind you.
 *
 * Why sampling rather than SVG paths or per-character elements: it works for
 * any string in any font with no geometry to author, which matters because this
 * is the shared treatment for every error surface — 404, 403, 429, 500. Change
 * the text, get the same behaviour.
 */

/** Distance between sampled points, in canvas px. Lower = denser and slower. */
const SAMPLE_STEP = 5;
/** Radius of the cursor's influence, in CSS px. */
const FIELD_RADIUS = 200;
/** How hard the cursor acts on a particle at the very centre of the field. */
const FIELD_STRENGTH = 30;
/**
 * Sideways force, as a fraction of the pull.
 *
 * Without it a magnet collapses every particle onto one point and the number
 * just disappears into a dot. A tangential component makes them swing past and
 * orbit instead, so the glyphs smear round the cursor the way an image bends
 * around a magnet on a CRT.
 */
const SWIRL = 0.7;
/**
 * Particles nearer than this are treated as being exactly this far away.
 *
 * An inverse-distance force goes to infinity at zero, which flings anything
 * that gets close off the canvas and never brings it back.
 */
const MIN_DISTANCE = 22;
/** Pull back toward home. Higher snaps harder. */
const SPRING = 0.045;
/** Velocity retained per frame. Lower settles sooner. */
const FRICTION = 0.86;

type Particle = {
	homeX: number;
	homeY: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
};

export function NumeralField({
	text,
	className,
	mode = "magnet",
}: {
	text: string;
	className?: string;
	/** `magnet` drags the glyphs into the cursor and swirls them; `scatter`
	    shoves them away. Same field, opposite sign. */
	mode?: "magnet" | "scatter";
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	// Pointer lives in a ref, not state: it changes every mousemove and must not
	// re-render React 60 times a second.
	const pointer = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!canvas || !wrap) return;

		const context = canvas.getContext("2d");
		if (!context) return;

		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		let particles: Particle[] = [];
		let frame = 0;
		let disposed = false;

		const build = () => {
			const { width, height } = wrap.getBoundingClientRect();
			if (width === 0 || height === 0) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.floor(width * dpr);
			canvas.height = Math.floor(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			// Draw the glyphs once, purely to be read back as pixels.
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.clearRect(0, 0, canvas.width, canvas.height);
			const fontSize = height * 0.86 * dpr;
			context.font = `500 ${fontSize}px "Clash Grotesk", sans-serif`;
			context.textAlign = "center";
			context.textBaseline = "middle";
			context.fillStyle = "#fff";
			context.fillText(text, canvas.width / 2, canvas.height / 2);

			const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
			const step = SAMPLE_STEP * dpr;
			const found: Particle[] = [];

			for (let y = 0; y < canvas.height; y += step) {
				for (let x = 0; x < canvas.width; x += step) {
					// Index 3 is alpha. Anything meaningfully opaque is ink.
					if (
						data[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3] > 128
					) {
						found.push({ homeX: x, homeY: y, x, y, vx: 0, vy: 0 });
					}
				}
			}

			particles = found;
			context.clearRect(0, 0, canvas.width, canvas.height);
		};

		const draw = () => {
			if (disposed) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			context.clearRect(0, 0, canvas.width, canvas.height);

			const cursor = pointer.current;
			const radius = FIELD_RADIUS * dpr;
			const radiusSquared = radius * radius;
			const minDistance = MIN_DISTANCE * dpr;
			// `scatter` pushes along the outward vector; `magnet` pulls along its
			// negation. Everything else about the field is identical.
			const sign = mode === "magnet" ? -1 : 1;

			context.fillStyle = "rgba(255,255,255,0.34)";

			for (const particle of particles) {
				if (cursor) {
					const dx = particle.x - cursor.x * dpr;
					const dy = particle.y - cursor.y * dpr;
					const distanceSquared = dx * dx + dy * dy;

					if (distanceSquared < radiusSquared) {
						const distance = Math.max(Math.sqrt(distanceSquared), minDistance);
						// Falls off toward the edge of the radius, so the field has a
						// soft boundary instead of a visible circular cliff.
						const force = (1 - distance / radius) * FIELD_STRENGTH;
						const nx = dx / distance;
						const ny = dy / distance;

						particle.vx += sign * nx * force;
						particle.vy += sign * ny * force;

						// Perpendicular to the radius — this is what turns a collapse
						// into an orbit.
						particle.vx += -ny * force * SWIRL;
						particle.vy += nx * force * SWIRL;
					}
				}

				particle.vx =
					(particle.vx + (particle.homeX - particle.x) * SPRING) * FRICTION;
				particle.vy =
					(particle.vy + (particle.homeY - particle.y) * SPRING) * FRICTION;
				particle.x += particle.vx;
				particle.y += particle.vy;

				context.fillRect(particle.x, particle.y, 2 * dpr, 2 * dpr);
			}

			frame = requestAnimationFrame(draw);
		};

		const drawStatic = () => {
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.fillStyle = "rgba(255,255,255,0.34)";
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			for (const particle of particles) {
				context.fillRect(particle.homeX, particle.homeY, 2 * dpr, 2 * dpr);
			}
		};

		// Clash Grotesk is a webfont; sampling before it loads measures the
		// fallback and the dots land in the wrong shape.
		document.fonts.ready.then(() => {
			if (disposed) return;
			build();
			if (reduced) drawStatic();
			else frame = requestAnimationFrame(draw);
		});

		const observer = new ResizeObserver(() => {
			build();
			if (reduced) drawStatic();
		});
		observer.observe(wrap);

		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, [text, mode]);

	return (
		<div
			ref={wrapRef}
			aria-hidden
			className={className}
			onPointerMove={(event) => {
				const box = wrapRef.current?.getBoundingClientRect();
				if (!box) return;
				pointer.current = {
					x: event.clientX - box.left,
					y: event.clientY - box.top,
				};
			}}
			onPointerLeave={() => {
				pointer.current = null;
			}}
		>
			<canvas ref={canvasRef} className="block" />
		</div>
	);
}
