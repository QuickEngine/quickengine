import { ArrowRightIcon, CaretRightIcon } from "@phosphor-icons/react";
import { env } from "@/lib/env";

const AUTH_URL = env.VITE_AUTH_URL;

// Marketing stays marketing. Workspace configuration, including any AI setup,
// begins only after authentication inside Account onboarding.
export function Hero() {
	return (
		// `.site-gutter` matches the header so the caption's left edge lines up with
		// the logo above it.
		//
		// The 36vh floor is what holds the product window still. It used to carry
		// that offset as its own top margin, so anything added here shoved it down
		// the page. The hero now reserves the space instead, and content can be
		// added below without the window moving at all — until it outgrows 36vh.
		<section className="site-gutter min-h-[36vh] pt-14">
			<p className="font-body text-[12px] text-ink uppercase tracking-[0.14em]">
				Introducing QuickDash
			</p>

			<h1 className="mt-3 max-w-xl font-body text-2xl text-ink leading-[1.14] tracking-[-0.02em] sm:text-4xl">
				The backend your whole business runs on.
			</h1>

			<div className="mt-8 flex flex-wrap items-center gap-2">
				{/* "Free" is a real claim, not a growth trick — `plans.ts` has a genuine
				    no-cost tier. Saying so on the button answers the cost question at the
				    moment it is asked. */}
				<a
					href={`${AUTH_URL}/signup`}
					className="btn btn-primary inline-flex h-10 items-center gap-1.5 rounded-full bg-invert px-5 font-body font-[450] text-[15px] text-on-invert"
				>
					Get started for free
					<ArrowRightIcon size="1em" />
				</a>
				{/* Serves a prospect, not an existing customer — which is why this is not
				    Sign In. Someone who will not click Get Started yet still wants to
				    know what the thing actually is, and modules are the answer.
				    Desktop only: a phone reads better with one unambiguous action. */}
				<a
					href="/products/modules"
					className="btn btn-secondary hidden h-10 items-center gap-1.5 rounded-full bg-field px-5 font-body font-[450] text-[15px] text-ink lg:inline-flex"
				>
					Explore Modules
					<CaretRightIcon size="1em" />
				</a>
			</div>
		</section>
	);
}
