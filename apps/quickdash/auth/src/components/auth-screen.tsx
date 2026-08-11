import { ALERT, ICE } from "@quickengine/ui";
import type { ReactNode } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Legal } from "@/components/legal";

/**
 * The common shape of every auth screen: a title, an optional line under it, and
 * a body.
 *
 * Thirteen screens share this. Without it each one re-declares the same heading
 * sizes, the same shadow and the same spacing — and they drift within a week,
 * because nobody diffs a heading against twelve other files.
 *
 * Changed on 2026-08-10 from a 44px ceiling to 34px. A marketing hero can carry
 * big type because the headline IS the content; here the content is the form
 * below it, and an oversized title pushes the thing people came to use further
 * down the screen for no gain.
 *
 * ⚠️ The `textShadow` is not decoration. Every screen sits on the moving
 * gradient, and at some point in its cycle the pale band drifts behind the
 * title. Plain white does not disappear, it just goes soft for a few seconds —
 * the shadow guarantees a contrast floor at every frame.
 */
export function AuthScreen({
	title,
	subtitle,
	children,
	swap,
	home,
	consent,
	legal = true,
}: {
	title: string;
	subtitle?: ReactNode;
	children?: ReactNode;
	/** The opposite screen, shown top-right. */
	swap?: { label: string; href: string };
	/** Show the mark with no action beside it. See `AuthLayout`. */
	home?: boolean;
	/** Sign-up only: the line that forms the agreement. */
	consent?: boolean;
	legal?: boolean;
}) {
	return (
		<AuthLayout
			swap={swap}
			home={home}
			footer={legal ? <Legal consent={consent} /> : null}
		>
			<h1
				className="auth-in text-center font-display font-light text-[clamp(1.5rem,5.5vw,2.125rem)] text-white leading-tight tracking-[-0.02em]"
				style={{ textShadow: "0 2px 24px rgba(0,0,0,0.45)" }}
			>
				{title}
			</h1>

			{subtitle ? (
				<p className="auth-in auth-in-1 mt-3 text-center font-body font-light text-[0.9375rem] text-white/55">
					{subtitle}
				</p>
			) : null}

			{children ? (
				<div className="auth-in auth-in-2 mt-10">{children}</div>
			) : null}
		</AuthLayout>
	);
}

/**
 * An inline failure, in a slot that is always there.
 *
 * 🔴 THE RESERVED SPACE IS THE POINT. Every screen used to render the message
 * conditionally, so the submit button jumped down the moment a code was rejected
 * — at exactly the instant the person was moving toward it to try again. On a
 * wrong password that is mildly annoying; on a six-digit code with three
 * attempts it is a way to lose one of them to a misclick.
 *
 * The height is held for one line whether or not anything is in it. Nothing on
 * the screen moves when an error arrives or clears.
 *
 * `role="alert"` announces it without stealing focus, so a screen reader hears
 * the reason without being pulled out of the field it is in.
 *
 * No toast, here or anywhere. The message belongs against the control that
 * produced it, not in a corner on a timer that expires while it is being read.
 */
export function AuthError({ children }: { children?: ReactNode }) {
	return (
		<div role="alert" className="min-h-[1.0625rem]">
			{children ? (
				<p
					style={{ color: ALERT }}
					// Rises 2px as it arrives. A message that simply appears in reserved
					// space can be missed entirely, because nothing about the screen
					// changed except some text that was not there a frame ago.
					className="auth-error text-center font-body font-light text-[0.8125rem] leading-[1.0625rem]"
				>
					{children}
				</p>
			) : null}
		</div>
	);
}

/** The link style used inside subtitles, so they match across all thirteen. */
export const authLink =
	"text-white underline-offset-[4px] transition-colors duration-300 hover:underline hover:decoration-white/60";

/** The field style. Filled rather than outlined — an outlined input over the
 *  moving gradient is legible for about half of its cycle. */
export const authField =
	"h-12 w-full rounded-full border border-white/15 bg-black/45 px-5 font-body font-light text-[0.9375rem] text-white outline-none backdrop-blur-sm transition-colors duration-300 placeholder:text-white/35 focus:border-white/35";

/**
 * A full-width choice row: the OAuth buttons, the email option, and the two
 * methods offered on `/secure`.
 *
 * 🔴 Extracted 2026-08-10 because this exact class string was copy-pasted into
 * `secure.tsx` as a local `row` constant. When the option rows were centred, one
 * copy was fixed and the other was not — the two screens then disagreed about
 * where the label in an identical-looking control belongs, which is precisely
 * the drift a duplicated style string guarantees. There is one definition now.
 *
 * ⚠️ `justify-center`: the icon and label centre as one group, matching the
 * submit button below them. Left-aligned they read as a different kind of
 * control stacked under the same heading.
 *
 * `relative` is load-bearing — the "Last used" badge is positioned against it.
 */
export const authOptionRow =
	"relative inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border bg-black/45 px-5 font-body font-light text-[0.9375rem] backdrop-blur-sm transition-colors duration-300 ease-out hover:bg-black/65 hover:duration-150 focus-visible:bg-black/65 disabled:opacity-45";

/** The filled confirm button that ends most of these screens. */
export const authSubmit =
	"relative inline-flex h-12 w-full items-center justify-center rounded-full font-body font-normal text-[0.9375rem] transition-opacity duration-300 ease-out hover:opacity-85 disabled:opacity-40";

/**
 * The primary action, matching the marketing site's `Pill` exactly: ice fill,
 * black text, and the black disc with an arrow in it.
 *
 * It carried the marketing site's arrow chip briefly and it was wrong here: on
 * a page where the button is the only action and already spans the column, the
 * disc adds a second focal point to a control that needs none. The marketing
 * pills sit in a row of competing links and earn it; these do not.
 *
 * Disabled is a muted fill rather than a dimmed one, so "not yet" reads as a
 * state rather than as a rendering fault.
 */
export function AuthButton({
	children,
	href,
	type = "submit",
	disabled,
	onClick,
}: {
	children: ReactNode;
	/** Renders an anchor instead of a button. */
	href?: string;
	type?: "submit" | "button";
	disabled?: boolean;
	onClick?: () => void;
}) {
	const fill = disabled
		? { backgroundColor: `${ICE}1F`, color: `${ICE}80` }
		: { backgroundColor: ICE, color: "#000000" };

	if (href) {
		return (
			<a href={href} style={fill} className={`${authSubmit} no-underline`}>
				{children}
			</a>
		);
	}

	return (
		<button
			type={type === "submit" ? "submit" : "button"}
			disabled={disabled}
			onClick={onClick}
			style={fill}
			className={authSubmit}
		>
			{children}
		</button>
	);
}
