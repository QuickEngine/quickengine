import { GREY, ICE } from "@quickengine/ui";
import { WaveBackground } from "@quickengine/ui/wave-background";
import type { ReactNode } from "react";

/**
 * Error and not-found screens for the account app, in TWO contexts.
 *
 * 🔴 THE CONTEXT MATTERS, and this is not cosmetic.
 *
 * The account app contains onboarding and the account itself. Somebody hitting a
 * 404 or a crash *during onboarding* has no workspace yet, so an error screen
 * offering "go to your account" is offering a place that does not exist for them
 * — and if it ever rendered the dashboard shell, it would show chrome for a
 * product they have not finished creating.
 *
 * So there are two shells and one rule: **an error inherits the surface it
 * happened on.** Break onboarding, you get onboarding's gradient and the only
 * way out is back into onboarding. Break the account, you get the account's.
 *
 * ⚠️ We are NOT making an onboarding app. Nobody does that, and it would mean a
 * second deployment for four screens. One app, two contexts, chosen by path.
 *
 * ⚠️ The root `beforeLoad` already redirects to `/onboarding` when it is
 * incomplete, so a stray URL cannot drop somebody into the shell. These screens
 * exist for what that guard cannot catch: a genuine crash, an unreachable API,
 * or a 404 once onboarding is finished.
 */

function Frame({
	gradient,
	title,
	message,
	action,
}: {
	gradient: boolean;
	title: string;
	message: string;
	action: ReactNode;
}) {
	return (
		<div className="relative isolate flex min-h-svh flex-col items-center justify-center bg-black px-6 text-center">
			{gradient ? <WaveBackground /> : null}
			<div className="relative mx-auto w-full max-w-[30rem]">
				<h1 className="font-display font-light text-[clamp(1.5rem,3.4vw,2rem)] text-white leading-[1.15] tracking-[-0.02em]">
					{title}
				</h1>
				<p className="mt-4 font-body font-light text-[0.9375rem] text-white/55 leading-[1.55]">
					{message}
				</p>
				<div className="mt-8 flex flex-col items-center gap-3">{action}</div>
			</div>
		</div>
	);
}

function Primary({
	children,
	href,
	onClick,
}: {
	children: ReactNode;
	href?: string;
	onClick?: () => void;
}) {
	const className =
		"inline-flex h-11 w-full items-center justify-center rounded-full px-6 font-body font-normal text-[0.9375rem] no-underline transition-opacity duration-300 ease-out hover:opacity-85";
	const style = { backgroundColor: ICE, color: "#000000" };
	return href ? (
		<a href={href} style={style} className={className}>
			{children}
		</a>
	) : (
		<button type="button" onClick={onClick} style={style} className={className}>
			{children}
		</button>
	);
}

function Secondary({ children, href }: { children: ReactNode; href: string }) {
	return (
		<a
			href={href}
			style={{ backgroundColor: GREY, color: ICE }}
			className="inline-flex h-11 w-full items-center justify-center rounded-full px-6 font-body font-light text-[0.9375rem] no-underline transition-opacity duration-300 ease-out hover:opacity-85"
		>
			{children}
		</a>
	);
}

/**
 * True while the visitor is inside onboarding.
 *
 * ⚠️ Read from `window.location` rather than the router. An error component can
 * render when routing itself failed, and reaching for router state at that
 * moment is how an error screen throws its own error.
 */
function inOnboarding(): boolean {
	return (
		typeof window !== "undefined" &&
		window.location.pathname.startsWith("/onboarding")
	);
}

export function NotFoundScreen() {
	const onboarding = inOnboarding();
	return (
		<Frame
			gradient={onboarding}
			title="That page isn't here."
			message={
				onboarding
					? "The link may be old. Your setup is exactly where you left it."
					: "The link may be old, or the page may have moved."
			}
			action={
				onboarding ? (
					<Primary href="/onboarding">Back to setup</Primary>
				) : (
					<Primary href="/">Back to your account</Primary>
				)
			}
		/>
	);
}

export function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
	const onboarding = inOnboarding();
	return (
		<Frame
			gradient={onboarding}
			title="Something went wrong on our end."
			message={
				onboarding
					? "This one is ours, not yours. Nothing has been created yet, so trying again costs you nothing."
					: "This one is ours, not yours. Try again in a moment."
			}
			action={
				<>
					<Primary onClick={reset}>Try again</Primary>
					{onboarding ? null : (
						<Secondary href="/">Back to your account</Secondary>
					)}
				</>
			}
		/>
	);
}

/**
 * The pending frame.
 *
 * Deliberately near-empty: a route here resolves in milliseconds, and a spinner
 * that appears and vanishes inside one frame reads as a flicker rather than as
 * loading. Same decision the auth app made.
 */
export function LoadingScreen() {
	return (
		<div className="relative isolate min-h-svh bg-black">
			{inOnboarding() ? <WaveBackground /> : null}
		</div>
	);
}
