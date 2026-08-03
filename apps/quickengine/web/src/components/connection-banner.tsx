import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

/**
 * A bar that drops from the top when the connection goes, and turns green and
 * retracts when it comes back.
 *
 * This is the honest form of "offline" for this site. A dedicated offline
 * *page* could never render — there is no service worker, so a cold load
 * without a connection gets the browser's own error screen, and a warm page
 * has nothing to fetch and simply keeps working. What can genuinely be told is
 * that the connection dropped while someone was already here.
 *
 * Three states rather than two. Coming back is worth announcing, briefly:
 * without a confirmation the bar just vanishes, and the visitor is left unsure
 * whether it recovered or they lost the message.
 *
 * ⚠️ `navigator.onLine` reports whether there is a network interface, not
 * whether the internet is reachable — a captive wifi portal reads as online.
 * That is acceptable here, where the bar is advisory. Anything that must know
 * for certain has to attempt a request.
 */

/** How long the restored bar stays up before retracting. */
const RESTORED_MS = 2800;

/**
 * The bar itself, and the curve beneath it.
 *
 * The rounded edge is not on the banner — it is the page below curving away
 * from it, so the banner colour wraps around the two corners. That is Stripe's
 * trick: a strip of page-coloured surface with rounded top corners, laid over
 * the banner, leaving the banner visible only in the two notches the radius
 * cuts out.
 *
 * The strip's height matches the radius exactly. Any less and the corners get
 * clipped mid-arc; any more and a band of flat page colour appears above the
 * content, which reads as a gap.
 */
const BAR_HEIGHT = "2.25rem";
const CURVE = "0.75rem";
/** What the header offsets by: the bar plus its curve. */
const BANNER_HEIGHT = "3rem";

type Status = "online" | "offline" | "restored" | "stale";

/**
 * A deploy replaced the hashed chunks this tab is holding references to, so the
 * next lazy route it asks for is a 404.
 *
 * There is no event for this — it surfaces as a failed dynamic import, and the
 * message differs per engine, so the match is deliberately loose. A false
 * positive costs a reload prompt; a false negative leaves someone stuck on a
 * page whose navigation silently does nothing.
 */
const looksLikeStaleChunk = (message: string) =>
	/dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(
		message,
	);

export function ConnectionBanner() {
	const [status, setStatus] = useState<Status>("online");

	useEffect(() => {
		if (!navigator.onLine) setStatus("offline");

		const onOffline = () => setStatus("offline");
		const onOnline = () =>
			setStatus((previous) =>
				// Only celebrate a recovery that followed an actual drop. Some
				// browsers fire `online` spuriously on wake, and a green bar for a
				// disconnection nobody saw is just noise.
				previous === "offline" ? "restored" : "online",
			);

		window.addEventListener("offline", onOffline);
		window.addEventListener("online", onOnline);
		return () => {
			window.removeEventListener("offline", onOffline);
			window.removeEventListener("online", onOnline);
		};
	}, []);

	useEffect(() => {
		const onError = (event: ErrorEvent) => {
			if (looksLikeStaleChunk(event.message)) setStatus("stale");
		};
		const onRejection = (event: PromiseRejectionEvent) => {
			const reason = event.reason;
			const message =
				typeof reason === "string" ? reason : (reason?.message ?? "");
			if (looksLikeStaleChunk(message)) setStatus("stale");
		};

		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);
		return () => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onRejection);
		};
	}, []);

	useEffect(() => {
		if (status !== "restored") return;
		const timer = setTimeout(() => setStatus("online"), RESTORED_MS);
		return () => clearTimeout(timer);
	}, [status]);

	const visible = status !== "online";

	// The header is fixed at the top, so it has to move out of the way rather
	// than be covered. A custom property on the root lets it react without the
	// two components knowing about each other.
	useEffect(() => {
		document.documentElement.style.setProperty(
			"--banner-h",
			visible ? BANNER_HEIGHT : "0px",
		);
	}, [visible]);

	const restored = status === "restored";
	const stale = status === "stale";

	// One bar, three messages. A second fixed element at the top would have to
	// negotiate position and z-order with this one for a state that cannot
	// usefully coexist with it anyway.
	const tone = restored
		? "bg-[#16a34a] text-white"
		: stale
			? "bg-[#2563eb] text-white"
			: "bg-[#d97706] text-white";

	const label = restored ? "Back online" : stale ? "Update ready" : "Offline";

	const message = restored
		? "Your connection is back."
		: stale
			? "A new version of the site has shipped. Reload to pick it up."
			: "You're not connected. Some things won't work until you are.";

	return (
		<div
			// Announced politely: a connection change is worth knowing about but
			// should not interrupt whatever is being read.
			role="status"
			aria-live="polite"
			className={`fixed inset-x-0 top-0 z-[60] transition-transform duration-300 ease-out ${
				visible ? "translate-y-0" : "-translate-y-full"
			} ${tone}`}
		>
			<div
				className="page-gutter flex w-full items-center gap-4"
				style={{ height: BAR_HEIGHT }}
			>
				<span className="flex shrink-0 items-center gap-2 font-medium text-[12px]">
					<span className="size-1.5 rounded-full bg-white" />
					{label}
				</span>

				<p className="min-w-0 flex-1 truncate text-center text-[12px]">
					{message}
				</p>

				{/* Reload rather than a fake "retry": there is no request in flight to
				    repeat, so the only meaningful recovery is fetching the page again
				    once there is a connection. Hidden on the restored bar, which needs
				    no action. */}
				<button
					type="button"
					onClick={() => window.location.reload()}
					className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 font-medium text-[12px] outline-none transition-opacity hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white ${
						restored ? "invisible" : ""
					}`}
				>
					<ArrowClockwiseIcon size={12} weight="bold" />
					Reload
				</button>
			</div>

			{/* The curve. Page-coloured, rounded at the top, so the banner shows
			    through only at the two corners. */}
			<div
				className="w-full rounded-t-xl bg-background"
				style={{ height: CURVE }}
			/>
		</div>
	);
}
