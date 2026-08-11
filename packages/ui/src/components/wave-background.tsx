import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { ShaderMaterial } from "three";
import { Vector2 } from "three";

/**
 * The front-page field: a slow wave ramp, black overhead down to grey below.
 *
 * The reference is the PlayStation dashboard — long sine crests drifting past
 * each other, read as cloud layers seen from above rather than as a scrolling
 * texture. Everything here is tuned for "noticeable but never busy": the fastest
 * term completes a cycle in roughly forty seconds, and no crest is tall enough to
 * make the ramp itself visibly move.
 *
 * Why a shader and not stacked CSS gradients: the flow comes from sampling ONE
 * gradient at a displaced height, so the bands bend and stretch as a single body
 * of colour. Layered CSS can fake drift but not that, because each layer keeps
 * its own edge.
 *
 * Colour is passed through untouched — `linear` and `flat` on the Canvas disable
 * three's sRGB re-encode and tone mapping, so `#213648` leaves the shader as the
 * same `#213648` the CSS fallback paints.
 */

// Gradient stops, top of screen downward — Asher's spec, unchanged:
// #000000, then #213648, then #808080 at the bottom edge.
//
// Sat at 22/57 until 2026-08-10 and read far too high — night has to own the
// whole upper half for the sky beneath it to feel like distance rather than a
// band of colour. Matched to the reference: black through the header and hero,
// sky arriving late, cloud only ever a suggestion at the very bottom.
const STOP_BLACK = 0.46;
const STOP_SLATE = 0.74;

// How far either side of the slate stop the two ramps are rounded together.
// Night to sky to cloud wants no seam between sky and cloud; this is the only
// number that controls it. Larger blends further, and the colour AT the slate
// stop stays exactly #213648 regardless, because both ramps equal slate there.
//
// At 0.30 the window is wider than either ramp, so sky and cloud are blending
// into each other across the whole lower half rather than meeting anywhere. That
// is the intent — no join to find.
const BLEND = 0.3;

const VERTEX = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		// The plane is built at exactly 2x2, so its own coordinates already ARE
		// clip space. Skipping the camera matrices makes this a fullscreen quad
		// that cannot drift when the viewport or camera changes.
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}
`;

const FRAGMENT = /* glsl */ `
	precision highp float;

	uniform float uTime;
	uniform vec2 uResolution;
	uniform float uGrain;
	varying vec2 vUv;

	const vec3 BLACK = vec3(0.0, 0.0, 0.0);
	const vec3 SLATE = vec3(0.12941, 0.21176, 0.28235); // #213648
	const vec3 GREY  = vec3(0.50196, 0.50196, 0.50196); // #808080

	// Straight ramp between two stops, no easing.
	float linstep(float a, float b, float t) {
		return clamp((t - a) / (b - a), 0.0, 1.0);
	}

	// White noise, 0..1, with no sin() anywhere in it.
	//
	// 🔴 The textbook fract(sin(dot(p, k)) * 43758.5453) was here first and it
	// produced NOTHING — measured, not guessed: with the animation offset folded
	// into p, sin was being handed arguments in the hundreds of thousands, and GPU
	// range reduction stops being meaningful long before that. The output went
	// constant, a constant shifts every pixel by the same amount, and a uniform
	// shift is not noise. Cranking the amplitude to 0.6 changed the picture by
	// literally zero — which is what proved it was the hash and not the level.
	//
	// This is the Hoskins integer-free hash instead. Every intermediate is kept
	// inside 0..1 by fract, so it behaves identically at t=0 and t=10 minutes and
	// cannot degrade with a big input the way the sin version silently did.
	float hash(vec3 p3) {
		p3 = fract(p3 * 0.1031);
		p3 += dot(p3, p3.zyx + 31.32);
		return fract((p3.x + p3.y) * p3.z);
	}

	// The still gradient. Everything else in this shader only decides WHERE to
	// sample it, so the palette stays exactly what was signed off on.
	vec3 ramp(float y) {
		float black = ${STOP_BLACK.toFixed(3)};
		float slate = ${STOP_SLATE.toFixed(3)};
		float blend = ${BLEND.toFixed(3)};

		// Both ramps run UNCLAMPED past the slate stop, so each keeps its own
		// slope through the junction instead of flattening onto it.
		vec3 night = mix(BLACK, SLATE, max((y - black) / (slate - black), 0.0));
		vec3 cloud = mix(SLATE, GREY, (y - slate) / (1.0 - slate));

		// ⚠️ The fix for the visible line between sky and cloud is HERE, not in the
		// stop positions. Two straight ramps meeting at a point change slope
		// abruptly; the colour stays continuous but its rate does not, and the eye
		// reads that crease as an edge — a Mach band. Crossfading the two ramps
		// across a window centred on the stop rounds the slope away. The colour at
		// the stop is untouched: both ramps equal slate there, so it is #213648 for
		// any blend width.
		float k = smoothstep(slate - blend, slate + blend, y);
		return clamp(mix(night, cloud, k), 0.0, 1.0);
	}

	// Four sines at unrelated frequencies and speeds, two of them travelling
	// backwards. Unrelated periods matter: harmonics would resync visibly every
	// few seconds and the whole field would look like it was breathing.
	//
	// ⚠️ These frequencies are in radians across the FULL width. 1.3–6.1 was a
	// fifth of a cycle edge to edge, so no horizontal variation survived and the
	// field read as a flat gradient pulsing vertically. 9–38 overshot the other
	// way: the upper harmonics summed into cusps, which read as sharp peaks
	// rather than swell. Three terms, well spaced, none of them fine.
	//
	// Amplitudes are half what they were: the speeds were right, the travel was
	// not. Drift, not surf.
	float crests(float x, float t) {
		float w = 0.0;
		w += sin(x * 4.20 + t * 0.150) * 0.0230;
		w += sin(x * 6.90 - t * 0.105 + 1.30) * 0.0110;
		w += sin(x * 11.30 + t * 0.078 + 2.60) * 0.0045;
		return w;
	}

	void main() {
		// y is 0 at the top of the screen so the stops read the way they are
		// written; WebGL's own uv origin is bottom-left.
		float y = 1.0 - vUv.y;
		float aspect = uResolution.x / max(uResolution.y, 1.0);
		float x = vUv.x * aspect;

		// A slow vertical warp fed back into the horizontal phase. This is what
		// separates "flowing" from "sliding" — crests stretch and compress as they
		// pass instead of holding a fixed shape. Small numbers: this is multiplied
		// by the crest frequencies above, so 0.16 already bends a crest by most of
		// a radian between the top and bottom of the screen.
		float warp = sin(y * 2.30 - uTime * 0.085) * 0.065
		           + sin(y * 1.15 + uTime * 0.045) * 0.038;

		float displaced = y + crests(x + warp, uTime);

		vec3 col = ramp(displaced);

		// A faint sheen riding the crests. Gated to start below the black stop, so
		// night stays genuinely black rather than lifting to a washed near-black —
		// the single thing that most makes a dark gradient look cheap. Barely
		// visible on its own; without it the sky reads flat rather than lit.
		float sheen = sin(x * 4.00 - uTime * 0.062 + displaced * 3.40) * 0.5 + 0.5;
		col += vec3(0.022) * sheen * smoothstep(${STOP_BLACK.toFixed(3)}, 1.0, displaced);

		// Grain — and it doubles as the dither. A black-to-slate ramp this long
		// bands badly on 8-bit displays, and noise is the fix for both problems.
		//
		// ⚠️ Two quantisations, and without either it does not read as grain:
		//
		// 1. COORDINATES are floored to 3px blocks. Per-pixel noise is invisible on
		//    a retina display — the device pixel ratio averages it away before the
		//    eye gets it, which is exactly why a DOM overlay showed nothing.
		// 2. TIME is stepped to 12 per second and WRAPPED at 16 frames. Real grain
		//    resamples per frame of film; noise updating at 60fps reads as shimmer
		//    rather than as texture. Sixteen frames is past where anyone can spot
		//    the repeat, and wrapping means the animation input stays bounded no
		//    matter how long the tab has been open.
		//
		// Over the black half the negative side of the noise has nowhere to go and
		// clamps, so what survives there is the bright half — speckle on black,
		// which is exactly what film grain does over shadow.
		//
		// uGrain is the amplitude. At 0 this collapses to a sub-1/255 dither, which
		// is what the auth screens want: banding removed, texture absent.
		//
		// ⏸ PARKED 2026-08-10. It is measurably reaching the shader — uGrain was
		// confirmed at 0.6 with a live uniform read — and the visible spread over
		// black was still one 255th, so the noise is near-constant on this
		// GPU for reasons the sin-hash rewrite did not fix. Left at dither
		// strength rather than chased further; the background is meant to be cheap
		// and this is a texture nobody has yet seen.
		vec2 cell = floor(gl_FragCoord.xy / 3.0);
		float frame = mod(floor(uTime * 12.0), 16.0);
		float n = hash(vec3(cell, frame));
		col += (n - 0.5) * max(uGrain, 0.004);

		gl_FragColor = vec4(col, 1.0);
	}
`;

function Waves({ still, grain }: { still: boolean; grain: number }) {
	const material = useRef<ShaderMaterial>(null);
	const size = useThree((state) => state.size);

	// Created once. Rebuilding uniforms on render would drop the clock back to
	// zero and make the field jump.
	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uResolution: { value: new Vector2(1, 1) },
			uGrain: { value: 0 },
		}),
		[],
	);

	useFrame(({ clock }) => {
		if (!material.current) return;
		// `still` freezes the clock rather than unmounting, so the composition is
		// identical for everyone — reduced motion loses the movement, not the page.
		uniforms.uTime.value = still ? 0 : clock.getElapsedTime();
		uniforms.uResolution.value.set(size.width, size.height);
		uniforms.uGrain.value = grain;
	});

	return (
		// `frustumCulled` off because the vertex shader ignores the camera
		// matrices: three would cull against where it thinks the plane is, not
		// where it actually draws, and the whole field could vanish on resize.
		<mesh frustumCulled={false}>
			<planeGeometry args={[2, 2]} />
			<shaderMaterial
				ref={material}
				uniforms={uniforms}
				vertexShader={VERTEX}
				fragmentShader={FRAGMENT}
			/>
		</mesh>
	);
}

/**
 * ⚠️ `fixed` fills the VIEWPORT and ignores whatever contains it — which is
 * right for a full-page hero and wrong everywhere else. The auth shell puts this
 * in one half of a split, and fixed positioning made it cover the entire screen
 * including the half that was supposed to be black.
 *
 * `absolute` confines it to the nearest positioned ancestor instead. Pass it
 * whenever this is a panel rather than the page.
 */
export function WaveBackground({
	position = "fixed",
	grain = false,
}: {
	position?: "fixed" | "absolute";
	/**
	 * Animated film grain, rendered IN the shader rather than as a layer over it.
	 *
	 * A DOM overlay was tried first and read as nothing: at device pixel ratio 2 a
	 * fine SVG noise tile is averaged away before it reaches the eye, and pushing
	 * the opacity up far enough to see turned it into visible dirt rather than
	 * texture. In the shader the grain is part of the same colour the gradient
	 * produces, so it survives.
	 *
	 * Off by default — it belongs on the marketing hero, where the gradient is
	 * the subject, and not behind a form where moving texture under text is only
	 * ever a distraction.
	 */
	grain?: boolean;
} = {}) {
	const still =
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	return (
		<div
			aria-hidden="true"
			// ⚠️ `z-0`, not `-z-10`. A negative z-index with no ancestor stacking
			// context paints behind `body`'s opaque background and vanishes — the
			// same trap documented on MeshBackground.
			className={`pointer-events-none ${position} inset-0 z-0`}
			// The CSS twin of the shader's own ramp. It holds the frame while the
			// WebGL context starts, and stays as the whole background on hardware
			// that has no context to give.
			// Extra stops sample the shader's own rounded curve rather than
			// restating the three-stop version, so the fallback does not show the
			// seam the shader was corrected to avoid.
			style={{
				background:
					"linear-gradient(to bottom, #000000 46%, #061018 55%, #0f2130 65%, #213648 74%, #46545f 87%, #808080 100%)",
			}}
		>
			<Canvas
				linear
				flat
				dpr={[1, 2]}
				gl={{ antialias: true, alpha: true }}
				style={{ width: "100%", height: "100%" }}
			>
				<Waves still={still} grain={grain ? 0.055 : 0} />
			</Canvas>
		</div>
	);
}
