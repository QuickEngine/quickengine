import {
	ArrowUpRightIcon,
	CaretDownIcon,
	ListIcon,
} from "@phosphor-icons/react";
import { Logo } from "@quickengine/ui";
import { env } from "@/lib/env";

const AUTH_URL = env.VITE_AUTH_URL;

// Every href resolves to a real route. `/business` is the only marketing hub left
// out of the top bar; it still works and belongs under Product when the menus are
// built. A `/shop` entry was tried and pulled — there is no shop route or app yet,
// so it would have been the one link in the header that 404s.
const NAV_LINKS = [
	{ label: "Product", href: "/products" },
	{ label: "Developers", href: "/developers" },
	{ label: "Resources", href: "/resources" },
	{ label: "Company", href: "/company" },
	{ label: "Pricing", href: "/pricing" },
];

export function Header() {
	return (
		// Three columns rather than flex: the 1fr side cells stay equal however wide
		// the logo or the buttons get, so the nav sits on the page's true centre
		// line instead of drifting as those change.
		// `fixed`, not `sticky`. A sticky header still sits in the document flow at
		// scroll position 0, so macOS rubber-band overscroll drags it down with the
		// page. Fixed stays pinned to the viewport through the bounce.
		//
		// Its height therefore has to be given back to the content below — both
		// sides read `--header-h` so they cannot drift apart.
		//
		// The translucency is what makes the blur read as glass — a fully opaque
		// bar would just be a black strip. `backdrop-saturate` keeps colour passing
		// through it from going grey, which is the usual giveaway of a cheap blur.
		<header className="fixed inset-x-0 top-0 z-50 grid h-[var(--header-h)] grid-cols-[1fr_auto_1fr] items-center bg-void/60 backdrop-blur-xl backdrop-saturate-150 site-gutter">
			<a
				href="/"
				aria-label="QuickEngine home"
				className="inline-flex w-fit items-center gap-2"
			>
				<Logo className="h-6 w-auto text-ink" />
				<span className="hidden font-display text-ink text-lg leading-none tracking-[-0.01em] sm:inline">
					QuickEngine
				</span>
			</a>

			<nav className="hidden items-center gap-7 lg:flex">
				{NAV_LINKS.map((link) => (
					// Duration is asymmetric on purpose: 150ms out so it answers the
					// cursor immediately, 300ms back so it settles rather than snapping.
					// Focus gets the same treatment as hover, so keyboard navigation is
					// not left without feedback.
					<a
						key={link.href}
						href={link.href}
						className="font-body text-sm text-ink no-underline opacity-100 outline-none transition-opacity duration-300 ease-out hover:opacity-55 hover:duration-150 focus-visible:opacity-55"
					>
						{link.label}
					</a>
				))}
			</nav>

			{/* col-start-3 is required, not decorative: the nav is `hidden lg:flex`, so
			    on smaller screens its cell collapses and auto-placement would pull
			    these controls into the middle column. */}
			{/* Desktop controls and the mobile hamburger swap at `lg`, the same
			    breakpoint the nav uses — so there is no width showing both or neither. */}
			<div className="col-start-3 flex items-center justify-end gap-2">
				<a
					href={`${AUTH_URL}/signin`}
					className="btn btn-secondary hidden h-[30px] items-center gap-1.5 rounded-full bg-field px-3.5 font-body font-[450] text-[13px] text-ink lg:inline-flex"
				>
					Sign in
					<CaretDownIcon size="1em" />
				</a>
				<a
					href={`${AUTH_URL}/signup`}
					className="btn btn-primary hidden h-[30px] items-center gap-1.5 rounded-full bg-invert px-3.5 font-body font-[450] text-[13px] text-on-invert lg:inline-flex"
				>
					Try QuickDash
					<ArrowUpRightIcon size="1em" />
				</a>

				{/* Mobile only. The panel it opens is not built yet, so it is
				    deliberately inert rather than wired to a handler that does nothing. */}
				<button
					type="button"
					aria-label="Open menu"
					className="-mr-2 p-2 text-ink lg:hidden"
				>
					<ListIcon size={30} />
				</button>
			</div>
		</header>
	);
}
