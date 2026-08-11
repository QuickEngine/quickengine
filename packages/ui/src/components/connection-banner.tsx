import { XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { GREY, ICE } from "../colors";

/**
 * The banner reuses the button palette rather than carrying status colours of
 * its own: recovery takes the primary pill's ICE, the offline state takes the
 * secondary pill's GREY.
 *
 * ⚠️ Which means the TEXT colour has to swap with it. GREY is a dark fill and
 * ICE is a light one, so a single text colour is unreadable on one of them — the
 * two pills already invert against each other for exactly this reason and this
 * follows them.
 *
 * Earlier attempts used real status colours (a saturated amber and green, then
 * muted sand and sage). All of them were legible and none of them belonged to
 * this site. Using the colours the buttons already use means the banner cannot
 * drift away from the palette, because it has no palette of its own.
 */
/**
 * Connection state, announced at the very top of the page.
 *
 * Lives in `@quickengine/ui` rather than in one app because losing connection is
 * not a marketing problem or an auth problem — it is the same event with the same
 * answer everywhere, and two implementations of it would drift the first time one
 * of them was tuned.
 *
 * ⚠️ `navigator.onLine` only knows whether the machine has A network, not
 * whether it can reach us. It is reliably right when it says FALSE and often
 * wrong when it says true — a captive portal, a dead uplink or an API that is
 * down all read as online. So this handles exactly the case it can actually
 * detect, and reaching the API is left to the request that failed. Do not extend
 * this into a health check; that belongs where the request is made.
 */
export function ConnectionBanner() {
	// Assumed online at mount. Starting from `navigator.onLine` would flash the
	// banner during hydration on the small number of browsers that report false
	// before the network stack has settled.
	const [offline, setOffline] = useState(false);
	// Held briefly after recovery. Without it the banner vanishes the instant the
	// connection returns, which leaves the visitor unsure whether it ever came
	// back or whether they simply stopped seeing the warning.
	const [recovered, setRecovered] = useState(false);

	useEffect(() => {
		if (!navigator.onLine) setOffline(true);

		const goOffline = () => {
			setOffline(true);
			setRecovered(false);
		};
		const goOnline = () => {
			setOffline(false);
			setRecovered(true);
		};

		window.addEventListener("offline", goOffline);
		window.addEventListener("online", goOnline);
		return () => {
			window.removeEventListener("offline", goOffline);
			window.removeEventListener("online", goOnline);
		};
	}, []);

	// The recovery notice clears itself. Keyed on `recovered` so a second
	// disconnect-reconnect restarts the clock rather than inheriting the old one.
	useEffect(() => {
		if (!recovered) return;
		const timer = setTimeout(() => setRecovered(false), 3200);
		return () => clearTimeout(timer);
	}, [recovered]);

	// ⚠️ Reset whenever the connection CHANGES, not once and for good. Dismissing
	// the offline notice means "I know, stop telling me" about that outage — it
	// should not also suppress the recovery message, and it certainly should not
	// leave the next disconnection silent.
	const [dismissed, setDismissed] = useState(false);
	useEffect(() => {
		if (offline || recovered) setDismissed(false);
	}, [offline, recovered]);

	const shown = (offline || recovered) && !dismissed;

	// ⚠️ MEASURED, never assumed. The message wraps to two lines on a narrow
	// screen, so a hard-coded height would leave the page pushed down by the wrong
	// amount at exactly the width where the banner is tallest. The observer keeps
	// it honest across rotation and resize.
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const apply = () => {
			document.documentElement.style.setProperty(
				"--banner-h",
				shown ? `${element.offsetHeight}px` : "0px",
			);
		};
		apply();
		const observer = new ResizeObserver(apply);
		observer.observe(element);
		return () => {
			observer.disconnect();
			// Unmounting with the page still pushed down would leave a permanent gap.
			document.documentElement.style.setProperty("--banner-h", "0px");
		};
	}, [shown]);

	return (
		// ⚠️ Always rendered, only translated out of view. Mounting it on demand
		// would mean the browser has nothing to animate FROM, so the first frame
		// would be the banner already in place — it would appear rather than
		// arrive. Kept out of the layout entirely so nothing below it moves.
		<div
			ref={ref}
			role="status"
			aria-live="polite"
			style={{
				backgroundColor: offline ? GREY : ICE,
				color: offline ? ICE : "#000000",
			}}
			// `z-[60]` clears the header at `z-50`. This has to sit above every piece
			// of chrome: it is the one message that is true regardless of what the
			// page underneath is doing.
			className={`fixed inset-x-0 top-0 z-[60] rounded-b-[2rem] px-5 py-2.5 text-center transition-transform duration-500 ease-out motion-reduce:transition-none ${
				shown ? "translate-y-0" : "-translate-y-full"
			}`}
		>
			{/* Inherits the colour set on the banner above, so it flips with the
			    fill instead of being stated twice. */}
			<span className="font-body font-light text-[13px]">
				{offline
					? "You're offline. Some things won't work until you reconnect."
					: "Back online."}
			</span>

			{/* ⚠️ Absolute, so the message stays centred on the PAGE rather than on
			    the space left over beside the button. In a plain flex row the text
			    would sit visibly off-centre, and it would shift again between the two
			    messages because they are different lengths. */}
			<button
				type="button"
				onClick={() => setDismissed(true)}
				aria-label="Dismiss"
				// `-translate-y-1/2` off the midpoint rather than `inset-y-0`: the
				// banner is two lines tall on a narrow screen and the control should
				// stay centred against it, not stretch.
				// Opacity rather than a colour, so one rule works on both fills — a
				// `text-black/55` would vanish against GREY.
				className="-translate-y-1/2 absolute end-4 top-1/2 rounded-full p-1 opacity-55 outline-none transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100"
			>
				<XIcon size={14} weight="bold" />
			</button>
		</div>
	);
}
