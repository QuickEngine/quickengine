import { Logo, Wordmark } from "@quickengine/ui";
import { createFileRoute } from "@tanstack/react-router";
import { GREY, ICE } from "@/components/pill";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * Brand.
 *
 * ⚠️ This page is the palette, so it must READ from the same constants the site
 * does rather than restating them. The previous version listed four theme tokens
 * (`bg-background`, `bg-foreground`, `bg-muted`, `bg-border`) that had nothing to
 * do with the brand — a brand page showing colours the brand does not use is
 * worse than no brand page, because someone will use them.
 *
 * 🔴 NO FONT DOWNLOADS. Söhne is licensed from Klim and the files in this
 * repository are TRIAL cuts. Naming the typeface is fine and factual; offering
 * the files is redistribution, and it is exactly the kind of thing that gets
 * noticed on a public brand page. Do not add a download link for type under any
 * circumstances. The logo files are ours and may be offered freely.
 */

const PALETTE = [
	{
		name: "Ice",
		value: ICE,
		note: "Primary action. Black text sits on it.",
	},
	{
		name: "Slate",
		value: GREY,
		note: "Secondary action. Ice text sits on it.",
	},
	{
		name: "Black",
		value: "#000000",
		note: "The page. Everything is drawn on this.",
	},
];

/**
 * The gradient, exactly as the shader defines it. Percentages are the real stop
 * positions from `wave-background.tsx` — if those move, move these.
 */
const GRADIENT = [
	{ value: "#000000", stop: "0%" },
	{ value: "#213648", stop: "74%" },
	{ value: "#808080", stop: "100%" },
];

function Swatch({
	name,
	value,
	note,
}: {
	name: string;
	value: string;
	note: string;
}) {
	return (
		<div>
			<div
				style={{ backgroundColor: value }}
				className="h-24 w-full rounded-xl border border-white/[0.09]"
			/>
			<p className="mt-3 font-body font-normal text-[0.9375rem] text-white">
				{name}
			</p>
			<p
				style={{ fontVariantNumeric: "tabular-nums" }}
				className="mt-1 font-body font-light text-[0.8125rem] text-white/40 uppercase"
			>
				{value}
			</p>
			<p className="mt-2 font-body font-light text-[0.8125rem] text-white/50 leading-[1.5]">
				{note}
			</p>
		</div>
	);
}

function BrandPage() {
	return (
		<TextPage
			title="Using the QuickEngine brand."
			lede="The mark, the palette and the type, with the few rules that matter. Take what you need."
		>
			<TextSection title="The mark">
				<div className="flex flex-col gap-4">
					{/* Shown on both grounds, because that is the only rule about it that
					    people actually get wrong. */}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex h-40 items-center justify-center rounded-xl border border-white/[0.09] bg-black">
							<Logo className="h-12 w-auto text-ink" />
						</div>
						<div
							style={{ backgroundColor: ICE }}
							className="flex h-40 items-center justify-center rounded-xl"
						>
							<Logo className="h-12 w-auto text-black" />
						</div>
					</div>

					<div className="flex h-28 items-center justify-center rounded-xl border border-white/[0.09] bg-black">
						<Wordmark className="h-6 w-auto text-ink" />
					</div>

					<p className="font-body font-light text-[0.9375rem] text-white/50 leading-[1.6]">
						The mark is a single colour and inherits whatever text colour it
						sits in. Use it light on dark, dark on light, and nothing else.
					</p>
				</div>
			</TextSection>

			<TextSection title="Palette">
				<div className="grid gap-6 sm:grid-cols-3">
					{PALETTE.map((colour) => (
						<Swatch key={colour.name} {...colour} />
					))}
				</div>
			</TextSection>

			<TextSection title="The gradient">
				<div className="flex flex-col gap-4">
					<div
						className="h-40 w-full rounded-xl border border-white/[0.09]"
						style={{
							background: `linear-gradient(to bottom, ${GRADIENT.map((s) => `${s.value} ${s.stop}`).join(", ")})`,
						}}
					/>
					<div className="flex flex-wrap gap-x-8 gap-y-2">
						{GRADIENT.map((stop) => (
							<p
								key={stop.value}
								style={{ fontVariantNumeric: "tabular-nums" }}
								className="font-body font-light text-[0.8125rem] text-white/40 uppercase"
							>
								{stop.value} · {stop.stop}
							</p>
						))}
					</div>
					<p className="font-body font-light text-[0.9375rem] text-white/50 leading-[1.6]">
						Black through the top half, sky arriving late, cloud only ever a
						suggestion at the bottom edge. On the site it is rendered live and
						moves; as a still, this is it.
					</p>
				</div>
			</TextSection>

			<TextSection title="Type">
				<div className={textProse}>
					<p>
						Everything is set in <strong>Söhne</strong>, from Klim Type Foundry.
						Headings are light weight; body text is light or regular. We do not
						use a second typeface anywhere.
					</p>
					<p>
						Söhne is commercially licensed and we cannot redistribute it, so
						there is nothing to download here. If you need to set QuickEngine
						material in it, licence it from Klim directly. For anything
						informal, any clean grotesque is closer than a serif.
					</p>
				</div>
			</TextSection>

			<TextSection title="What not to do">
				<div className={textProse}>
					<ul>
						<li>Do not recolour the mark, or fill it with a gradient.</li>
						<li>Do not stretch, rotate, outline or add effects to it.</li>
						<li>
							Do not place it on a busy image, or on a colour close to its own.
						</li>
						<li>
							Do not rebuild the wordmark by typing "QuickEngine" in Söhne. It
							is drawn, not set.
						</li>
						<li>
							Do not imply a partnership, endorsement or integration that does
							not exist.
						</li>
					</ul>
				</div>
			</TextSection>

			<TextSection title="Files">
				<div className={textProse}>
					<p>
						<a href="/logo.svg" download>
							Download the mark (SVG)
						</a>
					</p>
					<p>
						Vector, single colour, scales to anything. If you need a format that
						is not here, or you are unsure whether a use is fine, ask{" "}
						<a href="/contact">contact us</a> and we will just tell you.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/brand")({
	component: BrandPage,
});
