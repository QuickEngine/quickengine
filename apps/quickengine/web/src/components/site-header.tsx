import {
	ArrowUpRightIcon,
	CaretDownIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Logo } from "@quickengine/ui";
import { env } from "@/lib/env";

/**
 * Ordered as the visitor's question sequence, not alphabetically or by
 * importance to us:
 *
 *   Product     what is it
 *   Developers  how do I build on it
 *   Business    is it for someone like me
 *   Docs        how deep does it go
 *   Company     who am I trusting
 *   Pricing     what does it cost
 *
 * Price goes last on purpose. Anyone who reads it before they know what the
 * thing does has nothing to weigh it against, so it only ever reads as
 * expensive.
 *
 * ⚠️ Still provisional — eight pages are being cut and nav decides URL
 * structure, so this settles when the sitemap does.
 */
const NAV = [
	{ label: "Product", href: "/products" },
	{ label: "Developers", href: "/developers" },
	{ label: "Business", href: "/business" },
	{ label: "Docs", href: "https://docs.quickdash.xyz" },
	{ label: "Company", href: "/company" },
	{ label: "Pricing", href: "/pricing" },
];

/**
 * Both controls share height, radius and padding so they read as one pair
 * rather than two unrelated buttons. Only the surface differs. Pills need more
 * side padding than a rectangle at the same height — the curve eats into the
 * space beside the text, so `px-3` that looked fine squared reads cramped here.
 */
const BUTTON =
	"btn inline-flex h-7 items-center rounded-full px-3 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Frosted, and edgeless on purpose. With no bottom border the bar has to end by
 * dissolving rather than stopping, so the blur is heavier and the saturation
 * boost is dropped — saturation is what makes glass look like clean glass, and
 * clean glass needs a defined edge to read against. Fogged does not.
 *
 * The tint is a theme token, so it fogs dark over black and light over white
 * with no second rule set.
 *
 * `top` tracks `--banner-h`, which the connection banner sets when it drops in.
 * It defaults to 0, so with no banner the header sits flush against the top.
 */
export function SiteHeader() {
	return (
		<header className="fixed inset-x-0 top-[var(--banner-h,0px)] z-50 h-[var(--header-h)] bg-background/60 backdrop-blur-2xl transition-[top] duration-300 ease-out">
			{/* 16px here, not 28px: each nav link carries 12px of its own left
			    padding, so 16 + 12 lands the wordmark-to-Product gap on the same 28px
			    that sits between the nav items themselves. */}
			<div className="page-gutter flex h-full items-center gap-4">
				<a
					href="/"
					aria-label="QuickEngine home"
					className="flex w-fit shrink-0 items-center gap-1.5 rounded-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Logo className="size-6" />
					<span className="font-display text-[14px] leading-none tracking-tight">
						QuickEngine
					</span>
				</a>

				<nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
					{NAV.map((item) => (
						<a
							key={item.href}
							href={item.href}
							className="rounded-md px-3 py-2 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						>
							{item.label}
						</a>
					))}
				</nav>

				<div className="ml-auto flex shrink-0 items-center gap-1.5">
					{/* ⚠️ No handler yet — there is nothing to search until the pages
					    exist. Wired to a palette once there is content behind it. */}
					<button
						type="button"
						aria-label="Search"
						className="btn btn-muted flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						<MagnifyingGlassIcon size={13} />
					</button>

					<a
						href={`${env.VITE_AUTH_URL}/signin`}
						className={`${BUTTON} btn-muted gap-1 text-muted-foreground hover:text-foreground`}
					>
						Sign in
						<CaretDownIcon size={11} weight="bold" />
					</a>

					{/* The arrow points off-site: this leaves quickengine.xyz for the
					    product host, which is worth signalling before the click. */}
					<a
						href={env.VITE_DASH_URL}
						className={`${BUTTON} btn-solid gap-1 font-medium`}
					>
						Try QuickDash
						<ArrowUpRightIcon size={12} weight="bold" />
					</a>
				</div>
			</div>
		</header>
	);
}
