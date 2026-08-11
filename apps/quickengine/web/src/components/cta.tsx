import { ArrowRightIcon } from "@phosphor-icons/react";
import { ICE } from "@/components/pill";
import { env } from "@/lib/env";
import { CLOSE } from "@/lib/surfaces";

/**
 * The closing CTA — the last thing on the page before the footer.
 *
 * Its surface is `CLOSE`, NOT the `STAGE` used by Meet QuickDash. It shared that
 * stage until 2026-08-10 and the ending read as a repeat of the middle of the
 * page. The light in `CLOSE` rises from below the centre, so it comes from
 * behind the input rather than from a corner — lit by the thing it is asking you
 * to touch.
 *
 * Why a prompt rather than a button: every other CTA on this page is "Get
 * Started", which asks the visitor to commit before they have done anything.
 * A sentence about their own business costs them nothing, and it is the exact
 * input the product needs to configure a workspace — so the first thing they
 * give us is the first thing we can act on.
 *
 * ⚠️ Submitting currently sends people to signup and DROPS the prompt. That is a
 * deliberate placeholder until the modal exists: it is honest (nothing pretends
 * to have understood them) but it wastes the one piece of information they
 * volunteered. The modal must carry the text through.
 */
const AUTH_URL = env.VITE_AUTH_URL;

export function Cta() {
	return (
		<section className="pt-20 pb-12 site-gutter">
			{/* Same radius and generous padding as the Meet QuickDash stage. The
			    margin of backdrop around the content is what reads as depth 
			    tightening it collapses the surface back into a coloured box. */}
			<div
				className="relative flex min-h-[22rem] items-center justify-center overflow-hidden rounded-3xl px-5 py-14 sm:min-h-[26rem] sm:px-10 sm:py-20 lg:px-16"
				style={{ background: CLOSE }}
			>
				{/* Centred here, where every other section on the page is left
				    aligned. That break is deliberate and it only works once, a
				    closing ask should feel like the page turning to face you. */}
				<div className="w-full max-w-[46rem] text-center">
					{/* An instruction, not a tagline. "Build more. Switch less." sat here
					    until 2026-08-10 and it is a brand line, it says who QuickEngine
					    is, which is the wrong job at the bottom of a page. A close has to
					    remove the objection and name the next action, and the objection
					    at this point is always "how much work is this".

					    The claim is literal: the backend is built and deployed. */}
					<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3rem)] text-white leading-[1.12] tracking-[-0.025em]">
						<span className="sm:block">The backend is already built.</span>{" "}
						<span className="sm:block">Tell it what you run.</span>
					</h2>

					{/* No subheading. The placeholder already says what to type, so a line
					    above the field explaining what to type was the same instruction
					    twice, and the tagline lands harder with nothing between it and
					    the thing it is asking for. */}

					{/* A real form, so Return submits and the button is a submit button —
					    an input that only responds to a click is the most common way a
					    field like this feels broken. */}
					{/* ⚠️ Stacked below `sm`, one pill above it. A single-row pill on a
					    phone leaves the field about 200px wide, the placeholder
					    truncates mid-word and the whole control reads as broken. Below
					    `sm` the field is its own full-width box with the button beneath
					    it, both at 48px so a thumb can hit either. */}
					<form
						action={`${AUTH_URL}/signup`}
						method="get"
						className="mx-auto mt-9 flex w-full max-w-[36rem] flex-col gap-3 rounded-2xl border border-white/15 bg-black/40 p-3 backdrop-blur-sm transition-colors duration-300 ease-out focus-within:border-white/30 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:p-2 sm:ps-5"
					>
						<label htmlFor="cta-prompt" className="sr-only">
							Describe your business
						</label>
						<input
							id="cta-prompt"
							name="prompt"
							type="text"
							autoComplete="off"
							placeholder="We run a bike repair shop and take bookings online"
							className="min-w-0 flex-1 bg-transparent px-2 py-2 text-center font-body font-light text-[15px] text-white leading-normal placeholder:text-white/35 focus:outline-none sm:px-0 sm:py-0 sm:text-start sm:leading-none"
						/>
						{/* Full width and labelled on a phone, a bare disc on desktop. An
						    unlabelled 36px circle is a fine affordance beside a field it
						    visibly belongs to, and a poor one as the only control on a
						    phone screen. */}
						<button
							type="submit"
							style={{ backgroundColor: ICE }}
							className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full font-body font-light text-[15px] text-black transition-opacity duration-300 ease-out hover:opacity-85 hover:duration-150 focus-visible:opacity-85 sm:size-9 sm:h-9 sm:w-9 sm:gap-0 sm:text-[0px]"
						>
							<span className="sm:hidden">Get started</span>
							<ArrowRightIcon size={16} color="#000000" weight="bold" />
						</button>
					</form>

					<p className="mt-5 font-body font-light text-[13px] text-white/40">
						No card. Nothing to install.
					</p>
				</div>
			</div>
		</section>
	);
}
